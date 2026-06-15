import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Node, Edge } from '@vue-flow/core'
import { ElMessage } from 'element-plus'
import { useAIStore } from '@/stores/ai'
import { useAssetStore } from '@/stores/asset'
import { ensureRemoteAssetUrl } from '@/services/imageHost'
import { persistImage } from '@/services/imageStorage'
import { findImageTemplate, type ImageProviderKind } from '@/services/imageModelTemplates'

export interface NodeData {
  label: string
  status: 'idle' | 'running' | 'completed' | 'error'
  progress?: number
  output?: any
  error?: string
  // 节点输出
  outputImage?: string
  outputVideo?: string
  outputAudio?: string
  outputText?: string
  // AI绘图节点参数
  prompt?: string
  negativePrompt?: string
  size?: string
  style?: string
  seed?: number
  // AI视频节点参数
  providerId?: string
  model?: string
  ratio?: string
  resolution?: string
  duration?: number
  fps?: number
  generateAudio?: boolean
  inputImage?: string
  inputVideo?: string
  taskId?: string
  // 本地上传素材（data URL，跨会话持久化）
  _uploads?: Array<{ id: string; type: 'image' | 'video' | 'audio'; url: string; name: string }>
  /** 参考图角色标签：assetId → subject/style/scene。subject 优先序最高。 */
  refTags?: Record<string, RefImageTag>
}

export type RefImageTag = 'subject' | 'style' | 'scene'

const POLL_INTERVAL_MS = 3000
const MAX_RUNTIME_MS = 30 * 60 * 1000 // 30 分钟

// ============ 多项目持久化 ============
//   每个项目的画布独立存：key 长这样 `nodeCanvas:{projectId}`
//   meta 存当前打开的是哪个项目 ID：key = `currentProjectId`
//   迁移：老版本只有一个全局 `nodeCanvas` key，启动时搬到 `nodeCanvas:default`
const PROJECT_PERSIST_PREFIX = 'nodeCanvas:'
const CURRENT_PROJECT_KEY = 'currentProjectId'
const DEFAULT_PROJECT_ID = 'default'
const LEGACY_PERSIST_KEY = 'nodeCanvas'

// 持久化时丢弃的运行时字段（保存这些没意义，重启后状态全是过期数据）
const RUNTIME_FIELDS = ['status', 'progress', 'error', 'taskId'] as const

interface RunningTask {
  intervalId: number
  startedAt: number
}

