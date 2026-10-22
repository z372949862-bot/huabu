import type {
  AIProvider,
  AuthResult,
  ContentItem,
  CreateTaskParams,
  ImageResult,
  ImageToVideoParams,
  TaskStatus,
  TextToImageParams,
  TextToVideoParams,
  VideoResult,
} from '../ai-provider'
import { fetchWithTimeout } from './_httpUtils'

export const AIIDE_BASE = 'https://www.aiide.com'
export const AIIDE_SEEDANCE_25_MODEL = 'dreamina-seedance-2-5-hc'

const MEDIA_TYPES = new Set(['image_url', 'video_url', 'audio_url'])
const FAILED_STATES = new Set(['failure', 'failed', 'error', 'expired', 'cancelled', 'canceled', 'rejected'])
const COMPLETED_STATES = new Set(['success', 'succeeded', 'completed', 'complete', 'done', 'finished'])
const PENDING_STATES = new Set(['not_start', 'not_started', 'submitted', 'queued', 'pending', 'created'])
const PROCESSING_STATES = new Set(['in_progress', 'running', 'processing', 'unknown'])

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function at(value: any, path: string): unknown {
  return path.split('.').reduce((current, key) => current?.[key], value)
}

function firstText(value: any, paths: string[]): string {
  for (const path of paths) {
    const result = text(at(value, path))
    if (result) return result
  }
  return ''
}

/** Normalize Aiide's task envelope and the upstream status carried inside data.data. */
export function mapAiideTaskResponse(raw: any): TaskStatus {
  // The documented envelope has a gateway state at data.status and the
  // upstream model state at data.data.output.task_status. A gateway failure
  // or upstream failure must remain visible; otherwise the gateway state is
  // authoritative while it is still processing the request.
  const gatewayStates = [raw?.data?.status, raw?.status, raw?.result?.status, raw?.data?.data?.status]
    .map(value => text(value).toLowerCase())
    .filter(Boolean)
  const upstreamStates = [
    raw?.data?.data?.output?.task_status,
    raw?.data?.output?.task_status,
    raw?.data?.data?.status,
    raw?.result?.data?.output?.task_status,
  ].map(value => text(value).toLowerCase()).filter(Boolean)
  const mappedState = (states: string[]): TaskStatus['status'] | undefined => {
    if (states.some(value => FAILED_STATES.has(value))) return 'failed'
    if (states.some(value => COMPLETED_STATES.has(value))) return 'completed'
    if (states.some(value => PENDING_STATES.has(value))) return 'pending'
    if (states.some(value => PROCESSING_STATES.has(value))) return 'processing'
    return undefined
  }
  const gatewayStatus = mappedState(gatewayStates)
  const upstreamStatus = mappedState(upstreamStates)
  // A successful gateway envelope only means that the task record was read;
  // when the nested upstream task status exists it is the source of truth for
  // pending/processing/completed. Gateway failures still take precedence.
  const status = gatewayStates.some(value => FAILED_STATES.has(value))
    ? 'failed'
    : upstreamStatus || gatewayStatus || 'processing'

  const progressText = firstText(raw, [
    'progress', 'data.progress', 'data.data.progress', 'result.progress',
  ]).replace('%', '')
  const progressNumber = Number.parseFloat(progressText)
  const progress = Number.isFinite(progressNumber)
    ? Math.max(0, Math.min(100, progressNumber <= 1 && progressNumber > 0 ? progressNumber * 100 : progressNumber))
    : status === 'completed' ? 100 : status === 'pending' ? 5 : undefined

  const videoUrl = firstText(raw, [
    'data.data.output.video_url',
    'data.output.video_url',
    'data.data.content.video_url',
    'data.content.video_url',
    'data.data.video_url',
    'data.video_url',
    'data.data.output.result_url',
    'data.output.result_url',
    'data.data.result_url',
    'data.result_url',
    'result.video_url',
    'result.result_url',
    'video_url',
    'result_url',
  ]) || undefined

  const error = status === 'failed'
    ? firstText(raw, [
      'data.data.fail_reason', 'data.fail_reason', 'data.data.error.message',
      'data.error.message', 'error.message', 'data.data.output.fail_reason', 'data.data.message', 'message',
    ]) || 'AIIDE Seedance 2.5 HC 任务失败'
    : undefined

  return { status, progress, videoUrl: status === 'completed' ? videoUrl : undefined, error }
}

function mediaUrl(item: ContentItem): string {
  const value = item[item.type]
  return text(typeof value === 'object' && value !== null ? (value as { url?: unknown }).url : value)
}

