// 算力 AI 视频适配器。
// 协议：POST /v1/videos，GET /v1/videos/{task_id}，GET /v1/videos/{task_id}/content。
import { UnmauProvider, mapUnmauTask } from './unmau'

export const SUANLIAI_BASE = 'https://suanliai.top'

const SUANLIAI_DURATION_OPTIONS = Array.from({ length: 26 }, (_, index) => index + 5)
const SUANLIAI_CAPABILITIES = (resolution: '480p' | '720p') => ({
  ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
  resolutions: [resolution],
  durationRange: { min: 5, max: 30 },
  durationOptions: SUANLIAI_DURATION_OPTIONS,
  audioGeneration: false,
  maxImages: 30,
  maxVideos: 10,
  maxAudios: 10,
})

/** 算力 AI 008 系列的精确模型 ID（与 /v1/models 返回值一致）。 */
export const SUANLIAI_MODELS = [
  {
    id: '008系列/sd2.5(30-10-10/5-30秒/480P)',
    name: '008系列/sd2.5 · 30/10/10 · 5–30秒 · 480P',
    description: '算力 AI 008 系列，最多 30 图 / 10 视频 / 10 音频参考',
    capabilities: SUANLIAI_CAPABILITIES('480p'),
  },
  {
    id: '008系列/sd2.5(30-10-10/5-30秒/720P)',
    name: '008系列/sd2.5 · 30/10/10 · 5–30秒 · 720P',
    description: '算力 AI 008 系列，最多 30 图 / 10 视频 / 10 音频参考',
    capabilities: SUANLIAI_CAPABILITIES('720p'),
  },
]

export const isSuanliaiModel = (id: string) => SUANLIAI_MODELS.some(model => model.id === id)

const unique = (values: unknown[]) => [...new Set(values.filter(value => typeof value === 'string' && value.trim()))]

export function buildSuanliaiBody(data: any, refs: { images?: string[]; videos?: string[]; audios?: string[] } = {}) {
  const model = SUANLIAI_MODELS.find(item => item.id === data.model)
  if (!model) throw new Error('请选择算力 AI 的 008 系列 Seedance 2.5 模型')
  const prompt = String(data.prompt || '').replace(/@\[([^\]]*)\]\([^)]*\)/g, '$1').trim()
  if (!prompt) throw new Error('请输入视频提示词')

  const seconds = Number(data.duration ?? 5)
  const { min, max } = model.capabilities.durationRange
  if (!Number.isInteger(seconds) || seconds < min || seconds > max) {
    throw new Error(`${model.name} 的视频时长须为 ${min}–${max} 秒的整数`)
  }

  const aspectRatio = data.ratio || '16:9'
  if (!model.capabilities.ratios.includes(aspectRatio)) throw new Error('请选择此模型支持的画面比例')
  const resolution = model.capabilities.resolutions[0]
  if (data.resolution && String(data.resolution).toLowerCase() !== resolution.toLowerCase()) {
    throw new Error(`${model.name} 仅支持 ${resolution}`)
  }

  const body: any = {
    model: model.id,
    prompt,
    seconds,
    resolution,
    aspect_ratio: aspectRatio,
  }
  for (const [field, limit, label] of [
    ['images', 'maxImages', '参考图'],
    ['videos', 'maxVideos', '参考视频'],
    ['audios', 'maxAudios', '参考音频'],
  ] as const) {
    const values = unique(refs[field] || [])
    if (values.length > model.capabilities[limit]) {
      throw new Error(`${model.name} 最多支持 ${model.capabilities[limit]} 个${label}，当前 ${values.length} 个`)
    }
    if (values.length) body[field] = values
  }
  return body
}

export function mapSuanliaiTask(raw: any) {
  const data = raw?.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data : raw
  const mapped = mapUnmauTask(data)
  const status = String(data?.status || '').toLowerCase()
  if (['queued', 'pending', 'in_progress', 'processing', 'running'].includes(status)) mapped.status = status === 'queued' || status === 'pending' ? 'pending' : 'processing'
  if (['completed', 'succeeded', 'success', 'done'].includes(status)) mapped.status = 'completed'
  if (['failed', 'error', 'cancelled', 'canceled', 'rejected', 'expired'].includes(status)) mapped.status = 'failed'
  const url = data?.url || data?.video_url || data?.download_url || data?.result_url
  if (url) mapped.videoUrl = String(url)
  if (data?.error?.message || typeof data?.error === 'string' || data?.message) {
    mapped.error = data?.error?.message || data?.error || data?.message
  }
  return mapped
}

