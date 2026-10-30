// AIMI Seedance 2.5 video adapter. Model-specific fields are translated here.
// @ts-nocheck
import { UnmauProvider } from './unmau'

export const AIMI_BASE = 'https://aimiapi.com'
const ratios = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']
const shared = { ratios, maxImages: 30, maxVideos: 10, maxAudios: 10 }

export const AIMI_MODELS = [
  { id: 'JL-seedance-2.5-480p', name: 'JL Seedance 2.5 · 480P', description: '5–30 秒，参考素材 30 图 / 10 视频 / 10 音频，¥0.25/秒', capabilities: { ...shared, resolutions: ['480p'], durationRange: { min: 5, max: 30 }, audioGeneration: true, audioGenerationDefault: true } },
  { id: 'JL-seedance-2.5-720p', name: 'JL Seedance 2.5 · 720P', description: '4–30 秒，参考素材 30 图 / 10 视频 / 10 音频，¥0.40/秒', capabilities: { ...shared, resolutions: ['720p'], durationRange: { min: 4, max: 30 }, audioGeneration: true, audioGenerationDefault: true } },
  { id: 'sd2.5-n-480p', name: 'Seedance 2.5 N · 480P', description: '4–30 秒；支持参考音频，须搭配参考图', capabilities: { ...shared, resolutions: ['480p'], durationRange: { min: 4, max: 30 } } },
  { id: 'sd2.5-n-720p', name: 'Seedance 2.5 N · 720P', description: '4–30 秒；支持参考音频，须搭配参考图', capabilities: { ...shared, resolutions: ['720p'], durationRange: { min: 4, max: 30 } } },
]

const modelById = new Map(AIMI_MODELS.map(model => [model.id, model]))
const unique = values => [...new Set((values || []).filter(value => typeof value === 'string' && value.trim()))]
const first = (raw, paths) => paths.map(path => path.split('.').reduce((value, key) => value?.[key], raw)).find(value => (typeof value === 'string' || typeof value === 'number') && String(value).trim())

export function buildAimiBody(data, refs) {
  const model = modelById.get(data.model)
  if (!model) throw new Error('请选择 AIMI 支持的 Seedance 2.5 型号')
  const prompt = String(data.prompt || '').replace(/@\[([^\]]*)\]\([^)]*\)/g, '$1').trim()
  if (!prompt) throw new Error('请输入视频提示词')
  const duration = Number(data.duration ?? model.capabilities.durationRange.min)
  const { min, max } = model.capabilities.durationRange
  if (!Number.isInteger(duration) || duration < min || duration > max) throw new Error(`${model.name} 时长须为 ${min}–${max} 秒的整数`)
  const resolution = String(data.resolution || model.capabilities.resolutions[0]).toLowerCase()
  if (!model.capabilities.resolutions.includes(resolution)) throw new Error(`${model.name} 仅支持 ${model.capabilities.resolutions[0]}`)
  const aspectRatio = data.ratio && data.ratio !== 'auto' ? data.ratio : '16:9'
  if (!ratios.includes(aspectRatio)) throw new Error('AIMI Seedance 2.5 支持 21:9、16:9、4:3、1:1、3:4、9:16')
  const images = unique(refs.images), videos = unique(refs.videos), audios = unique(refs.audios)
  for (const [items, limit, label] of [[images, 30, '参考图'], [videos, 10, '参考视频'], [audios, 10, '参考音频']]) {
    if (items.length > limit) throw new Error(`${model.name} 最多支持 ${limit} 个${label}，当前 ${items.length} 个`)
  }
  if (model.id.startsWith('sd2.5-n') && audios.length && !images.length) throw new Error('sd2.5-n 参考音频必须搭配至少一张参考图')
  return {
    model: model.id, prompt, seconds: duration, resolution, aspect_ratio: aspectRatio,
    ...(images.length ? { images } : {}),
    ...(videos.length ? { videos } : {}),
    ...(audios.length ? { audios } : {}),
    ...(model.capabilities.audioGeneration ? { generate_audio: data.generateAudio !== false } : {}),
  }
}

export function adaptAimiCreateBody(body) {
  const supportsAudioGeneration = /^JL-seedance-2\.5-/i.test(String(body.model || ''))
  return {
    model: body.model, prompt: body.prompt, seconds: body.seconds,
    resolution: body.resolution, aspect_ratio: body.aspect_ratio,
    ...(body.images ? { reference_image_urls: body.images } : {}),
    ...(body.videos ? { reference_video_urls: body.videos } : {}),
    ...(body.audios ? { reference_audio_urls: body.audios } : {}),
    ...(supportsAudioGeneration && body.generate_audio !== undefined ? { enable_audio: body.generate_audio } : {}),
  }
}