export const useNodeStore = defineStore('node', () => {
  const nodes = ref<Node[]>([])
  const edges = ref<Edge[]>([])
  const selectedNodeId = ref<string | null>(null)
  const runningTasks = new Map<string, RunningTask>()
  // 图片节点的假进度定时器（不同于视频轮询，单独管理）
  const imageTimers = new Map<string, number>()
  // 图片节点正在跑的 AbortController（取消用，同一个节点同时只能有一个）
  const imageAborts = new Map<string, AbortController>()
  // 标记被用户主动取消的图片节点；catch 路径据此判断不要弹错误 toast
  const cancelledImageNodes = new Set<string>()
  const initialized = ref(false)
  const currentProjectId = ref<string | null>(null)

  /** 设置节点错误状态并弹出 toast */
  function failNode(nodeId: string, error: string) {
    updateNodeData(nodeId, { status: 'error', error })
    ElMessage.error(error)
  }

  // ============ 持久化 ============
  let persistTimer: number | null = null
  function persist() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = window.setTimeout(async () => {
      const electronStore = window.electronAPI?.store
      if (!electronStore) return
      const pid = currentProjectId.value
      if (!pid) return // 没设当前项目就不写盘，避免污染
      try {
        // 清洗：剥掉运行时字段（status/progress/error/taskId），重启后才不会卡在 running
        const cleanNodes = nodes.value.map((n) => {
          const data = { ...(n.data || {}) } as Record<string, any>
          for (const k of RUNTIME_FIELDS) delete data[k]
          return { id: n.id, type: n.type, position: n.position, data }
        })
        const payload = JSON.stringify({ nodes: cleanNodes, edges: edges.value })
        await electronStore.set(PROJECT_PERSIST_PREFIX + pid, payload)
        await electronStore.set(CURRENT_PROJECT_KEY, pid)
      } catch (err) {
        console.warn('persist nodes failed:', err)
      }
    }, 400)
  }

  /** 立刻写盘（不等 debounce），用于切项目前确保旧项目最新数据落盘。 */
  async function flushPersist() {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    const electronStore = window.electronAPI?.store
    if (!electronStore) return
    const pid = currentProjectId.value
    if (!pid) return
    try {
      const cleanNodes = nodes.value.map((n) => {
        const data = { ...(n.data || {}) } as Record<string, any>
        for (const k of RUNTIME_FIELDS) delete data[k]
        return { id: n.id, type: n.type, position: n.position, data }
      })
      const payload = JSON.stringify({ nodes: cleanNodes, edges: edges.value })
      await electronStore.set(PROJECT_PERSIST_PREFIX + pid, payload)
      await electronStore.set(CURRENT_PROJECT_KEY, pid)
    } catch (err) {
      console.warn('flushPersist failed:', err)
    }
  }

  /** 读盘一个项目的 nodes/edges，写到 store 里。不存在则置空。 */
  async function _loadProjectData(projectId: string) {
    const electronStore = window.electronAPI?.store
    if (!electronStore) {
      nodes.value = []
      edges.value = []
      return
    }
    try {
      const raw = await electronStore.get(PROJECT_PERSIST_PREFIX + projectId)
      if (!raw) {
        nodes.value = []
        edges.value = []
        return
      }
      const parsed = JSON.parse(raw)
      nodes.value = Array.isArray(parsed?.nodes)
        ? parsed.nodes.map((n: any) => ({
            ...n,
            data: { ...(n.data || {}), status: 'idle', progress: 0 },
          }))
        : []
      edges.value = Array.isArray(parsed?.edges) ? parsed.edges : []
    } catch (err) {
      console.warn('load project failed:', err)
      nodes.value = []
      edges.value = []
    }
  }

  /** 启动入口：迁移旧 key + 装载当前项目。 */
  async function init() {
    if (initialized.value) return
    initialized.value = true
    const electronStore = window.electronAPI?.store
    if (!electronStore) {
      currentProjectId.value = DEFAULT_PROJECT_ID
      return
    }

    // 迁移：老版本只有 `nodeCanvas` 一个 key，搬到 `nodeCanvas:default`
    try {
      const legacy = await electronStore.get(LEGACY_PERSIST_KEY)
      if (legacy) {
        const existingDefault = await electronStore.get(PROJECT_PERSIST_PREFIX + DEFAULT_PROJECT_ID)
        if (!existingDefault) {
          await electronStore.set(PROJECT_PERSIST_PREFIX + DEFAULT_PROJECT_ID, legacy)
        }
        await electronStore.delete(LEGACY_PERSIST_KEY)
      }
    } catch (err) {
      console.warn('legacy migration failed:', err)
    }

    // 读上次打开的项目 ID
    let pid: string = DEFAULT_PROJECT_ID
    try {
      const stored = await electronStore.get(CURRENT_PROJECT_KEY)
      if (stored && typeof stored === 'string') pid = stored
    } catch {}

    currentProjectId.value = pid
    await _loadProjectData(pid)
  }

  /** 切换到已有项目：先把当前项目落盘，再加载目标项目。 */
  async function loadProject(projectId: string) {
    if (currentProjectId.value === projectId) return
    await flushPersist()
    currentProjectId.value = projectId
    await _loadProjectData(projectId)
    // 把"当前项目 ID"立刻入盘，避免重启又跳回旧项目
    const electronStore = window.electronAPI?.store
    if (electronStore) {
      try { await electronStore.set(CURRENT_PROJECT_KEY, projectId) } catch {}
    }
  }

  /** 新建项目：把旧项目落盘，切到新 ID，清空画布。 */
  async function createProject(projectId: string) {
    await flushPersist()
    currentProjectId.value = projectId
    nodes.value = []
    edges.value = []
    // 立刻写一份空白的入盘，保证新项目 key 存在；并标记为当前项目
    const electronStore = window.electronAPI?.store
    if (electronStore) {
      try {
        await electronStore.set(
          PROJECT_PERSIST_PREFIX + projectId,
          JSON.stringify({ nodes: [], edges: [] })
        )
        await electronStore.set(CURRENT_PROJECT_KEY, projectId)
      } catch {}
    }
  }

  /** 删除项目：从盘上抹掉该项目数据；若删的是当前项目，currentProjectId 置为 null。 */
  async function deleteProject(projectId: string) {
    const electronStore = window.electronAPI?.store
    if (electronStore) {
      try { await electronStore.delete(PROJECT_PERSIST_PREFIX + projectId) } catch {}
    }
    if (currentProjectId.value === projectId) {
      currentProjectId.value = null
      nodes.value = []
      edges.value = []
    }
  }

  // 任何节点/边的深度变化都自动入盘（debounce 在 persist 里做）
  // 必须放在 init 后注册，避免初始化时无意义的回写
  watch([nodes, edges], () => {
    if (initialized.value) persist()
  }, { deep: true })

  const selectedNode = computed(() => {
    if (!selectedNodeId.value) return null
    return nodes.value.find((n) => n.id === selectedNodeId.value)
  })

  function addNode(node: Node) {
    nodes.value.push(node)
  }

  function removeNode(nodeId: string) {
    cancelExecution(nodeId)
    nodes.value = nodes.value.filter((n) => n.id !== nodeId)
    edges.value = edges.value.filter((e) => e.source !== nodeId && e.target !== nodeId)
  }

  function updateNodeData(nodeId: string, data: Partial<NodeData>) {
    const node = nodes.value.find((n) => n.id === nodeId)
    if (node) {
      node.data = { ...node.data, ...data }
    }
  }

  function selectNode(nodeId: string | null) {
    selectedNodeId.value = nodeId
  }

  function addEdge(edge: Edge) {
    edges.value.push(edge)
  }

  function removeEdge(edgeId: string) {
    edges.value = edges.value.filter((e) => e.id !== edgeId)
  }

  /**
   * 解析视频节点的参考素材：
   * - 图片：优先取上游 ai-image 节点的 outputImage，否则用本节点 inputImage
   * - 视频：本节点 inputVideo（视频编辑场景下用户上传的源视频）
   */
  function resolveAssets(nodeId: string): { imageUrl?: string; videoUrl?: string } {
    let imageUrl: string | undefined
    const upstreamEdges = edges.value.filter((e) => e.target === nodeId)
    for (const edge of upstreamEdges) {
      const src = nodes.value.find((n) => n.id === edge.source)
      if (src?.type === 'ai-image' && src.data?.status === 'completed' && src.data?.outputImage) {
        imageUrl = src.data.outputImage
        break
      }
    }
    const self = nodes.value.find((n) => n.id === nodeId)
    if (!imageUrl && self?.data?.inputImage) imageUrl = self.data.inputImage
    const videoUrl = self?.data?.inputVideo || undefined
    return { imageUrl, videoUrl }
  }

  function cancelExecution(nodeId: string) {
    const t = runningTasks.get(nodeId)
    if (t) {
      clearInterval(t.intervalId)
      runningTasks.delete(nodeId)
    }
    const ti = imageTimers.get(nodeId)
    if (ti) {
      clearInterval(ti)
      imageTimers.delete(nodeId)
    }
  }

  function cancelImageNode(nodeId: string) {
    const ctrl = imageAborts.get(nodeId)
    if (ctrl) {
      cancelledImageNodes.add(nodeId)
      ctrl.abort()
    }
    imageAborts.delete(nodeId)
    const t = imageTimers.get(nodeId)
    if (t) {
      window.clearInterval(t)
      imageTimers.delete(nodeId)
    }
    // 如果之前有图，保留 outputImage；状态回 idle（或 completed 如果之前是 completed 状态）
    const node = nodes.value.find((n) => n.id === nodeId)
    const priorImage = (node?.data as NodeData | undefined)?.outputImage
    updateNodeData(nodeId, {
      status: priorImage ? 'completed' : 'idle',
      progress: undefined,
      error: undefined,
    })
  }

  async function executeNode(nodeId: string) {
    const node = nodes.value.find((n) => n.id === nodeId)
    if (!node) return

    console.log('[executeNode] 触发', { nodeId, type: node.type, providerId: node.data?.providerId, model: node.data?.model })

    if (node.type === 'ai-image') {
      console.log('[executeNode] → 走 executeImageNode')
      return executeImageNode(nodeId)
    }
    if (node.type === 'ai-text') {
      console.log('[executeNode] → 走 executeTextNode')
      return executeTextNode(nodeId)
    }
    if (node.type !== 'ai-video') {
      console.log('[executeNode] → 走 executeMock（占位）')
      return executeMock(nodeId)
    }

    const aiStore = useAIStore()
    const data = node.data as NodeData
    const providerId = data.providerId || aiStore.defaultProviderId
    if (!providerId) {
      failNode(nodeId, '请先在「设置」中添加中转站')
      return
    }
    const providerConfig = aiStore.getProviderConfig(providerId)
    if (!providerConfig) {
      failNode(nodeId, '原中转站已被删除，请在节点上重新选择')
      return
    }
    const provider = aiStore.getProvider(providerId)
    const apiKey = providerConfig.apiKey
    if (!provider || !apiKey) {
      failNode(nodeId, `「${providerConfig.name}」未配置 API Key`)
      return
    }

    cancelExecution(nodeId)

    let { imageUrl, videoUrl } = resolveAssets(nodeId)
    const modelId = data.model || 'doubao-seedance-2-0-260128'
    const isOmni = modelId === 'gemini-omni'

    // 合并所有参考图：上游 ai-image 节点输出 + 节点 inputImages 多图列表，去重后保留顺序
    const refImages: string[] = []
    if (imageUrl) refImages.push(imageUrl)
    const inputImagesList = (data as any).inputImages
    if (Array.isArray(inputImagesList)) {
      for (const u of inputImagesList as string[]) {
        if (u && !refImages.includes(u)) refImages.push(u)
      }
    }

    // 视频素材只有 gemini-omni 支持，其他模型直接拒绝（避免静默丢素材）
    if (videoUrl && !isOmni) {
      updateNodeData(nodeId, {
        status: 'error',
        error: '当前模型不支持视频编辑，请切换到 Gemini Omni',
      })
      return
    }

    // mode 路由（按模型协议分流）：
    //   gemini-omni：t2v / r2v（参考图/素材） / edit（视频编辑）
    //   seedance 系：t2v / reference_material（火山方舟兼容入参）
    //   都没参考素材 → t2v
    const mode: 't2v' | 'reference_material' | 'r2v' | 'edit' = videoUrl
      ? 'edit'
      : refImages.length > 0
      ? isOmni
        ? 'r2v'
        : 'reference_material'
      : 't2v'
    // 清理 @[name](id) 标记
    const promptText = (data.prompt || '').replace(/@\[[^\]]*\]\([^)]*\)/g, '').trim()

    if (!promptText && mode === 't2v') {
      failNode(nodeId, '请输入提示词')
      return
    }
    if (mode === 'edit' && !promptText) {
      failNode(nodeId, '视频编辑需要写明修改意见')
      return
    }

    updateNodeData(nodeId, {
      status: 'running',
      progress: 0,
      error: undefined,
      outputVideo: undefined,
    })

    // 本地 blob:/data: URL 视频 API 拿不到，先全部上传到图床换公网 URL
    for (let i = 0; i < refImages.length; i++) {
      const u = refImages[i]
      if (u && !u.startsWith('http')) {
        try {
          refImages[i] = await ensureRemoteAssetUrl(u, apiKey)
        } catch (err) {
          updateNodeData(nodeId, {
            status: 'error',
            error: `第 ${i + 1} 张参考图上传失败：${err instanceof Error ? err.message : ''}`,
          })
          return
        }
      }
    }
    imageUrl = refImages[0]
    if (videoUrl && !videoUrl.startsWith('http')) {
      try {
        videoUrl = await ensureRemoteAssetUrl(videoUrl, apiKey)
      } catch (err) {
        updateNodeData(nodeId, {
          status: 'error',
          error: err instanceof Error ? err.message : '源视频上传失败',
        })
        return
      }
    }

    // 构造 content 数组：edit/reference_material/r2v 走 content 通道，t2v 不带
    // 多张参考图按顺序各 push 一条 image_url 项（火山方舟 reference_material 协议要求）
    const content: import('@/services/ai-provider').ContentItem[] = []
    if (mode !== 't2v') {
      if (promptText) content.push({ type: 'text', text: promptText })
      if (videoUrl) {
        content.push({
          type: 'video_url',
          video_url: videoUrl,
          role: 'source_video',
          name: '1',
        })
      }
      refImages.forEach((u, idx) => {
        content.push({
          type: 'image_url',
          image_url: u,
          role: 'reference_image',
          name: String(videoUrl ? idx + 2 : idx + 1),
        })
      })
    }

    let taskId: string
    try {
      const res = await provider.createTask({
        model: modelId,
        prompt: promptText,
        mode,
        ...(content.length ? { content } : {}),
        image_urls: refImages.length > 0 ? refImages : undefined,
        ratio: data.ratio,
        resolution: data.resolution,
        duration: data.duration,
        fps: data.fps,
        generate_audio: data.generateAudio,
      })
      taskId = res.taskId
    } catch (err) {
      failNode(nodeId, err instanceof Error ? err.message : '创建任务失败')
      return
    }

    updateNodeData(nodeId, { taskId })

    const startedAt = Date.now()
    // 估算总时长：视频秒数 × 15（保守估计，5s 视频约 75s 出，10s 视频约 150s 出）
    const estimatedTotalMs = (data.duration || 5) * 15 * 1000

    const intervalId = window.setInterval(async () => {
      // 超时保护
      if (Date.now() - startedAt > MAX_RUNTIME_MS) {
        cancelExecution(nodeId)
        failNode(nodeId, '生成超时（超过 10 分钟）')
        return
      }

      try {
        const status = await provider.getTaskStatus(taskId)

        // 进度计算：网关给真值优先；否则按已耗时估算（cap 95，留 5% 给收尾）
        const elapsed = Date.now() - startedAt
        const timeProgress = Math.min(95, Math.floor((elapsed / estimatedTotalMs) * 95))
        const currentNode = nodes.value.find((n) => n.id === nodeId)
        const currentProgress = (currentNode?.data?.progress as number) || 0
        let nextProgress = currentProgress
        if (typeof status.progress === 'number' && status.progress > 0 && status.progress < 100) {
          nextProgress = Math.max(currentProgress, status.progress)
        } else if (status.status === 'processing' || status.status === 'pending') {
          nextProgress = Math.max(currentProgress, timeProgress)
        }

        if (status.status === 'completed') {
          cancelExecution(nodeId)
          updateNodeData(nodeId, {
            status: 'completed',
            progress: 100,
            outputVideo: status.videoUrl,
          })
          // 推到全局资产库 / 历史
          if (status.videoUrl) {
            useAssetStore().addAsset({
              type: 'video',
              url: status.videoUrl,
              prompt: promptText,
              model: modelId,
              providerId,
              providerName: providerConfig.name,
              nodeId,
              nodeType: 'ai-video',
              projectId: currentProjectId.value || undefined,
              ratio: data.ratio,
              resolution: data.resolution,
              duration: data.duration,
            })
          }
        } else if (status.status === 'failed') {
          cancelExecution(nodeId)
          updateNodeData(nodeId, {
            status: 'error',
            error: status.error || '生成失败',
          })
        } else {
          updateNodeData(nodeId, { progress: nextProgress })
        }
      } catch (err) {
        cancelExecution(nodeId)
        updateNodeData(nodeId, {
          status: 'error',
          error: err instanceof Error ? err.message : '查询任务失败',
        })
      }
    }, POLL_INTERVAL_MS) as unknown as number

    runningTasks.set(nodeId, { intervalId, startedAt })
  }

  /** 图片节点执行：GeekNow 是同步 API，请求一次直接拿到图，不走轮询 */
  async function executeImageNode(nodeId: string) {
    const node = nodes.value.find((n) => n.id === nodeId)
    if (!node) return
    if (imageAborts.has(nodeId)) {
      // 已经在跑，忽略重复点击
      return
    }

    const aiStore = useAIStore()
    const data = node.data as NodeData
    const providerId = data.providerId || aiStore.defaultImageProviderId
    console.log('[executeImageNode] providerId =', providerId, 'defaultImage =', aiStore.defaultImageProviderId, 'imageProviders =', aiStore.imageProviders.map(p => ({ id: p.id, name: p.name, hasKey: !!p.apiKey })))
    if (!providerId) {
      updateNodeData(nodeId, {
        status: 'error',
        error: '请先在「设置」里添加图片中转站',
      })
      return
    }
    const providerConfig = aiStore.getProviderConfig(providerId)
    if (!providerConfig) {
      updateNodeData(nodeId, {
        status: 'error',
        error: '原图片中转站已被删除，请重新选择',
      })
      return
    }
    if (providerConfig.type !== 'image') {
      updateNodeData(nodeId, {
        status: 'error',
        error: '所选中转站不是图片类型',
      })
      return
    }
    const provider = aiStore.getImageProvider(providerId)
    if (!provider || !providerConfig.apiKey) {
      updateNodeData(nodeId, {
        status: 'error',
        error: `「${providerConfig.name}」未配置 API Key`,
      })
      return
    }

    // 清理 prompt 里的 @[name](id) 标记，避免 AI 按文字生成而非按参考图
    const promptText = (data.prompt || '').replace(/@\[[^\]]*\]\([^)]*\)/g, '').trim()
    if (!promptText) {
      failNode(nodeId, '请输入提示词（不含 @ 标记的有效文字）')
      return
    }

    // 参考图：inputImages（多张数组）优先，否则兜底 inputImage（单张）
    const refImages: string[] = Array.isArray((data as any).inputImages) && (data as any).inputImages.length
      ? (data as any).inputImages
      : data.inputImage
        ? [data.inputImage]
        : []
    console.log('[executeImageNode] prompt:', promptText, 'refImages:', refImages.length)

    cancelExecution(nodeId)

    const abortCtrl = new AbortController()
    imageAborts.set(nodeId, abortCtrl)

    updateNodeData(nodeId, {
      status: 'running',
      progress: 5,
      error: undefined,
    })

    // 异步路径会通过 onProgress 报真实进度；同步路径只能由 provider 内部
    // 在 10/30/100 三个点上报。这两种情况都比之前的"假进度 setInterval"准。
    let realProgressReceived = false
    const fallbackTimer = window.setInterval(() => {
      if (realProgressReceived) return
      const cur = nodes.value.find((n) => n.id === nodeId)
      const p = (cur?.data?.progress as number) || 0
      if (p < 90) updateNodeData(nodeId, { progress: Math.min(90, p + 5) })
    }, 800)
    imageTimers.set(nodeId, fallbackTimer)

    try {
      const modelMeta = providerConfig.models.find((m) => m.id === data.model)
      const tpl = findImageTemplate(data.model || '', (providerConfig.kind || undefined) as ImageProviderKind | undefined)
      // 默认 true：缺字段视为「老模板没标，按支持算」
      const allowSeed = (tpl?.supportsSeed ?? modelMeta?.supportsSeed) !== false
      const allowNegative = (tpl?.supportsNegativePrompt ?? modelMeta?.supportsNegativePrompt) !== false
      const result = await provider.generateImage({
        model: data.model || providerConfig.models[0]?.id || 'gemini-2.5-flash-image-preview',
        prompt: promptText,
        imageUrls: refImages,
        aspectRatio: data.ratio || '1:1',
        imageSize: modelMeta?.supportsImageSize2K ? '2K' : '1K',
        seed: allowSeed && typeof data.seed === 'number' && data.seed > 0 ? data.seed : undefined,
        negativePrompt: allowNegative && data.negativePrompt && data.negativePrompt.trim() ? data.negativePrompt.trim() : undefined,
        n: 1,
        signal: abortCtrl.signal,
        onProgress: ({ progress }) => {
          realProgressReceived = true
          updateNodeData(nodeId, { progress: Math.min(99, Math.max(0, progress)) })
        },
      })
      window.clearInterval(fallbackTimer)
      imageTimers.delete(nodeId)
      const rawUrls = result.imageUrls
      if (rawUrls.length === 0) throw new Error('未拿到图片 URL')
      // 落盘：把可能是 base64 的大 dataUrl 写到磁盘，store 只留 local-upload:/// 路径
      const urls = await Promise.all(
        rawUrls.map((u) => persistImage(u, { projectId: currentProjectId.value || undefined, nodeId })),
      )
      const primary = urls[0]
      updateNodeData(nodeId, {
        status: 'completed',
        progress: 100,
        outputImage: primary,
        output: { url: primary, timestamp: Date.now() },
      })
      // 全部候选都进资产库（用户后续翻历史时都能看见）
      const modelMetaForAsset = providerConfig.models.find((m) => m.id === data.model)
      const assetStore = useAssetStore()
      for (const u of urls) {
        assetStore.addAsset({
          type: 'image',
          url: u,
          prompt: promptText,
          model: data.model || providerConfig.models[0]?.id || '',
          providerId,
          providerName: providerConfig.name,
          nodeId,
          nodeType: 'ai-image',
          projectId: currentProjectId.value || undefined,
          ratio: data.ratio,
          resolution: modelMetaForAsset?.supportsImageSize2K ? '2K' : '1K',
        })
      }
      imageAborts.delete(nodeId)
      cancelledImageNodes.delete(nodeId)
    } catch (err) {
      window.clearInterval(fallbackTimer)
      imageTimers.delete(nodeId)
      imageAborts.delete(nodeId)
      if (cancelledImageNodes.has(nodeId)) {
        // 用户主动取消：cancelImageNode 已经设好状态，这里安静退出
        cancelledImageNodes.delete(nodeId)
        return
      }
      failNode(nodeId, err instanceof Error ? err.message : '生成图片失败')
    }
  }

  /** 文本节点：发送 prompt 到 LLM chat 端点，返回文字结果 */
  async function executeTextNode(nodeId: string) {
    const node = nodes.value.find((n) => n.id === nodeId)
    if (!node) return

    const aiStore = useAIStore()
    const data = node.data as NodeData & { systemPrompt?: string; maxTokens?: number; temperature?: number }
    const providerId = data.providerId || aiStore.defaultTextProviderId
    if (!providerId) {
      failNode(nodeId, '请先在「设置」里添加文本中转站')
      return
    }
    const providerConfig = aiStore.getProviderConfig(providerId)
    if (!providerConfig) {
      failNode(nodeId, '原文本中转站已被删除，请重新选择')
      return
    }
    const provider = aiStore.getTextProvider(providerId)
    if (!provider || !providerConfig.apiKey) {
      failNode(nodeId, `「${providerConfig.name}」未配置 API Key`)
      return
    }

    const promptText = (data.prompt || '').trim()
    if (!promptText) {
      failNode(nodeId, '请输入提示词')
      return
    }

    cancelExecution(nodeId)
    updateNodeData(nodeId, { status: 'running', progress: 10, error: undefined, outputText: undefined })

    try {
      const result = await provider.chat({
        model: data.model || providerConfig.models[0]?.id || 'gemini-2.5-flash',
        prompt: promptText,
        systemPrompt: (data as any).systemPrompt || undefined,
        maxTokens: (data as any).maxTokens,
        temperature: (data as any).temperature,
        onProgress: ({ progress }) => {
          updateNodeData(nodeId, { progress: Math.min(99, progress) })
        },
      })

      updateNodeData(nodeId, {
        status: 'completed',
        progress: 100,
        outputText: result.text,
        output: { text: result.text, timestamp: Date.now() },
      })
    } catch (err) {
      failNode(nodeId, err instanceof Error ? err.message : '生成文本失败')
    }
  }

  /** 旧版模拟执行：仅用于尚未接通真 API 的节点类型（ai-image / asset-ref / post-process） */
  async function executeMock(nodeId: string) {
    const node = nodes.value.find((n) => n.id === nodeId)
    if (!node) return

    updateNodeData(nodeId, { status: 'running', progress: 0 })
    try {
      for (let i = 0; i <= 100; i += 10) {
        await new Promise((resolve) => setTimeout(resolve, 200))
        updateNodeData(nodeId, { progress: i })
      }
      const output = { url: 'https://via.placeholder.com/512', timestamp: Date.now() }
      if (node.type === 'ai-image') {
        updateNodeData(nodeId, {
          status: 'completed',
          progress: 100,
          output,
          outputImage: 'https://picsum.photos/512/512?random=' + Date.now(),
        })
      } else {
        updateNodeData(nodeId, { status: 'completed', progress: 100, output })
      }
    } catch (error) {
      updateNodeData(nodeId, {
        status: 'error',
        error: error instanceof Error ? error.message : '执行失败',
      })
    }
  }

  function resetNode(nodeId: string) {
    cancelExecution(nodeId)
    updateNodeData(nodeId, {
      status: 'idle',
      progress: 0,
      output: undefined,
      error: undefined,
    })
  }

  return {
    nodes,
    edges,
    selectedNodeId,
    selectedNode,
    currentProjectId,
    loadProject,
    createProject,
    deleteProject,
    flushPersist,
    addNode,
    removeNode,
    updateNodeData,
    selectNode,
    addEdge,
    removeEdge,
    executeNode,
    cancelExecution,
    cancelImageNode,
    resetNode,
    init,
    persist,
  }
})
