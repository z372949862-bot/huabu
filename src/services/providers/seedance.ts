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

const DEFAULT_BASE_URL = 'https://api.aiid.edu.kg'
const DEFAULT_MODEL = 'doubao-seedance-2-0-260128'

/**
 * 把网关任务查询返回 normalize 成内部 TaskStatus 形状。
 * 纯函数，方便单测：直接喂示例 JSON 验证 4 种状态映射。
 */
export function mapTaskResponse(raw: any): TaskStatus {
  const rawStatus = raw?.status ?? raw?.items?.[0]?.status ?? 'queued'
  const statusMap: Record<string, TaskStatus['status']> = {
    queued: 'pending',
    running: 'processing',
    succeeded: 'completed',
    failed: 'failed',
  }
  const status = statusMap[rawStatus] || 'processing'

  const videoUrl =
    raw?.content?.video_url ||
    raw?.items?.[0]?.content?.video_url ||
    raw?.items?.[0]?.video_url ||
    undefined

  const progressRaw = raw?.progress ?? raw?.items?.[0]?.progress
  const progressNum = typeof progressRaw === 'number' ? progressRaw : parseInt(progressRaw, 10)
  const progress = Number.isFinite(progressNum)
    ? progressNum
    : status === 'completed'
      ? 100
      : status === 'pending'
        ? 5
        : undefined

  const errorMsg =
    raw?.error?.message ||
    (typeof raw?.items?.[0]?.error === 'string' ? raw.items[0].error : undefined) ||
    raw?.items?.[0]?.error?.message ||
    undefined

  return { status, progress, videoUrl, error: errorMsg }
}

export class SeedanceProvider implements AIProvider {
  name = 'Seedance'
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
    return url.trim().replace(/\/+$/, '')
  }

  /**
   * 不发请求，纯本地校验：sk- 前缀 + 长度 ≥ 20。
   * key 是否真的有效要等首次生成才知道。
   */
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
    const data = await this.request<{ id: string }>('/api/v3/contents/generations/tasks', {
      method: 'POST',
      body: JSON.stringify({
        model: params.model || DEFAULT_MODEL,
        prompt: params.prompt,
        ...(params.mode ? { mode: params.mode } : {}),
        ...(params.image_url ? { image_url: params.image_url } : {}),
        ...(params.image_urls?.length ? { image_urls: params.image_urls } : {}),
        ...(params.content?.length ? { content: params.content } : {}),
        ...(params.ratio ? { ratio: params.ratio } : {}),
        ...(params.resolution ? { resolution: params.resolution } : {}),
        ...(params.duration != null ? { duration: params.duration } : {}),
        ...(params.fps != null ? { fps: params.fps } : {}),
        ...(params.generate_audio != null ? { generate_audio: params.generate_audio } : {}),
      }),
    })
    if (!data?.id) throw new Error('创建任务失败：未返回任务 ID')
    return { taskId: data.id }
  }

  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const data = await this.request<any>(
      `/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`,
      { method: 'GET' }
    )
    return mapTaskResponse(data)
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
    throw new Error('Seedance 不支持文生图，请接入绘图供应商')
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
