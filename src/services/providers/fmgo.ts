// FMGO video adapter, implemented against the supplied Tencent Docs API guide.
// @ts-nocheck
import { UnmauProvider } from './unmau'
import { compressImageToDataUrl } from '../imageProviderUtils'

export const FMGO_BASE = 'https://api.fmgo.top'
interface FmgoModel {
  id: string
  name: string
  description: string
  capabilities: {
    ratios: string[]
    resolutions: string[]
    durationRange: { min: number; max: number }
    durationOptions: number[]
    audioGeneration: boolean
    maxImages: number
    maxVideos: number
  }
}

export const FMGO_MODELS: FmgoModel[] = [
  {
    id: 'feimiao-v2.5-720p-30s',
    name: 'Feimiao 2.5 · 720P · 30秒',
    description: '固定 30 秒，最多 30 张参考图',
    capabilities: {
      ratios: ['16:9', '9:16', '1:1'],
      resolutions: ['720p'],
      durationRange: { min: 30, max: 30 },
      durationOptions: [30],
      audioGeneration: true,
      maxImages: 30,
      maxVideos: 3,
    },
  },
]

const MODEL_IDS = new Set(FMGO_MODELS.map(model => model.id))
const unique = values => [...new Set((values || []).filter(value => typeof value === 'string' && value.trim()))]
const isAbort = signal => signal?.aborted

export function buildFmgoBody(data, refs) {
  const model = FMGO_MODELS.find(item => item.id === data.model)
  if (!model) throw new Error('请选择 FMGO 支持的视频模型')
  const prompt = String(data.prompt || '').replace(/@\[([^\]]*)\]\([^)]*\)/g, '$1').trim()
  if (!prompt) throw new Error('请输入视频提示词')

  const requestedRatio = data.ratio && data.ratio !== 'auto' ? data.ratio : '16:9'
  const ratio = model.capabilities.ratios.includes(requestedRatio) ? requestedRatio : '16:9'

  const images = unique(refs.images)
  const videos = unique(refs.videos)
  const audios = unique(refs.audios)
  if (images.length > 30) throw new Error(`Feimiao 2.5 最多支持 30 张参考图，当前 ${images.length} 张`)
  if (videos.length > 3) throw new Error(`Feimiao 2.5 参考视频最多支持 3 个，当前 ${videos.length} 个`)
  if (audios.length && !images.length && !videos.length) {
    throw new Error('Feimiao 2.5 不能只传参考音频，需同时提供参考图片或参考视频')
  }

  const body = {
    model: model.id,
    prompt,
    aspect_ratio: ratio,
    resolution: '720p',
    seconds: '30',
  }
  if (images.length) body.images = images
  if (videos.length) body.reference_videos = videos
  if (audios.length) body.reference_audios = audios
  body.motion_has_audio = !!data.generateAudio
  return body
}

function first(envelopes, fields) {
  for (const envelope of envelopes) {
    for (const field of fields) {
      const value = field.split('.').reduce((current, key) => current?.[key], envelope)
      if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) return String(value)
    }
  }
  return ''
}

