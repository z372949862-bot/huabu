/**
 * 出海营（chuhaiying）视频中转 API 客户端。base URL: https://api.aiid.edu.kg
 *
 * 走 OpenAI Sora 兼容路径：
 *   1. POST /v1/videos 创建任务，返回 { id, status, progress }
 *   2. 轮询 GET /v1/videos/{id} 直到 status 为 'completed' 或 'failed'
 *   3. 从 video_url 取最终视频地址
 *
 * 当前只覆盖 grok-imagine-video-1.5-preview 一个模型。Grok 家族特有：
 *   - 用 reference_images 数组传参考图（不是 image / image_urls）
 *   - 用 aspect_ratio + resolution（大写 720P/1080P）
 *   - 时长用 seconds（doc 示例字段）
 */

import type {
  AIProvider,
  AuthResult,
  CreateTaskParams,
  TextToImageParams,
  ImageResult,
  ImageToVideoParams,
  VideoResult,
  TextToVideoParams,
  TaskStatus,
} from '../ai-provider'
import { urlToBase64 } from '../imageProviderUtils'

const DEFAULT_BASE_URL = 'https://api.aiid.edu.kg'
const DEFAULT_MODEL = 'grok-imagine-video-1.5-preview'

/**
 * 把 ratio 字符串归一成出海营接受的 aspect_ratio 字段（保持原样，因为它接受 '16:9' / '9:16' 等）
 * 'auto' 不传，让网关默认。
 */
function normalizeRatio(ratio?: string): string | undefined {
  if (!ratio || ratio === 'auto') return undefined
  return ratio
}

/**
 * '720p' / '1080p' → '720P' / '1080P'（doc 用大写 P）
 */
function normalizeResolution(resolution?: string): string | undefined {
  if (!resolution) return undefined
  return resolution.toUpperCase()
}

/** 把 ratio + resolution 转为 Sora 兼容的 size 字符串，如 "16:9" + "720p" → "1280x720" */
function ratioToSize(ratio: string, resolution?: string): string {
  const shortSide = resolution === '1080p' ? 1080 : 720
  // 从 ratio 算出较长边（取整到常见分辨率）
  const parts = ratio.split(':').map(Number)
  if (parts.length !== 2 || parts.some(isNaN)) return `${shortSide}x${shortSide}`
  const [w, h] = parts
  if (w >= h) {
    // 横屏：高度固定为 shortSide，宽度按比例
    return `${Math.round(shortSide * w / h)}x${shortSide}`
  } else {
    // 竖屏：宽度固定为 shortSide，高度按比例
    return `${shortSide}x${Math.round(shortSide * h / w)}`
  }
}

/**
 * 把 /v1/videos/{id} 返回归一成内部 TaskStatus 形状。
 * 出海营状态枚举：queued / in_progress / completed / failed。
 */
export function mapVideoTaskResponse(raw: any): TaskStatus {
  // Qiling 返回格式：{ status: "QUEUED", data: { status: "queued", progress: 0, metadata: { url: "" } } }
  const dataObj = raw?.data || raw
  // Qiling 顶层 status 和 data.status 可能不一致，优先取顶层（完成时是 "success"）
  const topStatus = (raw?.status || '').toLowerCase()
  const innerStatus = (dataObj?.status || '').toLowerCase()
  const rawStatus: string = (topStatus === 'success' ? topStatus : innerStatus || topStatus || 'queued')
  const statusMap: Record<string, TaskStatus['status']> = {
    queued: 'pending',
    in_progress: 'processing',
    processing: 'processing',
    completed: 'completed',
    complete: 'completed',
    succeeded: 'completed',
    success: 'completed',
    done: 'completed',
    finished: 'completed',
    failed: 'failed',
    failure: 'failed',
    error: 'failed',
  }
  const status = statusMap[rawStatus] || 'processing'

  const videoUrl: string | undefined =
    dataObj?.result_url
    || dataObj?.metadata?.url
    || dataObj?.data?.metadata?.url
    || dataObj?.video_url
    || dataObj?.url
    || raw?.video_url
    || raw?.url
    || (typeof raw?.output === 'object' && !Array.isArray(raw.output) ? raw.output.url : undefined)
    || raw?.output?.[0]?.url
    || raw?.output?.[0]?.video_url
    || raw?.detail?.url
    || undefined

  const progressRaw = dataObj?.progress ?? raw?.progress
  const progressStr = typeof progressRaw === 'string' ? progressRaw.replace('%', '') : progressRaw
  const progressNum = typeof progressStr === 'number' ? progressStr : parseFloat(progressStr)
  const progress = Number.isFinite(progressNum)
    ? progressNum
    : status === 'completed'
      ? 100
      : status === 'pending'
        ? 5
        : undefined

  const errorMsg =
    raw?.error?.message
    || raw?.message
    || (typeof raw?.error === 'string' ? raw.error : undefined)
    || undefined

  console.log('[mapVideoTask] rawStatus=', rawStatus, 'videoUrl=', videoUrl, 'raw keys=', Object.keys(raw||{}).join(','), 'data keys=', Object.keys(dataObj||{}).join(','))
  return { status, progress, videoUrl, error: errorMsg }
}

