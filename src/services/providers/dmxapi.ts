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

export const DMXAPI_BASE = 'https://www.dmxapi.cn'
export const DMXAPI_MODEL = 'doubao-seedance-2-5-260628'
const CREATE_TIMEOUT_MS = 180_000
const QUERY_TIMEOUT_MS = 90_000

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim()
    : typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function parseEmbeddedText(text: string): unknown {
  try { return JSON.parse(text) } catch {
    const match = text.match(/\x60{3}(?:json)?\s*([\s\S]*?)\x60{3}/i)
    if (match) { try { return JSON.parse(match[1]) } catch { /* plain text */ } }
    return undefined
  }
}

/** Visit response fields only. Input/prompt echoes are never task results.
 * Parse each text block separately, with inner task payloads before envelopes.
 */
function responseParts(raw: unknown) {
  const records: any[] = [], texts: string[] = []
  const seen = new Set<unknown>()
  const visit = (value: any, depth = 0) => {
    if (depth > 12 || value == null || seen.has(value)) return
    seen.add(value)
    if (typeof value === 'string') {
      const embedded = parseEmbeddedText(value)
      if (embedded && typeof embedded === 'object') visit(embedded, depth + 1)
      else texts.push(value.trim())
      return
    }
    if (Array.isArray(value)) { value.forEach(item => visit(item, depth + 1)); return }
    if (typeof value !== 'object') return
    if (/^reference_|^(first|last)_frame$/.test(value.role || '') ||
        ['image_url', 'video_url', 'audio_url', 'input_image', 'input_video', 'input_text'].includes(value.type)) return
    for (const key of ['data', 'result', 'output', 'content', 'task', 'response', 'video', 'text', 'output_text']) {
      visit(value[key], depth + 1)
    }
    records.push(value)
  }
  visit(raw)
  return { records, texts }
}

function isEnvelope(value: any): boolean {
  return value?.object === 'response' || ['message', 'output_text'].includes(value?.type)
}

function validVideoUrl(value: unknown, explicit = false): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol)) return false
    if (/\.(?:png|jpe?g|webp|gif|bmp|tiff?|heic|heif|mp3|wav|ogg|aac)$/i.test(url.pathname)) return false
    return explicit || /\.(?:mp4|mov|m4v|webm|mkv)$/i.test(url.pathname)
  } catch { return false }
}

function findVideoUrl(raw: unknown): string | undefined {
  const { records, texts } = responseParts(raw)
  for (const value of records) {
    for (const key of ['video_url', 'output_url', 'result_url', 'download_url']) {
      if (validVideoUrl(value[key], true)) return value[key]
    }
    if (validVideoUrl(value.url)) return value.url
  }
  for (const text of texts) {
    for (const [candidate] of text.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
      const url = candidate.replace(/[),.]+$/, '')
      if (validVideoUrl(url)) return url
    }
  }
  return undefined
}

export function mapDmxApiTask(raw: any): TaskStatus {
  const { records } = responseParts(raw)
  const taskRecords = records.filter(value => !isEnvelope(value))
  const rootTask = !isEnvelope(raw) && /^task[_-]/i.test(stringField(raw?.id || raw?.task_id)) && (raw?.status || raw?.state)
  const statusRecord = rootTask ? raw : taskRecords.find(value => stringField(value.status || value.state))
  const status = stringField(statusRecord?.status || statusRecord?.state).toLowerCase()
  const errorValue = records.map(value => stringField(value?.error?.message || value?.error || value?.fail_reason)).find(Boolean)
  const failed = ['failed', 'failure', 'error', 'cancelled', 'canceled', 'expired', 'timeout'].includes(status) || (!!errorValue && !status)
  const progressRaw = statusRecord?.progress ?? taskRecords.find(value => value.progress != null)?.progress
  const progress = Number.parseFloat(String(progressRaw ?? '').replace('%', ''))
  const videoUrl = findVideoUrl(raw)
  // A URL can be reserved before generation finishes. Explicit status wins.
  const done = !failed && (['completed', 'complete', 'succeeded', 'success', 'done', 'finished', 'ready'].includes(status) || (!status && !!videoUrl))
  return {
    status: failed ? 'failed' : done ? 'completed' : ['queued', 'pending', 'submitted', 'created'].includes(status) ? 'pending' : 'processing',
    progress: Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : undefined,
    videoUrl: done ? videoUrl : undefined,
    error: failed ? errorValue || stringField(statusRecord?.message) || 'DMXAPI 任务失败' : undefined,
  }
}

