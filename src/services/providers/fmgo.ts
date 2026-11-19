// FMGO video adapter, implemented against the supplied Tencent Docs API guide.
// @ts-nocheck
import { UnmauProvider } from './unmau'
import { localMediaMime } from '../imageHost'
import { compressImageToDataUrl } from '../imageProviderUtils'
import catalog from '../../../electron/fmgo-models.json'
import { bindCanvasReferences, connectedCanvasMedia, legacyCanvasUploads } from '@/utils/canvasMedia'
import type { ModelTemplate } from '../modelTemplates'

export const FMGO_BASE = 'https://api.feimiaoapi.com'
const ratios = ['16:9', '9:16', '1:1']
const classic = 'feimiao-v2.5-720p-30s'
export const FMGO_MODELS: ModelTemplate[] = catalog.map(spec => ({
  id: spec.id, name: spec.name, description: spec.description,
  capabilities: { ratios, resolutions: Object.keys(spec.wireModels), durationRange: { min: spec.minSeconds, max: spec.maxSeconds },
    ...(spec.minSeconds === spec.maxSeconds ? { durationOptions: [spec.maxSeconds] } : {}),
    ...(spec.audioGeneration ? { audioGeneration: true } : {}), maxImages: spec.maxImages, maxVideos: spec.maxVideos,
    ...(spec.maxAudios ? { maxAudios: spec.maxAudios } : {}),
  },
}))

export function buildFmgoBody(data, refs = {}) {
  const spec = catalog.find(s => s.id === data.model || Object.values(s.wireModels).includes(data.model))
  if (!spec) throw new Error('请选择飞喵支持的视频模型')
  const prompt = (refs.prompt ?? String(data.prompt || '').replace(/@\[([^\]]*)\]\([^)]*\)/g, '$1')).trim()
  if (!prompt) throw new Error('请输入视频提示词')
  const legacy = spec.id === classic
  const aliasRes = spec.id !== data.model && Object.entries(spec.wireModels).find(([, wire]) => wire === data.model)?.[0]
  const resolution = legacy ? '720p' : String(data.resolution || aliasRes || '720p').toLowerCase()
  if (!Object.hasOwn(spec.wireModels, resolution) || (aliasRes && aliasRes !== resolution)) {
    throw new Error(`${spec.name} 的分辨率须为 ${aliasRes || Object.keys(spec.wireModels).join(' / ')}`)
  }
  const seconds = spec.minSeconds === spec.maxSeconds ? spec.maxSeconds : Number(data.duration ?? spec.minSeconds)
  if (!Number.isInteger(seconds) || seconds < spec.minSeconds || seconds > spec.maxSeconds) throw new Error(`${spec.name} 时长须为 ${spec.minSeconds}～${spec.maxSeconds} 秒的整数`)
  const ratio = !data.ratio || data.ratio === 'auto' || (legacy && !ratios.includes(data.ratio)) ? '16:9' : data.ratio
  if (!ratios.includes(ratio)) throw new Error(`飞喵支持的画面比例：${ratios.join(' / ')}`)
  const { images = [], videos = [], audios = [] } = refs
  if (images.length > spec.maxImages) throw new Error(`${spec.name} 最多支持 ${spec.maxImages} 张参考图，当前 ${images.length} 张`)
  if (videos.length > spec.maxVideos) throw new Error(`${spec.name} 最多支持 ${spec.maxVideos} 段参考视频，当前 ${videos.length} 段`)
  if (spec.maxAudios && audios.length > spec.maxAudios) throw new Error(`${spec.name} 最多支持 ${spec.maxAudios} 段参考音频，当前 ${audios.length} 段`)
  if (audios.length && !images.length && !videos.length) throw new Error('飞喵不能只传参考音频，需同时提供参考图片或参考视频')
  const counts = { 图片: images.length, 视频: videos.length, 音频: audios.length }
  for (const [mention, kind, index] of prompt.matchAll(/@(图片|视频|音频)(\d+)/g)) {
    if (+index < 1 || +index > counts[kind]) throw new Error(`提示词中的 ${mention} 没有对应的参考素材，请重新选择`)
  }
  return { model: spec.wireModels[resolution], prompt, aspect_ratio: ratio, resolution, seconds: String(seconds),
    ...(images.length ? { images } : {}), ...(videos.length ? { reference_videos: videos } : {}), ...(audios.length ? { reference_audios: audios } : {}),
    ...(legacy ? { motion_has_audio: !!data.generateAudio } : {}),
  }
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

