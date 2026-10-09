import type { ContentItem, CreateTaskParams, TaskStatus } from './ai-provider'
import { prepareQilingReferences } from './qilingReferences'
import { DMXAPI_MODEL } from './providers/dmxapi'

export interface DmxPendingTask {
  taskId: string
  providerId: string
  model: string
  prompt: string
  ratio: string
  resolution: string
  duration: number
  createdAt: number
}

interface Context {
  id: string
  data: Record<string, any>
  nodes: Array<{ id: string; type?: string; data?: Record<string, any> }>
  edges: Array<{ source: string; target: string }>
  providerId: string
  provider: {
    createTask: (params: CreateTaskParams, signal?: AbortSignal) => Promise<{ taskId: string; videoUrl?: string }>
    getTaskStatus: (taskId: string, signal?: AbortSignal) => Promise<TaskStatus>
  }
  readFile: (url: string) => Promise<File>
  resolveVideoUrl?: (url: string) => string
  update: (patch: Record<string, any>) => void
  persist: () => Promise<void>
  isCurrent: () => boolean
  complete: (url: string, task: DmxPendingTask) => void
}

export function prepareDmxReferences(ctx: Pick<Context, 'id' | 'nodes' | 'edges'>) {
  const refs = prepareQilingReferences(ctx.id, ctx.nodes, ctx.edges)
  const data = ctx.nodes.find(node => node.id === ctx.id)?.data
  // The first and last frame may be the same image. The UI's ordered list is
  // authoritative for frame mode; general reference deduplication must not remove it.
  if (data?.dmxFrameMode && data.inputImages?.length) refs.images = [...data.inputImages]
  // DMXAPI documents image references as @图像N; preserve identity and upload order.
  return { ...refs, prompt: refs.prompt.replace(/@图片(?=\d)/g, '@图像') }
}

export async function prepareDmxMediaUrl(url: string, type: 'image' | 'video' | 'audio', readFile: Context['readFile']): Promise<string> {
  if (/^https?:\/\//i.test(url) || /^asset:\/\/[^/\s]+$/i.test(url)) return url
  if (type !== 'image') throw new Error('DMXAPI 参考视频和音频请使用公网链接或 asset://素材ID')
  if (/^data:image\/(?:jpeg|png|webp|bmp|tiff|gif|heic|heif);base64,/i.test(url)) {
    if (url.length * 3 / 4 >= 30 * 1024 * 1024) throw new Error('DMXAPI 单张参考图必须小于 30 MB')
    return url
  }
  const file = await readFile(url)
  if (!/^image\/(?:jpeg|png|webp|bmp|tiff|gif|heic|heif)$/i.test(file.type)) throw new Error('DMXAPI 不支持该参考图格式')
  if (file.size >= 30 * 1024 * 1024) throw new Error('DMXAPI 单张参考图必须小于 30 MB')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取 DMXAPI 参考图失败'))
    reader.readAsDataURL(file)
  })
}

interface Run {
  controller: AbortController
  timer?: ReturnType<typeof setTimeout>
  context: Context
  task?: DmxPendingTask
  submitting: boolean
}
const runs = new Map<string, Run>()
const POLL_MS = 3000
const MAX_QUERY_MS = 30 * 60 * 1000

function stop(run: Run) {
  if (runs.get(run.context.id) === run) runs.delete(run.context.id)
  if (run.timer) clearTimeout(run.timer)
  run.controller.abort()
}

export function cancelDmxApiNode(nodeId: string) {
  const run = runs.get(nodeId)
  if (!run) return
  stop(run)
  if (run.context.isCurrent()) {
    run.context.update({
      status: 'idle', progress: undefined,
      referenceWarning: run.task
        ? '已停止本地查询，平台任务可能仍在生成。点击「继续查询」可取回结果。'
        : run.submitting ? '提交已中断，平台可能已创建任务，请先到 DMXAPI 核实，避免重复提交。' : undefined,
    })
  }
}