function isAimiVideoUrl(value) {
  if (typeof value !== 'string') return false
  const candidate = value.trim().toLowerCase()
  if (!candidate.startsWith('https://') && !candidate.startsWith('http://') && !(candidate.startsWith('/') && !candidate.startsWith('//'))) return false
  try {
    const url = new URL(value.trim(), AIMI_BASE)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}

export function mapAimiTask(raw) {
  const statusText = String(first(raw, ['status', 'state', 'data.status', 'data.state', 'task.status', 'data.task.status']) || '').trim().toLowerCase()
  const states = { queued: 'pending', submitted: 'pending', pending: 'pending', in_progress: 'processing', processing: 'processing', running: 'processing', completed: 'completed', complete: 'completed', succeeded: 'completed', success: 'completed', done: 'completed', failed: 'failed', failure: 'failed', canceled: 'failed', cancelled: 'failed', error: 'failed' }
  const status = states[statusText] || 'processing'
  const progressValue = Number.parseFloat(String(first(raw, ['progress', 'data.progress', 'task.progress', 'data.task.progress']) || '').replace('%', ''))
  const videoPaths = ['metadata.url', 'data.metadata.url', 'url', 'video_url', 'result_url', 'data.url', 'data.video_url', 'data.result_url', 'result.url', 'result.video_url', 'videos.0.url', 'task.videos.0.url', 'data.videos.0.url', 'data.task.videos.0.url']
  // AIMI task logs may put the failure message in result_url; it is not media.
  const videoUrl = status === 'failed' ? undefined : videoPaths.map(path => first(raw, [path])).find(isAimiVideoUrl)
  const error = first(raw, ['fail_reason', 'failure_reason', 'error.message', 'error', 'message', 'detail'].flatMap(field => ['', 'data.', 'task.', 'data.task.'].map(prefix => prefix + field)))
    || (status === 'failed' ? ['result_url', 'data.result_url', 'task.result_url', 'data.task.result_url'].map(path => first(raw, [path])).find(value => typeof value === 'string' && value.trim() && !isAimiVideoUrl(value)) : undefined)
  return { status, ...(Number.isFinite(progressValue) ? { progress: Math.max(0, Math.min(100, progressValue <= 1 ? progressValue * 100 : progressValue)) } : {}), ...(videoUrl ? { videoUrl: String(videoUrl) } : {}), ...(status === 'failed' ? { error: String(error || `AIMI 任务失败：${statusText}`) } : {}) }
}

const uniqueMime = file => file.type || 'application/octet-stream'
function bridge() {
  if (!window.electronAPI?.aimi) throw new Error('AIMI 接口组件未加载，请完全退出并重新打开软件')
  return window.electronAPI.aimi
}
function unpack(result) {
  if (!result?.ok) throw Object.assign(new Error(result?.error || 'AIMI 请求失败'), { retryable: !!result?.retryable })
  return result.data
}

export class AimiProvider extends UnmauProvider {
  constructor(apiKey = '', baseUrl = AIMI_BASE) { super(apiKey, baseUrl); this.downloadTimeoutMs = 15 * 60 * 1000 }
  setBaseUrl(url) { this.baseUrl = (url || AIMI_BASE).trim().replace(/\/+$/, '').replace(/\/v1$/i, '') }
  validate() {
    if (this.baseUrl !== AIMI_BASE) throw new Error(`AIMI API 地址应为 ${AIMI_BASE}`)
    if (!this.apiKey.trim()) throw new Error('请在 AIMI 设置中填写 API Key')
  }
  buildBody(data, refs) { return buildAimiBody(data, refs) }
  assetMeta(body) { return { model: body.model, prompt: body.prompt, ratio: body.aspect_ratio, resolution: body.resolution, duration: body.seconds } }
  async request(path, body) { this.validate(); return unpack(await bridge().request({ apiKey: this.apiKey, path, ...(body ? { body } : {}) })) }
  async testAuth(key) {
    const previous = this.apiKey; this.apiKey = key
    try {
      const result = await this.request('/v1/models')
      const list = result?.data || result?.models || result
      const ids = Array.isArray(list) ? list.map(model => model.id) : []
      return ids.some(id => modelById.has(id)) ? { success: true } : { success: false, error: '令牌可用，但模型列表中没有 AIMI Seedance 2.5 型号，请检查令牌权限' }
    } catch (error) { return { success: false, error: error.message } }
    finally { this.apiKey = previous }
  }
  async uploadAsset(url, readFile, signal, field = 'images') {
    this.validate()
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
    if (/^https:\/\//i.test(url)) return url
    if (/^http:\/\//i.test(url)) throw new Error('AIMI 参考素材必须使用 HTTPS 直链')
    const type = field === 'images' ? 'image' : field === 'videos' ? 'video' : field === 'audios' ? 'audio' : ''
    if (!type) throw new Error('AIMI 不支持该参考素材类型')
    const file = await readFile(url)
    if (!file?.size) throw new Error('参考素材为空或无法读取')
    const limit = type === 'video' ? 64 : 20
    if (file.size > limit * 1024 * 1024) throw new Error(`AIMI 本地${type === 'image' ? '图片' : type === 'video' ? '视频' : '音频'}不能超过 ${limit} MB`)
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
    const result = unpack(await bridge().upload({ apiKey: this.apiKey, kind: type, data: btoa(binary), fileName: file.name, mimeType: uniqueMime(file) }))
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
    const uploaded = result?.data || result
    if (uploaded?.success === false || typeof uploaded?.url !== 'string' || !uploaded.url.trim()) throw new Error('AIMI 素材上传未返回有效 URL')
    const hosted = new URL(uploaded.url, AIMI_BASE)
    if (hosted.protocol !== 'https:') throw new Error('AIMI 素材上传返回了无效的 HTTPS 地址')
    return hosted.href
  }
  async createTask(body) {
    const result = await this.request('/v1/videos', adaptAimiCreateBody(body))
    const taskId = first(result, ['task_id', 'id', 'data.task_id', 'data.id'])
    if (!taskId) throw new Error('AIMI 未返回任务 ID，请先到平台确认任务是否已创建，避免重复提交')
    return { taskId: String(taskId) }
  }
  async getTaskStatus(taskId) { return mapAimiTask(await this.request(`/v1/videos/${encodeURIComponent(taskId)}`)) }
  async download(taskId, videoUrl) {
    this.validate()
    const data = unpack(await bridge().download({ apiKey: this.apiKey, taskId, videoUrl }))
    if (!data?.path) throw Object.assign(new Error('AIMI 视频尚未下载到本地'), { retryable: true })
    return 'local-upload:///' + data.path.replace(/\\/g, '/')
  }
}