export class ChuhaiyingVideoProvider implements AIProvider {
  name = '出海营视频'
  private apiKey = ''
  private baseUrl = DEFAULT_BASE_URL

  constructor(apiKey?: string, baseUrl?: string) {
    if (apiKey) this.apiKey = apiKey
    if (baseUrl) this.baseUrl = this.normalizeBaseUrl(baseUrl)
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = this.normalizeBaseUrl(baseUrl || DEFAULT_BASE_URL)
  }

  private normalizeBaseUrl(url: string): string {
    return url.trim().replace(/\/+$/, '').replace(/\/v1$/, '')
  }

  async testAuth(apiKey: string): Promise<AuthResult> {
    if (!apiKey || typeof apiKey !== 'string') {
      return { success: false, error: 'API Key 不能为空' }
    }
    if (!apiKey.startsWith('sk-')) {
      return { success: false, error: 'API Key 格式不正确，应以 sk- 开头' }
    }
    if (apiKey.length < 20) {
      return { success: false, error: 'API Key 长度过短' }
    }
    return { success: true }
  }

  async createTask(params: CreateTaskParams): Promise<{ taskId: string }> {
    const model = params.model || DEFAULT_MODEL
    const isOmniOrVeo = model.startsWith('gemini-omni') || model.startsWith('veo')
    const isSd2 = model.startsWith('sd2-')
    const isEdit = params.mode === 'edit'

    // 从 content / 各字段里提取图片和视频 URL
    let editVideoUrl: string | undefined
    const refs: string[] = []
    if (params.image_url) refs.push(params.image_url)
    if (params.image_urls?.length) refs.push(...params.image_urls)
    if (params.content?.length) {
      for (const item of params.content) {
        if (item.type === 'image_url') {
          const u = typeof item.image_url === 'string' ? item.image_url : item.image_url?.url
          if (u) refs.push(u)
        } else if (item.type === 'video_url') {
          const u = typeof item.video_url === 'string' ? item.video_url : item.video_url?.url
          if (u) editVideoUrl = u
        }
      }
    }

    const body: Record<string, any> = {
      model,
      prompt: params.prompt,
    }

    if (isSd2) {
      // Qiling sd2 专用格式：metadata 嵌套 + base64 参考图
      body.metadata = {
        modeType: isEdit ? 'video-edit' : refs.length ? 'image-to-video' : 'text-to-video',
        ratio: (params.ratio && params.ratio !== 'auto') ? params.ratio : '16:9',
        resolution: (params.resolution || '720p').toUpperCase(),
        enableSound: params.generate_audio ? 'on' : 'off',
      }
      if (params.duration && params.duration > 0) body.duration = Number(params.duration)
      if (refs.length) {
        body.images = []
        for (const url of refs) {
          try {
            const { base64, mimeType } = await urlToBase64(url)
            body.images.push(`data:${mimeType};base64,${base64}`)
          } catch { /* skip */ }
        }
      }
    } else if (isOmniOrVeo) {
      // Sora 兼容格式：size + aspect_ratio 双保险
      if (params.ratio && params.ratio !== 'auto') {
        body.size = ratioToSize(params.ratio, params.resolution)
        body.aspect_ratio = params.ratio
      }
      if (params.duration && params.duration > 0) body.duration = Number(params.duration)
      body.n = 1
      body.response_format = 'url'

      // 视频编辑：源视频 URL
      if (isEdit && editVideoUrl) {
        body.video = editVideoUrl
      }
      // 参考图
      if (refs.length) {
        body.image = refs[0]
      }
      // 音频生成
      if (params.generate_audio) body.generate_audio = true
    } else {
      // Grok 兼容格式
      const aspectRatio = normalizeRatio(params.ratio)
      if (aspectRatio) body.aspect_ratio = aspectRatio

      const resolution = normalizeResolution(params.resolution)
      if (resolution) body.resolution = resolution

      if (params.duration && params.duration > 0) body.seconds = String(params.duration)

      if (refs.length) {
        body.reference_images = Array.from(new Set(refs))
      }
    }

    const data = await this.request<{ id?: string }>('/v1/videos', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (!data?.id) throw new Error('创建视频任务失败：未返回任务 ID')
    return { taskId: data.id }
  }

  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const data = await this.request<any>(
      `/v1/videos/${encodeURIComponent(taskId)}`,
      { method: 'GET' }
    )
    return mapVideoTaskResponse(data)
  }