/** Each run owns its requests. Late responses cannot revive canceled/deleted nodes. */
export async function runDmxApiNode(ctx: Context) {
  cancelDmxApiNode(ctx.id)
  const run: Run = { controller: new AbortController(), context: ctx, submitting: false }
  runs.set(ctx.id, run)
  const active = () => {
    if (runs.get(ctx.id) !== run || run.controller.signal.aborted) return false
    if (!ctx.isCurrent()) { stop(run); return false }
    return true
  }
  const update = (patch: Record<string, any>) => { if (active()) ctx.update(patch) }
  const finish = (url: string) => {
    if (!active() || !run.task) return
    stop(run)
    ctx.update({ status: 'completed', progress: 100, outputVideo: url, taskId: undefined, dmxTask: undefined, error: undefined, referenceWarning: undefined })
    ctx.complete(url, run.task)
    void ctx.persist()
  }
  const fail = (message: string, terminal = false) => {
    if (!active()) return
    stop(run)
    ctx.update({
      status: 'error', error: message,
      ...(terminal ? { dmxTask: undefined, taskId: undefined } : {}),
    })
    void ctx.persist()
  }

  update({ status: 'running', progress: 0, error: undefined, referenceWarning: undefined })
  try {
    if (ctx.data.dmxTask?.taskId) {
      run.task = { ...ctx.data.dmxTask }
      update({ taskId: run.task!.taskId })
    } else {
      const refs = prepareDmxReferences(ctx)
      if (!refs.prompt) throw new Error('请输入视频提示词或编辑、延长指令')
      const mode = ctx.data.videoMode || 'reference'
      const frameMode = mode === 'reference' ? ctx.data.dmxFrameMode : undefined
      if (frameMode && (refs.images.length !== (frameMode === 'first_frame' ? 1 : 2) || refs.videos.length || refs.audios.length)) {
        throw new Error(frameMode === 'first_frame' ? '首帧生视频需要且仅支持 1 张图片' : '首尾帧生视频需要且仅支持 2 张图片，按素材顺序分别作为首帧、尾帧')
      }
      if ((mode === 'edit' || mode === 'extend') && !refs.videos.length) throw new Error('视频编辑或延长需要连接视频素材')
      if (refs.images.length > 30 || refs.videos.length > 10 || refs.audios.length > 10) {
        throw new Error('DMXAPI 最多支持 30 张参考图、10 个参考视频、10 段参考音频')
      }
      const content: ContentItem[] = [{ type: 'text', text: refs.prompt }]
      for (const [type, urls] of [['image', refs.images], ['video', refs.videos], ['audio', refs.audios]] as const) {
        for (const [index, url] of urls.entries()) {
          if (!active()) return
          const remote = await prepareDmxMediaUrl(type === 'video' ? (ctx.resolveVideoUrl?.(url) || url) : url, type, ctx.readFile)
          if (!active()) return
          const role = frameMode && type === 'image' ? (index === 0 ? 'first_frame' : 'last_frame') : 'reference_' + type
          content.push({ type: type + '_url', [type + '_url']: { url: remote }, role } as ContentItem)
        }
      }
      const params: CreateTaskParams = {
        model: ctx.data.model || DMXAPI_MODEL, prompt: refs.prompt, content,
        ratio: mode === 'reference' && !frameMode ? (ctx.data.ratio || 'adaptive') : 'adaptive',
        resolution: ctx.data.resolution || '720p', duration: mode === 'edit' ? -1 : (ctx.data.duration ?? 5),
        generate_audio: ctx.data.generateAudio, outputFormat: ctx.data.outputFormat || 'mp4',
        omniReferenceTaskType: content.length > 1 && !frameMode ? mode : undefined,
        returnLastFrame: ctx.data.returnLastFrame,
      }
      run.submitting = true
      const result = await ctx.provider.createTask(params, run.controller.signal)
      if (!active()) return
      run.task = {
        taskId: result.taskId, providerId: ctx.providerId, model: params.model, prompt: params.prompt,
        ratio: params.ratio!, resolution: params.resolution!, duration: params.duration!, createdAt: Date.now(),
      }
      if (result.videoUrl) { finish(result.videoUrl); return }
      if (!result.taskId) throw new Error('DMXAPI 未返回任务 ID，请到平台核实，避免重复提交')
      update({ taskId: result.taskId, dmxTask: run.task })
      await ctx.persist()
      if (!active()) return
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : 'DMXAPI 提交失败')
    return
  }

  const startedAt = Date.now()
  let transientFailures = 0
  let missingResult = 0
  const poll = async () => {
    if (!active()) return
    if (Date.now() - startedAt > MAX_QUERY_MS) {
      fail('本次查询已达 30 分钟，任务 ID 已保留。可点击「继续查询」，无需重新生成。')
      return
    }
    let delay = POLL_MS
    try {
      const status = await ctx.provider.getTaskStatus(run.task!.taskId, run.controller.signal)
      if (!active()) return
      transientFailures = 0
      if (status.status === 'completed' && status.videoUrl) { finish(status.videoUrl); return }
      if (status.status === 'failed') { fail(status.error || 'DMXAPI 任务失败', true); return }
      if (status.status === 'completed') {
        if (++missingResult >= 3) {
          fail('DMXAPI 显示任务完成但未返回视频链接，任务 ID 已保留，请稍后继续查询或联系平台。')
          return
        }
      } else missingResult = 0
      update({ progress: typeof status.progress === 'number' ? Math.min(99, Math.max(0, status.progress)) : undefined, error: undefined })
    } catch (error) {
      if (!active()) return
      const message = error instanceof Error ? error.message : 'DMXAPI 查询失败'
      if (/超时|连接中断|Failed to fetch|NetworkError|请求失败 (?:429|5\d\d)/i.test(message) && ++transientFailures <= 5) {
        update({ error: 'DMXAPI 查询暂时失败，正在重试（' + transientFailures + '/5）' })
        delay = Math.min(30_000, POLL_MS * 2 ** transientFailures)
      } else {
        fail(message + '；任务 ID 已保留，可继续查询。')
        return
      }
    }
    if (active()) run.timer = setTimeout(poll, delay)
  }
  if (active()) run.timer = setTimeout(poll, POLL_MS)
}
