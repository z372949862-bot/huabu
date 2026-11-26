import { UnmauProvider, mapUnmauTask } from './unmau'
import type { ModelTemplate } from '../modelTemplates'
import { localMediaMime } from '../imageHost'
import { bindCanvasReferences, connectedCanvasMedia, legacyCanvasUploads, type MediaKind } from '@/utils/canvasMedia'

export const FLYAPI_BASE = 'https://flyapi.vip'
export const FLYAPI_DEPTH_MODEL = 'h3-shipinzhuanshendu'
export const FLYAPI_VIDEO_MODEL = 'seedance2.5-D'
export const FLYAPI_MAGI2_MODEL = 'magi-2'
const MODEL = FLYAPI_VIDEO_MODEL
const assetBase = '/kyyReactApiServer/asset/seedance2/'
const ratios = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive']
const resolutions = ['480p', '720p', '1080p']
export type FlyapiCatalog = 'seedance' | 'magi2'
const media = [
  { field: 'reference_images', input: 'images', type: 'Image', kind: 'image', label: '图片', max: 30 },
  { field: 'reference_videos', input: 'videos', type: 'Video', kind: 'video', label: '视频', max: 10 },
  { field: 'reference_audios', input: 'audios', type: 'Audio', kind: 'audio', label: '音频', max: 10 },
] as const
const seedanceCapabilities = { ratios, resolutions, durationRange: { min: 4, max: 30 }, maxImages: 30, maxVideos: 10, maxAudios: 10, maxTotalReferences: 50, audioGeneration: false }
const magi2Capabilities = { ratios: [...ratios], resolutions: [...resolutions], durationRange: { min: 4, max: 30 }, maxImages: 30, maxVideos: 10, maxAudios: 10, maxTotalReferences: 50, audioGeneration: false }
export const FLYAPI_MODELS: ModelTemplate[] = [{ id: MODEL, name: 'Seedance 2.5-D',
  description: '4–30 秒；支持 480p / 720p / 1080p，最多 30 张图片、10 段视频和 10 段音频。',
  capabilities: { ...seedanceCapabilities },
}]
export const FLYAPI_MAGI2_MODELS: ModelTemplate[] = [{ id: FLYAPI_MAGI2_MODEL, name: 'Magi-2 · OpenAI Video',
  description: '独立模型；4–30 秒，480p / 720p / 1080p，支持图片、视频和音频参考。',
  capabilities: { ...magi2Capabilities },
}]

