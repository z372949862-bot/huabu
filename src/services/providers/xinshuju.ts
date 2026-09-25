// @ts-nocheck
import { UnmauProvider } from './unmau'
import { compressYu25Image } from './yu25'

export const XINSHUJU_BASE = 'https://www.xinshuju.net'

const sharedCapabilities = {
  ratios: ['16:9', '9:16', '1:1'],
  durationRange: { min: 4, max: 30 },
  audioGeneration: true,
  maxImages: 30,
  maxVideos: 0,
  maxAudios: 10,
}

export const XINSHUJU_MODELS = [
  { id: '2-seedance-2.5', name: '2线路 · Seedance 2.5 · 支持真人', description: '心数据 · 480P/720P/1080P · 4–30秒 · 30图/0视频/10音频', capabilities: { ...sharedCapabilities, resolutions: ['480p', '720p', '1080p'] } },
  { id: '3-seedance-2.5-720p', name: '3线路 · Seedance 2.5 · 按条计费', description: '心数据 · 720P · 4–30秒 · 30图/0视频/10音频', capabilities: { ...sharedCapabilities, resolutions: ['720p'] } },
  { id: '4-seedance-2.5-720p', name: '4线路 · Seedance 2.5 · 支持真人', description: '心数据 · 720P · 4–30秒 · 30图/0视频/10音频', capabilities: { ...sharedCapabilities, resolutions: ['720p'] } },
]

export const isXinshujuModel = id => XINSHUJU_MODELS.some(model => model.id === id)
const unique = values => [...new Set((values || []).filter(value => typeof value === 'string' && value.trim()))]
const at = (data, path) => path.split('.').reduce((value, key) => value?.[key], data)
const first = (data, paths) => paths.map(path => at(data, path)).find(value => (typeof value === 'string' || typeof value === 'number') && String(value).trim()) ?? ''

export function buildXinshujuBody(data, refs) {
  const model = XINSHUJU_MODELS.find(item => item.id === data.model)
  if (!model) throw new Error('请选择心数据支持的 Seedance 2.5 模型')
  const prompt = String(data.prompt || '').replace(/@\[([^\]]*)\]\([^)]*\)/g, '$1').trim()
  if (!prompt) throw new Error('请输入视频提示词')
  const duration = Number(data.duration ?? 15)
  if (!Number.isInteger(duration) || duration < 4 || duration > 30) throw new Error('心数据 Seedance 2.5 时长须为 4–30 秒的整数')
  const ratio = data.ratio || '16:9'
  if (!model.capabilities.ratios.includes(ratio)) throw new Error('心数据 Seedance 2.5 支持 16:9、9:16、1:1')
  const resolution = String(data.resolution || (model.id === '2-seedance-2.5' ? '720p' : model.capabilities.resolutions[0])).toLowerCase()
  if (!model.capabilities.resolutions.includes(resolution)) throw new Error(`${model.name} 支持的分辨率：${model.capabilities.resolutions.join('、')}`)
  const images = unique(refs.images), videos = unique(refs.videos), audios = unique(refs.audios)
  if (images.length > 30) throw new Error(`该模型最多支持 30 张参考图，当前 ${images.length} 张`)
  if (videos.length) throw new Error('该模型不支持参考视频，请移除视频素材')
  if (audios.length > 10) throw new Error(`该模型最多支持 10 个参考音频，当前 ${audios.length} 个`)
  return {
    model: model.id,
    prompt,
    images,
    audios,
    generate_audio: !!data.generateAudio,
    ratio,
    duration,
    watermark: false,
    resolution,
  }
}

export function adaptXinshujuCreateBody(body) {
  const content = [{ type: 'text', text: body.prompt }]
  for (const url of body.images || []) content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' })
  for (const url of body.audios || []) content.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' })
  return {
    model: body.model,
    content,
    generate_audio: !!body.generate_audio,
    ratio: body.ratio,
    duration: body.duration,
    watermark: false,
    resolution: body.resolution,
  }
}