function bridge() {
  if (!window.electronAPI?.suanliai) throw new Error('算力 AI 接口组件未加载，请完全退出并重新打开软件')
  return window.electronAPI.suanliai
}

function unpack(result: any) {
  if (!result?.ok) throw Object.assign(new Error(result?.error || '算力 AI 请求失败'), { retryable: !!result?.retryable })
  return result.data
}

export class SuanliaiProvider extends UnmauProvider {
  constructor(apiKey = '', baseUrl = SUANLIAI_BASE) {
    super(apiKey, baseUrl)
    this.downloadTimeoutMs = 15 * 60 * 1000
  }

  setBaseUrl(url: string) {
    this.baseUrl = (url || SUANLIAI_BASE).trim().replace(/\/+$/, '').replace(/\/v1$/i, '')
  }

  validate() {
    if (this.baseUrl !== SUANLIAI_BASE) throw new Error('算力 AI 地址应为 https://suanliai.top')
    if (!this.apiKey.trim()) throw new Error('请在算力 AI 设置中填写 API Key')
  }

  buildBody(data: any, refs: any) { return buildSuanliaiBody(data, refs) }
  assetMeta(body: any) { return { model: body.model, prompt: body.prompt, aspect_ratio: body.aspect_ratio, resolution: body.resolution, seconds: body.seconds } }

  async request(path: string, body?: any) {
    this.validate()
    return unpack(await bridge().request({ apiKey: this.apiKey, path, ...(body ? { body } : {}) }))
  }

  async testAuth(key: string) {
    const previous = this.apiKey
    this.apiKey = key
    try {
      const response = await this.request('/v1/models')
      const raw = response?.data || response?.models || response
      const ids = Array.isArray(raw) ? raw.map((model: any) => String(model?.id || model?.model_name || model?.name || '')) : []
      return ids.length === 0 || ids.some(isSuanliaiModel)
        ? { success: true }
        : { success: false, error: '令牌可用，但模型列表中没有算力 AI 008 系列模型，请检查令牌权限' }
    } catch (error: any) {
      return { success: false, error: error.message }
    } finally {
      this.apiKey = previous
    }
  }

  async uploadAsset(url: string, readFile: (url: string) => Promise<File>, signal: AbortSignal, field = 'images') {
    this.validate()
    if (/^(https?:|asset:)/i.test(url)) return url
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
    const file = await readFile(url)
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
    if (!file.size || file.size > 50 * 1024 * 1024) throw new Error('算力 AI 本地参考素材须非空且不超过 50 MB')
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
    const result = unpack(await bridge().upload({
      apiKey: this.apiKey,
      data: btoa(binary),
      fileName: file.name,
      mimeType: file.type || undefined,
      field,
    }))
    const payload = result?.data && typeof result.data === 'object' ? result.data : result
    const values = Array.isArray(payload?.[field]) ? payload[field] : []
    const first = values[0]
    const hosted = typeof first === 'string' ? first : first?.url
    if (!hosted || !/^https?:\/\//i.test(hosted)) throw new Error('算力 AI 素材上传未返回公网地址')
    return hosted
  }

  async createTask(body: any) {
    const raw = await this.request('/v1/videos', body)
    const candidates = [raw, raw?.data, raw?.result, raw?.video, raw?.output]
    const taskId = candidates.flatMap(value => [value?.task_id, value?.id, value?.request_id]).find(value => value !== undefined && value !== null && String(value).trim())
    if (!taskId) {
      const state = mapSuanliaiTask(raw)
      if (state.status === 'completed' && state.videoUrl) return { taskId: '', videoUrl: state.videoUrl }
      throw new Error('算力 AI 未返回任务 ID，请到平台确认任务是否创建，避免重复提交')
    }
    return { taskId: String(taskId) }
  }

  async getTaskStatus(taskId: string) { return mapSuanliaiTask(await this.request(`/v1/videos/${encodeURIComponent(taskId)}`)) }
  async download(taskId: string, directUrl?: string) {
    if (!taskId && directUrl) return directUrl
    this.validate()
    const data = unpack(await bridge().download({ apiKey: this.apiKey, taskId }))
    return 'local-upload:///' + data.path.replace(/\\/g, '/')
  }
}
