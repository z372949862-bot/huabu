import { UnmauProvider } from './unmau'
import { prepareQilingReferences } from '../qilingReferences'
import { ensureAiideMediaUrl } from '../aiideMedia'
import type { ModelTemplate } from '../modelTemplates'

export const LUOCI_BASE = 'https://luocisheng.cn'
export const LUOCI_MODEL = 'seedance-2-5-uncensored'
const ratios = ['adaptive', '16:9', '9:16', '1:1', '3:4', '4:3', '21:9']
const sizes = ['480p', '720p', '1080p']
export const LUOCI_VIDEO_MODELS: ModelTemplate[] = [{
  id: LUOCI_MODEL, name: 'Seedance 2.5 Uncensored',
  description: '480p / 720p / 1080p，4–30 秒或自动时长。480p 5 秒基础价 0.7068 API 积分，参考素材按实时报价。',
  capabilities: { ratios, resolutions: sizes, durationOptions: [-1, ...Array.from({ length: 27 }, (_, i) => i + 4)],
    maxImages: 30, maxVideos: 10, maxAudios: 10, audioGeneration: true, audioGenerationDefault: true },
}]
type Inputs = { images: string[]; videos: string[]; audios: string[]; prompt?: string }
interface Body {
  modelId: string; prompt: string; duration: number; imageSize: string; aspectRatio: string; generateAudio: boolean
  videoInputMode?: string; referenceUrls?: string[]; referenceVideoUrls?: string[]; referenceAudioUrls?: string[]
}
type Submission = { payload: Body; requestKey: string; account?: string }
export interface LuociPending { providerId: string; body: Submission; taskId?: string }
export function luociBody(data: Record<string, any>, refs: Inputs): Body {
  const prompt = String(refs.prompt ?? data.prompt ?? '').trim()
  const imageSize = String(data.resolution || '480p').toLowerCase()
  const aspectRatio = !data.ratio || data.ratio === 'auto' ? 'adaptive' : data.ratio
  const duration = Number(data.duration ?? 5)
  if (data.model !== LUOCI_MODEL || !prompt) throw new Error('请选择洛辞 Seedance 2.5，并填写提示词')
  if (!sizes.includes(imageSize) || !ratios.includes(aspectRatio)) throw new Error('洛辞不支持当前分辨率或画幅')
  if (duration !== -1 && (!Number.isInteger(duration) || duration < 4 || duration > 30)) throw new Error('请选择 4–30 秒或自动时长')
  if (refs.images.length > 30 || refs.videos.length > 10 || refs.audios.length > 10) throw new Error('洛辞最多支持 30 图、10 段视频和 10 段音频')
  const frame = data.luociFrames
  if (frame && (refs.images.length !== frame || refs.videos.length || refs.audios.length)) throw new Error('首帧需要 1 张图，首尾帧需要 2 张有序图片，不能混入视频或音频')
  const body: Body = { modelId: LUOCI_MODEL, prompt, duration, imageSize, aspectRatio, generateAudio: data.generateAudio !== false }
  if (refs.images.length) body.referenceUrls = [...refs.images]
  if (refs.videos.length) body.referenceVideoUrls = [...refs.videos]
  if (refs.audios.length) body.referenceAudioUrls = [...refs.audios]
  if (frame) body.videoInputMode = 'keyframes'
  else if (refs.videos.length || refs.audios.length) body.videoInputMode = 'reference-media'
  else if (refs.images.length) body.videoInputMode = 'references'
  return body
}
export function luociPublicUrl(value: string) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请使用公开 HTTP(S) 素材链接')
  return url.href
}
function unwrap(result: any) {
  if (!result?.ok) throw Object.assign(new Error(result?.error || '洛辞请求失败'), {
    status: result?.status, retryable: !result?.status || result.status >= 500 || result.status === 429,
  })
  return result.data
}
export class LuociVideoProvider extends UnmauProvider {
  declare apiKey: string
  declare baseUrl: string
  downloadTimeoutMs = 15 * 60000
  setBaseUrl(url: string) { this.baseUrl = (url || LUOCI_BASE).trim().replace(/\/+$/, '').replace(/\/api(?:\/v1)?$/, '') }
  validate() {
    if (this.baseUrl !== LUOCI_BASE) throw new Error('洛辞接口地址应为 ' + LUOCI_BASE)
    if (!this.apiKey.trim()) throw new Error('请在洛辞视频设置中填写 API Key')
  }
  private async call(route: string, body?: Body, requestKey?: string, key = this.apiKey) {
    if (this.baseUrl !== LUOCI_BASE || !window.electronAPI?.luociVideo) throw new Error('请使用洛辞官方地址并重新打开桌面软件')
    return unwrap(await window.electronAPI.luociVideo.request({ route, body: body ? JSON.parse(JSON.stringify(body)) : undefined, requestKey, key }))
  }
  async testAuth(key: string) {
    try { await this.call('/api/v1/balance', undefined, undefined, key); return { success: true } }
    catch (e) { return { success: false, error: (e as Error).message } }
  }
  prepareReferences(_data: unknown, nodes: any[], edges: any[], id: string) {
    return prepareQilingReferences(id, nodes, edges, { image: '[Image %n]', video: '[Video %n]', audio: '[Audio %n]' })
  }
  buildBody(data: Record<string, any>, refs: Inputs): Submission {
    return { payload: luociBody(data, refs), requestKey: crypto.randomUUID() }
  }
  async prepareAssets(body: Submission, readFile: (url: string) => Promise<File>, signal: AbortSignal) {
    for (const field of ['referenceUrls', 'referenceVideoUrls', 'referenceAudioUrls'] as const) {
      const urls = body.payload[field]
      if (!urls) continue
      for (const [index, url] of urls.entries()) {
        signal.throwIfAborted()
        if (/^https?:\/\//i.test(url)) { urls[index] = luociPublicUrl(url); continue }
        if (!/^(local-upload:|blob:|data:)/i.test(url)) throw new Error('请选择本地素材或填写公网链接')
        const file = await readFile(url)
        const limit = field === 'referenceAudioUrls' ? 20 : 100
        if (!file.size || file.size > limit * 1024 * 1024) throw new Error('本地参考素材为空或超过 ' + limit + ' MB')
        signal.throwIfAborted()
        urls[index] = luociPublicUrl(await ensureAiideMediaUrl(url, file))
      }
    }
  }
  private async accountFingerprint() {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(this.apiKey.trim()))
    return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('')
  }
  async quote(body: Submission) {
    body.account = await this.accountFingerprint()
    const result = await this.call('/api/v1/videos/quote', body.payload)
    const value = result?.estimatedPoints ?? result?.quote?.estimatedPoints
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('未取得有效的洛辞报价')
    return value
  }
  async createTask(body: Submission) {
    if (body.account !== await this.accountFingerprint()) throw new Error('请恢复原洛辞密钥后继续上次提交')
    const result = await this.call('/api/v1/videos/generations', body.payload, body.requestKey)
    if (!result?.taskId || typeof result.taskId !== 'string') throw new Error('洛辞未返回任务号，再次点击将使用原提交标识恢复')
    return { taskId: result.taskId }
  }
  resumeBody(data: { luociTask?: LuociPending }) { return data.luociTask?.body }
  pendingTask(taskId: string | undefined, body: Submission, data: { providerId: string }) {
    return { luociTask: { taskId, body, providerId: data.providerId } }
  }
  clearPendingTask() { return { luociTask: undefined } }
  async getTaskStatus(taskId: string) {
    const { task } = await this.call('/api/v1/tasks/' + encodeURIComponent(taskId))
    if (!task) throw new Error('洛辞未返回任务状态')
    const billing = task.settled === true && typeof task.chargedPoints === 'number' ? { chargedPoints: task.chargedPoints } : {}
    if (['succeeded', 'partial', 'failed'].includes(task.status)) {
      const videoUrl = task.videos?.find((v: any) => v.available !== false && v.url)?.url
      if (task.status === 'failed' || !videoUrl) return { status: 'failed', error: task.error?.message || task.error || '洛辞任务未返回可下载的成片', ...billing }
      return { status: 'completed', progress: 100, videoUrl, ...billing }
    }
    return { status: 'processing', progress: Number(task.progress) || 0 }
  }
  async download(id: string, url?: string) {
    const result = unwrap(await window.electronAPI?.luociVideo?.download({ key: this.apiKey, taskId: id, url }))
    return 'local-upload:///' + result.path.replace(/\\/g, '/')
  }
  assetMeta({ payload }: Submission) {
    return { model: payload.modelId, prompt: payload.prompt, aspect_ratio: payload.aspectRatio,
      resolution: payload.imageSize, duration: payload.duration === -1 ? undefined : payload.duration }
  }
}