export function mapFmgoTask(raw) {
  const envelopes = [raw?.data?.data, raw?.data, raw?.result, raw?.video, raw?.output, raw]
  const states = envelopes.map(value => String(value?.status || value?.state || '').toLowerCase()).filter(Boolean)
  const failed = ['failed', 'failure', 'error', 'cancelled', 'canceled', 'timeout', 'rejected']
  const completed = ['completed', 'complete', 'succeeded', 'success', 'done', 'finished']
  const pending = ['queued', 'pending', 'submitted', 'not_started']
  const videoUrl = first(envelopes, ['result_url', 'video_url', 'download_url', 'output_url', 'url', 'result.video_url', 'result.url'])
  const status = states.some(value => failed.includes(value)) ? 'failed'
    : states.some(value => completed.includes(value)) || (!states.length && /^https?:\/\//i.test(videoUrl)) ? 'completed'
    : states.some(value => pending.includes(value)) ? 'pending'
    : 'processing'
  const progressRaw = first(envelopes, ['progress', 'progress_percent'])
  const progress = Number.parseFloat(progressRaw.replace('%', ''))
  const result = { status, videoUrl }
  if (Number.isFinite(progress)) result.progress = Math.max(0, Math.min(100, progress <= 1 ? progress * 100 : progress))
  if (status === 'failed') result.error = first(envelopes, ['error.message', 'error', 'message', 'failure_reason', 'fail_reason', 'detail']) || 'FMGO 视频任务失败'
  return result
}

function unpack(response) {
  if (!response?.ok) throw Object.assign(new Error(response?.error || 'FMGO 请求失败'), { retryable: !!response?.retryable })
  return response.data
}

function bridge() {
  if (!window.electronAPI?.fmgo) throw new Error('FMGO 接口组件未加载，请完全退出并重新打开软件')
  return window.electronAPI.fmgo
}

export class FmgoProvider extends UnmauProvider {
  constructor(apiKey = '', baseUrl = FMGO_BASE) {
    super(apiKey, baseUrl)
    this.downloadTimeoutMs = 15 * 60 * 1000
  }

  setBaseUrl(url) { this.baseUrl = (url || FMGO_BASE).trim().replace(/\/+$/, '').replace(/\/v1$/, '') }

  validate() {
    if (this.baseUrl !== FMGO_BASE) throw new Error('FMGO API 地址应为 https://api.fmgo.top')
    if (!this.apiKey.trim()) throw new Error('请在 FMGO API 设置中填写 API Key')
  }

  async testAuth(apiKey) {
    if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) return { success: false, error: '请填写有效的 FMGO API Key' }
    return { success: true }
  }

  buildBody(data, refs) { return buildFmgoBody(data, refs) }

  async request(path, body) {
    this.validate()
    return unpack(await bridge().request({ apiKey: this.apiKey, path, ...(body ? { body } : {}) }))
  }

  async uploadAsset(url, readFile, signal, field = 'images') {
    this.validate()
    if (isAbort(signal)) throw new DOMException('已取消', 'AbortError')
    if (/^https:\/\//i.test(url) || /^data:image\//i.test(url)) return url
    if (/^http:\/\//i.test(url)) throw new Error('FMGO 参考素材请使用 HTTPS 地址')
    if (field !== 'images') throw new Error('FMGO 的参考视频和音频需要使用公网 HTTPS 链接')

    const file = await readFile(url)
    if (isAbort(signal)) throw new DOMException('已取消', 'AbortError')
    if (!file?.size) throw new Error('参考图片为空或无法读取')
    if (file.size > 20 * 1024 * 1024) throw new Error('单张参考图片不能超过 20 MB')
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
    const mimeType = file.type || 'image/png'
    const dataUrl = await compressImageToDataUrl(btoa(binary), mimeType)
    if (isAbort(signal)) throw new DOMException('已取消', 'AbortError')
    return dataUrl
  }

  async createTask(body) {
    const raw = await this.request('/v1/videos', body)
    const envelopes = [raw?.data?.data, raw?.data, raw?.result, raw]
    const taskId = first(envelopes, ['id', 'task_id', 'request_id', 'video_id'])
    if (taskId) return { taskId }
    const state = mapFmgoTask(raw)
    if (state.status === 'completed' && state.videoUrl) return { taskId: '', videoUrl: state.videoUrl }
    throw new Error('FMGO 创建任务未返回任务 ID；请先在平台确认任务状态，避免重复提交')
  }

  async getTaskStatus(taskId) { return mapFmgoTask(await this.request(`/v1/videos/${encodeURIComponent(taskId)}`)) }

  async download(taskId, videoUrl) {
    this.validate()
    const data = unpack(await bridge().download({ apiKey: this.apiKey, taskId, videoUrl }))
    if (!data?.path) throw Object.assign(new Error('FMGO 视频尚未下载到本地'), { retryable: true })
    return 'local-upload:///' + data.path.replace(/\\/g, '/')
  }
}