type Params = { model: string; prompt: string; aspect_ratio: string; resolution: string; duration: number }
type Body = Omit<Params, 'model'> & { model: string } & Partial<Record<typeof media[number]['field'], string[]>>
type Inputs = ReturnType<typeof bindCanvasReferences>
type SavedParams = Pick<Params, 'model' | 'prompt' | 'duration'> & Partial<Pick<Params, 'resolution' | 'aspect_ratio'>>
interface Counts { images: number; videos: number; audios: number }
export interface FlyapiPending { taskId?: string; providerId: string; submissionId?: string; params?: SavedParams; counts?: Counts }
export interface FlyapiReceipt extends Counts { taskId: string; providerId: string; model: string }
interface Journal {
  providerId: string
  save: (submissionId: string, pending?: FlyapiPending, receipt?: FlyapiReceipt) => Promise<void>
}
export const isFlyapiTaskId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,511}$/.test(value)
const assetPattern = /^asset_[A-Za-z0-9_-]+$/
function assetId(value: string) {
  const id = value.replace(/^(?:assetId|asset):\/\//i, '')
  return assetPattern.test(id) ? id : undefined
}
export function flyapiReference(value: string) {
  const id = assetId(value)
  if (id) return 'assetId://' + id
  try {
    const url = new URL(value)
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href
  } catch { /* handled below */ }
  throw new Error('请填写公开 HTTP(S) 素材链接，或 FlyAPI 的 assetId://asset_… 素材 ID')
}
export function buildFlyapiBody(data: Record<string, any>, refs: Inputs, catalog: FlyapiCatalog = 'seedance'): Body {
  const expectedModel = catalog === 'magi2' ? FLYAPI_MAGI2_MODEL : MODEL
  if (data.model !== expectedModel) throw new Error(catalog === 'magi2' ? '请选择 FlyAPI 的 Magi-2 模型' : '请选择 FlyAPI 的 Seedance 2.5-D 模型')
  const prompt = refs.prompt.trim()
  if (!prompt) throw new Error('请输入视频提示词')
  const duration = Number(data.duration ?? 4)
  if (!Number.isInteger(duration) || duration < 4 || duration > 30) throw new Error('FlyAPI 时长须为 4–30 秒的整数')
  const ratio = data.ratio === 'auto' ? 'adaptive' : data.ratio || '16:9'
  const resolution = String(data.resolution || '720p').toLowerCase()
  if (!ratios.includes(ratio) || !resolutions.includes(resolution)) throw new Error('FlyAPI 不支持所选画幅或分辨率')
  const body: Body = { model: data.model, prompt, duration, aspect_ratio: ratio, resolution }
  for (const { field, input, label, max } of media) {
    const slots = refs[input]
    if (slots.length > max) throw new Error(`FlyAPI 最多支持 ${max} 个参考${label}，当前 ${slots.length} 个`)
    if (slots.length) body[field] = [...slots]
  }
  for (const [,label,number] of prompt.matchAll(/@(图片|视频|音频)(\d+)/g)) {
    const list = media.find(m => m.label === label)!
    if (+number < 1 || +number > refs[list.input].length) throw new Error(`@${label}${number} 没有对应的参考素材`)
  }
  return body
}
function openaiVideoModel(model: unknown) {
  if (!model || typeof model !== 'object' || typeof (model as { id?: unknown }).id !== 'string') return false
  const endpoints = (model as { supported_endpoint_types?: unknown }).supported_endpoint_types
  return !Array.isArray(endpoints) || endpoints.includes('openai-video')
}
function findMagi2ModelId(models: unknown) {
  if (!Array.isArray(models)) return undefined
  const available = models.filter(openaiVideoModel) as Array<{ id: string; supported_endpoint_types?: unknown }>
  const exact = available.find(model => model.id.toLowerCase() === FLYAPI_MAGI2_MODEL)
  if (exact) return exact.id
  const named = available.find(model => /magi[-_]?2/i.test(model.id))
  if (named) return named.id
  const single = available[0]
  return available.length === 1 && Array.isArray(single?.supported_endpoint_types) && !/(seedance|sora|kling|superresolution|h3|sd2(?:\.?5)?)/i.test(single.id) ? single.id : undefined
}
function bridge() {
  if (!window.electronAPI?.flyapi) throw new Error('请使用已接入 FlyAPI 的桌面版')
  return window.electronAPI.flyapi
}
function unpack<T>(result: { ok: boolean; data?: T; error?: string; retryable?: boolean; status?: number }): T {
  if (!result?.ok) throw Object.assign(new Error(result?.error || 'FlyAPI 请求失败'), { retryable: !!result?.retryable, status: result?.status })
  return result.data as T
}
const localLimit = 100 * 1024 * 1024
export async function stageFlyapiLocal(url: string, kind: MediaKind, readFile: (url: string) => Promise<File>, signal: AbortSignal) {
  let dataUrl = url
  if (url.startsWith('local-upload:///')) {
    const path = url.slice('local-upload:///'.length)
    const file = await window.electronAPI?.upload?.read(path, localLimit)
    if (!file?.data || !file.size || file.size > localLimit) throw new Error('本地素材不可读、为空或超过 100 MB，请检查原文件')
    dataUrl = `data:${localMediaMime(path)};base64,${file.data}`
  } else if (url.startsWith('blob:')) {
    const file = await readFile(url)
    if (!file?.size || file.size > localLimit) throw new Error('本地素材为空或超过 100 MB')
    dataUrl = await new Promise<string>((resolve,reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('读取本地素材失败')); reader.readAsDataURL(file)
    })
  }
  if (!dataUrl.startsWith(`data:${kind}/`) || !/^data:[^,]+;base64,/.test(dataUrl)) throw new Error('本地素材格式与所选参考类型不符')
  if (dataUrl.length > Math.ceil(localLimit / 3) * 4 + 128) throw new Error('单个本地素材不能超过 100 MB')
  signal.throwIfAborted()
  const result = unpack(await bridge().upload({ dataUrl }))
  if (!result?.url || !/^https?:\/\//i.test(result.url)) throw new Error('素材上传未返回公开链接')
  return flyapiReference(result.url)
}
function waitForAsset(signal: AbortSignal) {
  signal.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(new DOMException('已取消', 'AbortError')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, 2000)
    signal.addEventListener('abort', cancel, { once: true })
  })
}