function taskIdFromResponse(raw: unknown): string {
  const { records, texts } = responseParts(raw)
  const root = raw as any
  const gatewayId = stringField(root?.task_id) || (/^task[_-]/i.test(stringField(root?.id)) ? stringField(root.id) : '')
  if (gatewayId) return gatewayId
  const tasks = records.filter(value => !isEnvelope(value))
  const explicit = tasks.map(value => stringField(value.task_id)).find(Boolean)
  if (explicit) return explicit
  const taskId = tasks.map(value => stringField(value.id)).find(value => /^task[_-]/i.test(value))
  if (taskId) return taskId
  for (const text of texts) {
    const labeled = text.match(/\b(?:task|request|response)\s*id\s*[:：]\s*([A-Za-z0-9][A-Za-z0-9_-]*)/i)
    if (labeled) return labeled[1]
    const token = text.match(/\btask_[A-Za-z0-9_-]+/i)?.[0]
    if (token) return token
  }
  return tasks.map(value => stringField(value.id))
    .find(value => value && !/^(?:msg|resp|response|request)[_-]/i.test(value)) || ''
}

function normalizeContent(content: ContentItem[] | undefined, prompt: string): Array<Record<string, any>> {
  const source = content?.length ? content : [{ type: 'text', text: prompt } as ContentItem]
  return source.map(item => {
    if (item.type === 'text') return { type: 'text', text: item.text || '' }
    const value = item[item.type]
    const url = typeof value === 'string' ? value : value?.url
    if (!url) throw new Error('DMXAPI 参考素材地址为空')
    // A media item must contain exactly one payload, without name or text.
    return { type: item.type, [item.type]: { url }, ...(item.role ? { role: item.role } : {}) }
  })
}

export class DmxApiProvider implements AIProvider {
  name = 'DMXAPI · Seedance 2.5'
  private apiKey = ''
  private baseUrl = DMXAPI_BASE

  constructor(apiKey = '', baseUrl = DMXAPI_BASE) {
    this.setApiKey(apiKey)
    this.setBaseUrl(baseUrl)
  }

  setApiKey(apiKey: string) { this.apiKey = (apiKey || '').trim().replace(/^Bearer\s+/i, '') }
  setBaseUrl(baseUrl: string) { this.baseUrl = (baseUrl || DMXAPI_BASE).trim().replace(/\/+$/, '').replace(/\/v1$/, '') }

  async testAuth(apiKey: string): Promise<AuthResult> {
    if (!apiKey || !apiKey.startsWith('sk-') || apiKey.length < 20) {
      return { success: false, error: 'DMXAPI Key 格式不正确，应以 sk- 开头且长度至少 20 位' }
    }
    return { success: true }
  }

