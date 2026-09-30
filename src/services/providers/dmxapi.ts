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

function textFromResponse(raw: any): string {
  const texts: string[] = []
  const visit = (value: any, depth = 0) => {
    if (depth > 8 || value === null || value === undefined) return
    if (typeof value === 'string') {
      if (value.trim()) texts.push(value)
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1))
      return
    }
    if (typeof value !== 'object') return
    if (typeof value.text === 'string' && value.text.trim()) texts.push(value.text)
    Object.values(value).forEach((item) => visit(item, depth + 1))
  }
  visit(raw)
  return texts.join('\n')
}

function parseEmbeddedText(text: string): any {
  if (!text) return undefined
  try { return JSON.parse(text) } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)) } catch { /* plain text */ }
    }
    return undefined
  }
}

function responseValues(raw: any): any[] {
  const values: any[] = []
  const seen = new Set<any>()
  const visit = (value: any, depth = 0) => {
    if (depth > 8 || value === null || value === undefined || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    values.push(value)
    if (Array.isArray(value)) value.forEach((item) => visit(item, depth + 1))
    else Object.values(value).forEach((item) => visit(item, depth + 1))
  }
  visit(raw)
  return values
}

function stringField(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function findVideoUrl(raw: any): string | undefined {
  const text = textFromResponse(raw)
  const embedded = parseEmbeddedText(text)
  const direct = responseValues(raw)
    .concat(responseValues(embedded))
    .flatMap((value) => [value?.video_url, value?.output_url, value?.url])
    .find((value) => typeof value === 'string' && /^https?:\/\//i.test(value))
  if (direct) return direct
  const url = text.match(/https?:\/\/[^\s"'<>]+/i)?.[0]
  return url?.replace(/[),.]$/, '')
}

export function mapDmxApiTask(raw: any): TaskStatus {
  const embedded = parseEmbeddedText(textFromResponse(raw))
  const values = responseValues(raw).concat(responseValues(embedded))
  const status = values.map((value) => stringField(value?.status || value?.state).toLowerCase()).find(Boolean) || ''
  const failed = ['failed', 'failure', 'error', 'cancelled', 'canceled', 'expired', 'timeout']
  const completed = ['completed', 'complete', 'succeeded', 'success', 'done', 'finished', 'ready']
  const pending = ['queued', 'pending', 'submitted', 'created']
  const progressRaw = values.map((value) => value?.progress).find((value) => value !== undefined && value !== null)
  const progress = Number.parseFloat(String(progressRaw ?? '').replace('%', ''))
  const errorValue = values.map((value) => stringField(value?.error?.message || value?.error || value?.message)).find(Boolean)
  return {
    status: failed.includes(status)
      ? 'failed'
      : completed.includes(status) || !!findVideoUrl(raw)
        ? 'completed'
        : pending.includes(status)
          ? 'pending'
          : 'processing',
    progress: Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : undefined,
    videoUrl: findVideoUrl(raw),
    error: errorValue || undefined,
  }
}

function taskIdFromResponse(raw: any): string {
  const fields = ['task_id', 'request_id', 'response_id', 'id']
  const direct = responseValues(raw)
    .flatMap((value) => fields.map((field) => stringField(value?.[field])))
    .find(Boolean)
  if (direct) return direct
  const text = textFromResponse(raw)
  const embedded = parseEmbeddedText(text)
  const embeddedId = responseValues(embedded)
    .flatMap((value) => fields.map((field) => stringField(value?.[field])))
    .find(Boolean)
  if (embeddedId) return embeddedId
  const labeled = text.match(/\b(task|request|response)\s*id\s*[:：]\s*([A-Za-z0-9][A-Za-z0-9_-]*)/i)
  if (labeled) {
    const prefix = labeled[1].toLowerCase()
    const value = labeled[2]
    return /^(task|request|response)[_-]/i.test(value) ? value : `${prefix}_${value}`
  }
  return text.match(/(?:task|request|response)_[A-Za-z0-9_-]+/i)?.[0] || ''
}

function normalizeContent(content: ContentItem[] | undefined, prompt: string): Array<Record<string, any>> {
  const source = content?.length ? content : [{ type: 'text', text: prompt } as ContentItem]
  return source.map((item) => {
    const next: Record<string, any> = { type: item.type }
    if (item.text !== undefined) next.text = item.text
    for (const key of ['image_url', 'video_url', 'audio_url'] as const) {
      const value = item[key]
      if (value !== undefined) next[key] = typeof value === 'string' ? { url: value } : value
    }
    if (item.role) next.role = item.role
    if (item.name) next.name = item.name
    return next
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

  setApiKey(apiKey: string) { this.apiKey = apiKey || '' }
  setBaseUrl(baseUrl: string) { this.baseUrl = (baseUrl || DMXAPI_BASE).trim().replace(/\/+$/, '').replace(/\/v1$/, '') }

  async testAuth(apiKey: string): Promise<AuthResult> {
    if (!apiKey || !apiKey.startsWith('sk-') || apiKey.length < 20) {
      return { success: false, error: 'DMXAPI Key 格式不正确，应以 sk- 开头且长度至少 20 位' }
    }
    return { success: true }
  }

  async createTask(params: CreateTaskParams): Promise<{ taskId: string; videoUrl?: string }> {
    const body: Record<string, any> = {
      model: params.model || DMXAPI_MODEL,
      input: normalizeContent(params.content, params.prompt),
      ...(params.ratio ? { ratio: params.ratio } : {}),
      ...(params.resolution ? { resolution: params.resolution } : {}),
      ...(params.duration !== undefined ? { duration: params.duration } : {}),
      ...(params.generate_audio !== undefined ? { generate_audio: params.generate_audio } : {}),
      ...(params.omniReferenceTaskType ? { omni_reference_task_type: params.omniReferenceTaskType } : {}),
      ...(params.outputFormat ? { output_format: params.outputFormat } : {}),
      ...(params.returnLastFrame !== undefined ? { return_last_frame: params.returnLastFrame } : {}),
    }
    const raw = await this.request<any>('/v1/responses', {
      method: 'POST',
      body: JSON.stringify(body),
    }, CREATE_TIMEOUT_MS)
    const taskId = taskIdFromResponse(raw)
    const videoUrl = findVideoUrl(raw)
    if (!taskId && !videoUrl) {
      const summary = JSON.stringify(raw).slice(0, 500)
      throw new Error(`DMXAPI 未返回可识别的任务 ID，请到平台确认任务，避免重复提交（返回：${summary}）`)
    }
    return { taskId, videoUrl }
  }

  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const raw = await this.request<any>('/v1/responses', {
      method: 'POST',
      body: JSON.stringify({ model: 'seedance-2-5-get', input: taskId }),
    }, QUERY_TIMEOUT_MS)
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
      ratio: params.ratio,
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

  private async request<T>(path: string, init: RequestInit, timeoutMs = QUERY_TIMEOUT_MS): Promise<T> {
    if (!this.apiKey) throw new Error('未配置 DMXAPI API Key')
    const controller = new AbortController()
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
        let detail = ''
        try { detail = JSON.stringify(await res.json()) } catch { detail = res.statusText }
        if (res.status === 401) throw new Error('DMXAPI Key 无效或已过期')
        throw new Error(`DMXAPI 请求失败 ${res.status}：${detail}`)
      }
      return await res.json() as T
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`DMXAPI 请求超时（${Math.round(timeoutMs / 1000)} 秒），请到平台确认任务状态，避免重复提交`)
      }
      throw error
    } finally {
      window.clearTimeout(timer)
    }
  }
}