export class FlyapiProvider extends UnmauProvider {
  declare apiKey: string
  declare baseUrl: string
  downloadTimeoutMs = 15 * 60_000
  constructor(key = '', base = FLYAPI_BASE, private readonly journal?: Journal, private readonly catalog: FlyapiCatalog = 'seedance') { super(key,base) }
  setBaseUrl(url: string) { this.baseUrl = (url || FLYAPI_BASE).trim().replace(/\/+$/, '').replace(/\/v1$/, '') }
  validate() {
    if (this.baseUrl !== FLYAPI_BASE) throw new Error('FlyAPI 地址应为 ' + FLYAPI_BASE)
    if (!this.apiKey.trim()) throw new Error('请填写 FlyAPI 的 API Key')
  }
  async request(path: string, body?: unknown) {
    this.validate()
    return unpack(await bridge().request({ apiKey: this.apiKey, path, catalog: this.catalog, ...(body === undefined ? {} : { body }) }))
  }
  async testAuth(key: string) {
    try {
      const result = await new FlyapiProvider(key, this.baseUrl, undefined, this.catalog).request('/v1/models')
      const requiredModels = this.catalog === 'magi2' ? [FLYAPI_MAGI2_MODEL] : [MODEL, FLYAPI_DEPTH_MODEL]
      const available = this.catalog === 'magi2' ? findMagi2ModelId(result?.data) : Array.isArray(result?.data) && result.data.find((m: { id?: unknown } | null) => typeof m?.id === 'string' && requiredModels.includes(m.id))?.id
      if (!available) {
        const label = this.catalog === 'magi2' ? 'Magi-2（请以 /v1/models 返回的实际模型 ID 为准）' : 'seedance2.5-D 或视频转深度'
        throw new Error(`此 FlyAPI Key 的模型列表里没有 ${label}，请核对模型权限`)
      }
      return { success: true }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : '查询 FlyAPI 模型权限失败' } }
  }
  prepareReferences(data: Record<string, any>, nodes: Parameters<typeof connectedCanvasMedia>[1], edges: Parameters<typeof connectedCanvasMedia>[2], id: string) {
    const connected = connectedCanvasMedia(id,nodes,edges,true)
    return bindCanvasReferences(data.prompt, [...connected, ...(data._uploads ?? legacyCanvasUploads(data,connected))])
  }
  buildBody(data: Record<string, any>, refs: Inputs) { return buildFlyapiBody(data,refs,this.catalog) }
  async prepareAssets(body: Body, readFile: (url: string) => Promise<File>, signal: AbortSignal, { update }: { update: (patch: { referenceWarning?: string }) => void }) {
    // Keep ordered slots (and @ labels); register identical inputs only once within this request.
    const ready = new Map<string, string>()
    try {
      for (const spec of media) {
        const slots = body[spec.field] || []
        for (const [index, source] of slots.entries()) {
          signal.throwIfAborted()
          const tag = `参考${spec.label} ${index + 1}/${slots.length}`
          const cacheKey = spec.type + ':' + source
          if (ready.has(cacheKey)) { slots[index] = ready.get(cacheKey)!; continue }
          update({ referenceWarning: `正在准备${tag}，尚未提交生成…` })
          try {
            let id = assetId(source)
            if (!id) {
              const url = /^(?:local-upload:|blob:|data:)/i.test(source) ? await stageFlyapiLocal(source,spec.kind,readFile,signal) : flyapiReference(source)
              signal.throwIfAborted()
              const registered = await this.request(assetBase+'assetUpload', { assetType: spec.type, url })
              if (registered?.errorMessage) throw new Error(registered.errorMessage)
              if (!assetPattern.test(registered?.assetId || '')) throw new Error('登记素材未返回有效的素材 ID')
              id = String(registered.assetId)
            }
            const deadline = Date.now() + 5 * 60_000
            while (true) {
              signal.throwIfAborted()
              const result = await this.request(assetBase+'assetDetail', { assetId: id })
              signal.throwIfAborted()
              if (result?.errorMessage) throw new Error(result.errorMessage)
              if (result?.assetId !== id || (result?.assetType && result.assetType !== spec.type)) throw new Error('返回的素材 ID 或类型与所选素材不符')
              const status = String(result.status || '').toUpperCase()
              if (status === 'ACTIVE' && result.assetType === spec.type) break
              if (!['UPLOADED','PENDING','PROCESSING','QUEUED','SUBMITTED','CREATING'].includes(status)) throw new Error(`素材未就绪（${status || '未知状态'}）`)
              if (Date.now() >= deadline) throw new Error(`素材 ${id} 仍在处理中，可稍后用原素材 ID 再试`)
              await waitForAsset(signal)
            }
            slots[index] = (body.model === FLYAPI_MAGI2_MODEL ? 'asset://' : 'assetId://') + id
            ready.set(cacheKey, slots[index])
          } catch (err) {
            signal.throwIfAborted()
            let reason = err instanceof Error ? err.message : '素材处理失败'
            if (/video duration could not be determined/i.test(reason)) {
              reason = 'FlyAPI 无法从参考视频链接读取时长。请确认视频链接可以直接下载；本地 MP4/MOV 会先无损整理封装，若仍报错，请核对平台素材解析服务或使用其他可访问的直链'
            }
            throw new Error(`${tag}：${reason}；本次未提交视频生成`)
          }
        }
      }
    } finally { if (!signal.aborted) update({ referenceWarning: undefined }) }
  }
  resumeBody(data: Record<string, any>) {
    if (data.flyapiTask && !data.flyapiTask.taskId) throw new Error('上次提交尚未取得任务号，请先到 FlyAPI 核对任务记录')
    if (data.flyapiTask?.taskId) return data.flyapiTask.params ?? { model: data.model || MODEL, prompt: '', duration: undefined }
  }
  async createTask(body: Body, signal?: AbortSignal) {
    if (this.catalog === 'magi2') {
      const result = await this.request('/v1/models')
      const modelId = findMagi2ModelId(result?.data)
      if (!modelId) throw new Error('FlyAPI 未在 /v1/models 返回可用的 Magi-2 视频模型，请先测试连接并核对此 Key 的模型权限')
      body.model = modelId
    }
    const { model, prompt, duration, resolution, aspect_ratio } = body
    const params = { model, prompt, duration, resolution, aspect_ratio }
    const counts = { images: body.reference_images?.length || 0, videos: body.reference_videos?.length || 0, audios: body.reference_audios?.length || 0 }
    return this.submitTracked(body, params, counts, signal)
  }
  async submitTracked(body: unknown, params: SavedParams, counts: Counts, signal?: AbortSignal) {
    // Neither FlyAPI video endpoint documents idempotency. Persist the attempt before sending it.
    const submissionId = crypto.randomUUID(), providerId = this.journal?.providerId || ''
    const pending = { submissionId, providerId, params, counts }
    await this.journal?.save(submissionId, pending)
    if (signal?.aborted) { await this.journal?.save(submissionId); signal.throwIfAborted() }
    let raw
    try { raw = await this.request('/v1/videos', body) }
    catch (err) {
      if ([400,401,402,403,404,413,422].includes((err as {status?:number}).status || 0)) await this.journal?.save(submissionId)
      throw err
    }
    const taskId = raw?.id || raw?.task_id
    if (!isFlyapiTaskId(taskId)) throw new Error('FlyAPI 未返回有效任务号，请先到平台核对上次提交')
    // The response may arrive after the user switched projects or stopped polling.
    try { await this.journal?.save(submissionId, { ...pending, taskId }, { ...counts, taskId, model: params.model, providerId }) }
    catch { throw new Error(`FlyAPI 已受理任务 ${taskId}，但本地记录未能保存。请保留任务号，使用原任务继续查询。`) }
    return { taskId }
  }
  clearPendingTask() { return { flyapiTask: undefined } }
  async getTaskStatus(id: string) {
    const raw = await this.request('/v1/videos/' + encodeURIComponent(id))
    const state = mapUnmauTask(raw)
    if (raw?.error?.code) state.error = [raw.error.code, state.error].filter(Boolean).join('：')
    return state
  }
  async download(taskId: string) {
    this.validate()
    const data = unpack(await bridge().download({ apiKey: this.apiKey, taskId }))
    if (!data?.path) throw Object.assign(new Error('尚未收到 FlyAPI 成片'), { retryable: true })
    return 'local-upload:///' + data.path.replace(/\\/g,'/')
  }
}