/** Build the /v1/video/generations request body documented by Aiide's Seedance endpoint. */
export function buildAiideSeedanceBody(params: CreateTaskParams): Record<string, unknown> {
  const userPrompt = String(params.prompt || '').trim()
  const prompt = params.mode === 'extend'
    ? ['从输入视频的最后一帧开始无缝延长。', userPrompt].filter(Boolean).join('\n')
    : params.mode === 'edit'
      ? ['请按照以下要求编辑输入视频：', userPrompt].filter(Boolean).join('\n')
      : userPrompt
  if (!prompt) throw new Error('请输入视频提示词')

  const content: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  const append = (type: 'image_url' | 'video_url' | 'audio_url', url: string, role: string) => {
    if (!url || seen.has(`${type}:${url}`)) return
    seen.add(`${type}:${url}`)
    content.push({ type, [type]: { url }, role })
  }

  for (const item of params.content || []) {
    if (!MEDIA_TYPES.has(item.type)) continue
    const url = mediaUrl(item)
    if (!url) continue
    const type = item.type as 'image_url' | 'video_url' | 'audio_url'
    const defaultRole = type === 'image_url' ? 'reference_image'
      : type === 'video_url' ? 'reference_video' : 'reference_audio'
    const role = item.role === 'source_video' ? 'reference_video' : (item.role || defaultRole)
    append(type, url, role)
  }

  // Support callers that pass a simple image field instead of content[].
  const imageUrls = [params.image_url, ...(params.image_urls || [])].filter((url): url is string => !!url)
  for (const url of imageUrls) append('image_url', url, 'reference_image')

  const safeDuration = params.duration == null ? 5 : Number(params.duration)
  if (!Number.isInteger(safeDuration) || safeDuration < 4 || safeDuration > 30) {
    throw new Error('Dreamina Seedance 2.5 HC 视频时长须为 4–30 秒的整数')
  }
  const requestedRatio = String(params.ratio || '16:9').toLowerCase()
  const ratio = ['auto', 'adaptive'].includes(requestedRatio) ? '16:9' : requestedRatio
  const resolution = String(params.resolution || '720p').trim().toLowerCase()
  if (!['480p', '720p'].includes(resolution)) {
    throw new Error('Dreamina Seedance 2.5 HC 仅支持 480p 或 720p')
  }
  return {
    model: params.model || AIIDE_SEEDANCE_25_MODEL,
    prompt,
    metadata: {
      content,
      // AIIDE's documented Seedance 2.5 HC request enables native audio by
      // default. Callers can still opt out explicitly with false.
      generate_audio: params.generate_audio !== false,
      ratio,
      resolution,
      duration: safeDuration,
      watermark: false,
    },
  }
}

export class AiideSeedanceProvider implements AIProvider {
  name = 'AIIDE · Seedance 2.5 HC'
  private apiKey: string
  private baseUrl: string

  constructor(apiKey = '', baseUrl = AIIDE_BASE) {
    this.apiKey = apiKey.trim().replace(/^Bearer\s+/i, '')
    this.baseUrl = this.normalizeBaseUrl(baseUrl)
  }

  setApiKey(apiKey: string) {
    this.apiKey = (apiKey || '').trim().replace(/^Bearer\s+/i, '')
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = this.normalizeBaseUrl(baseUrl || AIIDE_BASE)
  }

  private normalizeBaseUrl(url: string) {
    return url.trim().replace(/\/+$/, '').replace(/\/v1$/i, '')
  }

  async testAuth(apiKey: string): Promise<AuthResult> {
    const previous = this.apiKey
    this.setApiKey(apiKey)
    try {
      await this.request('/v1/models', { method: 'GET' }, 30_000)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'AIIDE 连接失败' }
    } finally {
      this.apiKey = previous
    }
  }

  async createTask(params: CreateTaskParams): Promise<{ taskId: string }> {
    const raw = await this.request<any>('/v1/video/generations', {
      method: 'POST',
      body: JSON.stringify(buildAiideSeedanceBody(params)),
    }, 180_000)
    const taskId = firstText(raw, ['task_id', 'data.task_id', 'data.data.task_id', 'id', 'data.id'])
    if (!taskId) throw new Error('AIIDE 创建任务未返回任务 ID，请在平台确认任务状态后再重试')
    return { taskId }
  }

  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const raw = await this.request<any>(`/v1/video/generations/${encodeURIComponent(taskId)}`, { method: 'GET' })
    return mapAiideTaskResponse(raw)
  }

  async textToVideo(params: TextToVideoParams): Promise<VideoResult> {
    const result = await this.createTask({
      model: params.model || AIIDE_SEEDANCE_25_MODEL,
      prompt: params.prompt,
      ratio: params.ratio,
      resolution: params.resolution,
      duration: params.duration,
      generate_audio: params.generate_audio,
    })
    return { taskId: result.taskId, videoUrl: '' }
  }

  async imageToVideo(params: ImageToVideoParams): Promise<VideoResult> {
    const result = await this.createTask({
      model: params.model || AIIDE_SEEDANCE_25_MODEL,
      prompt: params.prompt || 'Animate the reference image into a video.',
      image_url: params.imageUrl,
      ratio: params.ratio,
      resolution: params.resolution,
      duration: params.duration,
      generate_audio: params.generate_audio,
    })
    return { taskId: result.taskId, videoUrl: '' }
  }

  async textToImage(_: TextToImageParams): Promise<ImageResult> {
    throw new Error('AIIDE Seedance 2.5 HC 是视频模型，请使用图片生成服务商')
  }

  private async request<T>(path: string, init: RequestInit, timeoutMs = 90_000): Promise<T> {
    if (!this.apiKey) throw new Error('未配置 AIIDE API Key')
    let response: Response
    try {
      response = await fetchWithTimeout(this.baseUrl + path, {
        ...init,
        timeoutMs,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(init.method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
          ...(init.headers || {}),
        },
      })
    } catch (error) {
      throw new Error(`无法连接到 AIIDE (${this.baseUrl})：${error instanceof Error ? error.message : '网络错误'}`)
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      let detail = bodyText || response.statusText
      try {
        const parsed = JSON.parse(bodyText)
        detail = parsed?.error?.message || parsed?.message || detail
      } catch { /* Keep the response text as the diagnostic. */ }
      if (response.status === 401) throw new Error('AIIDE API Key 无效或已过期')
      if (response.status === 429) throw new Error(`AIIDE 请求频率或额度受限：${detail}`)
      throw new Error(`AIIDE 请求失败 ${response.status}：${detail.slice(0, 1000)}`)
    }
    return await response.json() as T
  }
}