  async textToVideo(params: TextToVideoParams): Promise<VideoResult> {
    const { taskId } = await this.createTask({
      model: params.model || DEFAULT_MODEL,
      prompt: params.prompt,
      mode: 't2v',
      ratio: params.ratio,
      resolution: params.resolution,
      duration: params.duration,
      fps: params.fps,
      generate_audio: params.generate_audio,
    })
    return { videoUrl: '', taskId }
  }

  async imageToVideo(params: ImageToVideoParams): Promise<VideoResult> {
    const { taskId } = await this.createTask({
      model: params.model || DEFAULT_MODEL,
      prompt: params.prompt || '',
      mode: 'i2v',
      image_url: params.imageUrl,
      ratio: params.ratio,
      resolution: params.resolution,
      duration: params.duration,
      fps: params.fps,
      generate_audio: params.generate_audio,
    })
    return { videoUrl: '', taskId }
  }

  async textToImage(_: TextToImageParams): Promise<ImageResult> {
    throw new Error('出海营视频站不支持文生图，请用图片中转站')
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.apiKey) throw new Error('未配置 API Key')

    // 60 秒超时，避免 Cloudflare 524
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60_000)

    let res: Response
    try {
      res = await fetch(this.baseUrl + path, {
        ...init,
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(init.headers || {}),
        },
      })
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('请求超时（60 秒未响应），中转站可能负载过高，请稍后重试')
      }
      const msg = (err instanceof Error ? err.message : '') || String(err || '')
      if (/524|server error|timeout/i.test(msg)) {
        throw new Error('中转站网关超时（524），服务器处理过久或负载过高，请稍后重试')
      }
      throw new Error(`无法连接到 ${this.baseUrl}：${msg || '网络错误'}`)
    }
    clearTimeout(timer)

    if (!res.ok) {
      let detail = ''
      try {
        const body = await res.json()
        detail = body?.error?.message || body?.message || JSON.stringify(body)
      } catch {
        detail = res.statusText
      }
      if (res.status === 401) throw new Error('API Key 无效或已过期')
      if (res.status === 429) throw new Error('已限流，请稍后重试')
      if (res.status === 524) throw new Error('中转站网关超时（524），服务器处理过久或负载过高，请稍后重试')
      if (res.status >= 500) throw new Error(`网关错误 ${res.status}：${detail}`)
      throw new Error(`请求失败 ${res.status}：${detail}`)
    }

    return res.json() as Promise<T>
  }
}