export function mapXinshujuTask(raw) {
  const status = String(first(raw, ['status','state','data.status','data.state','data.data.status','data.data.state','result.status','result.state','video.status','output.status'])).toLowerCase()
  const videoUrl = String(first(raw, ['video_url','output_url','download_url','result_url','url','metadata.result_url','data.video_url','data.output_url','data.download_url','data.result_url','data.url','data.metadata.result_url','data.data.video_url','data.data.output_url','data.data.url','result.video_url','result.output_url','result.url','video.video_url','video.url','output.video_url','output.url','outputs.0.video_url','outputs.0.url','data.outputs.0.video_url','data.outputs.0.url']))
  const success = ['completed','complete','succeeded','success','done','finished','ready']
  const failed = ['failed','failure','fail','error','cancelled','canceled','rejected','expired','timeout','timed_out']
  const pending = ['pending','queued','submitted','not_start','not_started']
  const result = {
    status: failed.includes(status) ? 'failed' : success.includes(status) || (!status && /^https?:\/\//.test(videoUrl)) ? 'completed' : pending.includes(status) ? 'pending' : 'processing',
    videoUrl,
  }
  const progress = Number.parseFloat(String(first(raw, ['progress','progress_percent','data.progress','data.progress_percent'])).replace('%',''))
  if (Number.isFinite(progress)) result.progress = Math.max(0, Math.min(100, progress <= 1 ? progress * 100 : progress))
  if (result.status === 'failed') result.error = String(first(raw, ['error.message','error','fail_reason','message','detail','data.error.message','data.error','data.fail_reason','data.message','data.detail','result.error.message','result.error']) || `任务状态为 ${status}`)
  return result
}

function bridge() {
  if (!window.electronAPI?.xinshuju) throw new Error('心数据接口组件未加载，请完全退出并重新打开软件')
  return window.electronAPI.xinshuju
}
function unpack(result) {
  if (!result?.ok) throw Object.assign(new Error(result?.error || '心数据请求失败'), { retryable: !!result?.retryable })
  return result.data
}

export class XinshujuProvider extends UnmauProvider {
  constructor(apiKey = '', baseUrl = XINSHUJU_BASE) {
    super(apiKey, baseUrl)
    this.downloadTimeoutMs = 15 * 60 * 1000
  }
  setBaseUrl(url) { this.baseUrl = (url || XINSHUJU_BASE).trim().replace(/\/+$/, '').replace(/\/v1$/, '') }
  validate() {
    if (this.baseUrl !== XINSHUJU_BASE) throw new Error('心数据地址应为 https://www.xinshuju.net')
    if (!this.apiKey.trim()) throw new Error('请在心数据设置中填写 API Key')
  }
  buildBody(data, refs) { return buildXinshujuBody(data, refs) }
  assetMeta(body) { return { model: body.model, prompt: body.prompt, ratio: body.ratio, resolution: body.resolution, duration: body.duration } }
  async request(path, body) {
    this.validate()
    return unpack(await bridge().request({ apiKey: this.apiKey, path, ...(body ? { body } : {}) }))
  }
  async testAuth(key) {
    const previous = this.apiKey
    this.apiKey = key
    try {
      const response = await this.request('/v1/models')
      const ids = (response?.data || response?.models || response || []).map?.(model => model.id) || []
      return ids.some(isXinshujuModel)
        ? { success: true }
        : { success: false, error: '令牌可用，但模型列表中没有心数据 Seedance 2.5，请检查令牌分组' }
    } catch (error) { return { success: false, error: error.message } }
    finally { this.apiKey = previous }
  }
  async uploadAsset(url, readFile, signal, field = 'images') {
    if (/^https:\/\//i.test(url)) return url
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
    let file = await readFile(url)
    if (field === 'images') file = await compressYu25Image(file)
    const limit = field === 'images' ? 2 : 20
    if (!file.size || file.size > limit * 1024 * 1024) throw new Error(`心数据本地${field === 'images' ? '图片' : '音频'}须不超过 ${limit} MB`)
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
    return `data:${file.type || 'application/octet-stream'};base64,${btoa(binary)}`
  }
  async createTask(body) {
    const raw = await this.request('/v1/videos', adaptXinshujuCreateBody(body))
    const taskId = String(first(raw, ['task_id','id','request_id','data.task_id','data.id','data.request_id','data.data.task_id','data.data.id','result.task_id','result.id']))
    if (!taskId) {
      const state = mapXinshujuTask(raw)
      if (state.status === 'completed' && state.videoUrl) return { taskId: '', videoUrl: state.videoUrl }
      throw new Error('心数据未返回任务 ID，请到平台确认任务是否创建，避免重复提交')
    }
    return { taskId }
  }
  async getTaskStatus(taskId) { return mapXinshujuTask(await this.request(`/v1/videos/${encodeURIComponent(taskId)}`)) }
  async download(taskId, videoUrl) {
    const data = unpack(await bridge().download({ apiKey: this.apiKey, taskId, videoUrl }))
    return 'local-upload:///' + data.path.replace(/\\/g, '/')
  }
}