  async createTask(params: CreateTaskParams, signal?: AbortSignal): Promise<{ taskId: string; videoUrl?: string }> {
    const duration = params.omniReferenceTaskType === 'edit' ? -1 : params.duration
    if (duration !== undefined && duration !== -1 && (!Number.isInteger(duration) || duration < 4 || duration > 30)) {
      throw new Error('DMXAPI 视频时长须为 4–30 秒的整数，或 -1（自动）')
    }
    const body: Record<string, any> = {
      model: params.model || DMXAPI_MODEL,
      input: normalizeContent(params.content, params.prompt),
      ...(params.ratio ? { ratio: params.ratio } : {}),
      ...(params.resolution ? { resolution: params.resolution } : {}),
      ...(duration !== undefined ? { duration } : {}),
      ...(params.generate_audio !== undefined ? { generate_audio: params.generate_audio } : {}),
      ...(params.omniReferenceTaskType ? { omni_reference_task_type: params.omniReferenceTaskType } : {}),
      output_format: params.outputFormat || 'mp4',
      ...(params.returnLastFrame !== undefined ? { return_last_frame: params.returnLastFrame } : {}),
      ...(['edit', 'extend'].includes(params.omniReferenceTaskType || '') ? { ratio: 'adaptive' } : {}),
    }
    const serialized = JSON.stringify(body)
    if (new TextEncoder().encode(serialized).byteLength > 64 * 1024 * 1024) {
      throw new Error('DMXAPI 请求超过 64 MB，请缩小参考图或使用公网图片链接')
    }
    const raw = await this.request<any>('/v1/responses', {
      method: 'POST',
      body: serialized,
    }, CREATE_TIMEOUT_MS, signal)
    const mapped = mapDmxApiTask(raw)
    if (mapped.status === 'failed') throw new Error(mapped.error || 'DMXAPI 创建任务失败')
    const taskId = taskIdFromResponse(raw)
    const videoUrl = mapped.videoUrl
    if (!taskId && !videoUrl) {
      throw new Error('DMXAPI 未返回可识别的任务 ID，请到平台确认任务，避免重复提交')
    }
    return { taskId, videoUrl }
  }

  async getTaskStatus(taskId: string, signal?: AbortSignal): Promise<TaskStatus> {
    const raw = await this.request<any>('/v1/responses', {
      method: 'POST',
      body: JSON.stringify({ model: 'seedance-2-5-get', input: taskId }),
    }, QUERY_TIMEOUT_MS, signal)
    return mapDmxApiTask(raw)
  }

  async textToVideo(params: TextToVideoParams): Promise<VideoResult> {
    const result = await this.createTask({
      model: params.model || DMXAPI_MODEL,
      prompt: params.prompt,
      ratio: params.ratio,
      resolution: params.resolution,
      duration: params.duration,
      fps: params.fps,
      generate_audio: params.generate_audio,
    })
    return { taskId: result.taskId, videoUrl: result.videoUrl || '' }
  }

  async imageToVideo(params: ImageToVideoParams): Promise<VideoResult> {
    const result = await this.createTask({
      model: params.model || DMXAPI_MODEL,
      prompt: params.prompt || '',
      image_url: params.imageUrl,
      ratio: 'adaptive',
      resolution: params.resolution,
      duration: params.duration,
      fps: params.fps,
      generate_audio: params.generate_audio,
      content: [
        { type: 'text', text: params.prompt || '' },
        { type: 'image_url', image_url: { url: params.imageUrl }, role: 'first_frame' },
      ],
    })
    return { taskId: result.taskId, videoUrl: result.videoUrl || '' }
  }

  async textToImage(_: TextToImageParams): Promise<ImageResult> {
    throw new Error('DMXAPI Seedance 2.5 不支持文生图，请接入图片中转站')
  }

  private async request<T>(path: string, init: RequestInit, timeoutMs = QUERY_TIMEOUT_MS, signal?: AbortSignal): Promise<T> {
    if (!this.apiKey) throw new Error('未配置 DMXAPI API Key')
    signal?.throwIfAborted()
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    const timer = window.setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(this.baseUrl + path, {
        ...init,
        signal: controller.signal,
        headers: {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json',
          ...(init.headers || {}),
        },
      })
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 1200) || res.statusText
        if (res.status === 401) throw new Error('DMXAPI Key 无效或已过期')
        throw new Error(`DMXAPI 请求失败 ${res.status}：${detail}`)
      }
      return await res.json() as T
    } catch (error) {
      if (signal?.aborted) throw new DOMException('已停止查询', 'AbortError')
      if (controller.signal.aborted) {
        throw new Error(`DMXAPI 请求超时（${Math.round(timeoutMs / 1000)} 秒），请到平台确认任务状态，避免重复提交`)
      }
      throw error
    } finally {
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }
}