function publicHttps(value, label) {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && !url.username && !url.password && !/^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])|\.local$/i.test(url.hostname)) return url.href
  } catch { /* report an unusable reference before generation */ }
  throw new Error(`参考${label}没有可供飞喵读取的公网 HTTPS 直链，尚未提交生成`)
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
    if (this.baseUrl !== FMGO_BASE) throw new Error(`FMGO API 地址应为 ${FMGO_BASE}`)
    if (!this.apiKey.trim()) throw new Error('请在 FMGO API 设置中填写 API Key')
  }

  async testAuth(apiKey) {
    if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) return { success: false, error: '请填写有效的 FMGO API Key' }
    return { success: true }
  }

  prepareReferences(data, nodes, edges, id) {
    const connected = connectedCanvasMedia(id, nodes, edges, true)
    return bindCanvasReferences(data.prompt, [...connected, ...(data._uploads ?? legacyCanvasUploads(data, connected))])
  }
  resumeBody(data) {
    if (data.taskId) return data.fmgoSubmission?.taskId === data.taskId ? data.fmgoSubmission.params :
      { model: data.model, prompt: data.prompt, aspect_ratio: data.ratio, resolution: data.resolution, seconds: data.duration }
  }
  pendingTask(taskId, body, data) {
    if (!taskId) return {}
    const { model, prompt, seconds, resolution, aspect_ratio } = body
    return { fmgoSubmission: { taskId, providerId: data.providerId, model: data.model, params: { model, prompt, seconds, resolution, aspect_ratio },
      images: body.images?.length || 0, videos: body.reference_videos?.length || 0, audios: body.reference_audios?.length || 0 } }
  }
  buildBody(data, refs) { return buildFmgoBody(data, refs) }

  async request(path, body) {
    this.validate()
    return unpack(await bridge().request({ apiKey: this.apiKey, path, ...(body ? { body } : {}) }))
  }

  async prepareAssets(body, readFile, signal, { update }) {
    try {
      for (const [field, kind, label] of [['images', 'image', '图片'], ['reference_videos', 'video', '视频'], ['reference_audios', 'audio', '音频']]) {
        if (!body[field]) continue
        const ready = []
        for (const [index, url] of body[field].entries()) {
          signal.throwIfAborted()
          update({ referenceWarning: `正在准备参考${label} ${index + 1}/${body[field].length}，尚未提交生成…` })
          ready.push(await this.prepareMedia(url, readFile, signal, kind, label, body.model === classic))
        }
        body[field] = ready
      }
    } finally {
      if (!signal.aborted) update({ referenceWarning: undefined })
    }
  }

  async prepareMedia(url, readFile, signal, kind, label, legacy) {
    if (/^https?:\/\//i.test(url)) return publicHttps(url, label)
    const limit = (kind === 'image' ? 20 : 100) * 1024 * 1024
    const sizeError = () => new Error(`参考${label}为空或超过本地上限 ${limit / 1024 / 1024} MB`)
    let dataUrl = url
    if (url.startsWith('local-upload:///')) {
      // Disk IPC already returns base64. Don't decode and re-encode entire video files in the renderer.
      const path = url.slice('local-upload:///'.length)
      const local = await window.electronAPI?.upload?.read(path, limit)
      signal.throwIfAborted()
      if (!local) throw new Error(`无法读取本地参考${label}，请重新添加文件`)
      if (!local.data || local.size > limit) throw sizeError()
      const mime = localMediaMime(path)
      if (!mime.startsWith(kind + '/')) throw new Error(`参考${label}与文件格式不符，请重新添加`)
      dataUrl = kind === 'image' && legacy ? await compressImageToDataUrl(local.data, mime) : `data:${mime};base64,${local.data}`
    } else if (url.startsWith('blob:')) {
      const file = await readFile(url)
      signal.throwIfAborted()
      if (!file?.size || file.size > limit) throw sizeError()
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error(`读取参考${label}失败`))
        reader.readAsDataURL(file)
      })
    }
    const comma = dataUrl.indexOf(',')
    if (comma < 0 || !new RegExp(`^data:${kind}/[\\w.+-]+;base64$`, 'i').test(dataUrl.slice(0, comma))) throw new Error(`参考${label}不是对应类型的本地素材或公网 HTTPS 直链`)
    const encoded = dataUrl.slice(comma + 1)
    const byteCount = (encoded.length / 4) * 3 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0)
    if (!byteCount || byteCount > limit) throw sizeError()
    if (encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error(`参考${label}的数据不完整，请重新添加`)
    signal.throwIfAborted()
    if (kind === 'image') return dataUrl
    // Audio/video data URLs aren't documented for Max/Pro. Stage the bytes without credentials and send only the returned HTTPS link.
    const result = unpack(await bridge().upload({ dataUrl }))
    signal.throwIfAborted()
    return publicHttps(result?.url, label)
  }

  async createTask(body) {
    const raw = await this.request('/v1/videos', body)
    const envelopes = [raw?.data?.data, raw?.data, raw?.result, raw]
    const taskId = first(envelopes, ['id', 'task_id', 'request_id', 'video_id'])
    if (taskId) return { taskId }
    const state = mapFmgoTask(raw)
    if (state.status === 'completed' && state.videoUrl) return { taskId: '', videoUrl: state.videoUrl }
    if (state.status === 'failed') throw new Error(state.error)
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
