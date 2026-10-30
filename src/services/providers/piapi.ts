// @ts-nocheck
// Protocol: https://piapi.ai/docs/seedance-api/seedance-25 (2026-10-30).
import { UnmauProvider } from './unmau'
import { prepareQilingReferences } from '../qilingReferences'

export const PIAPI_BASE = 'https://api.piapi.ai'
export const PIAPI_MODEL = 'seedance-2.5-less-restriction'
export const PIAPI_RATIOS = ['16:9', '9:16', '4:3', '3:4', '21:9', '1:1', 'adaptive']
export const PIAPI_MODELS = [{
  id: PIAPI_MODEL, name: 'Seedance 2.5 Less Restriction',
  description: 'PiAPI · 4–30 秒 · 480P/720P/1080P · 多模态参考、视频编辑与延长',
  capabilities: { ratios: PIAPI_RATIOS, resolutions: ['720p', '480p', '1080p'], durationRange: { min: 4, max: 30 }, maxImages: 30, maxVideos: 10, maxAudios: 10, maxTotalReferences: 50 },
}]
const fields = [['images', 'image_urls', 30, '图片'], ['videos', 'video_urls', 10, '视频'], ['audios', 'audio_urls', 10, '音频']]
const unique = items => [...new Set((items || []).filter(item => typeof item === 'string' && item.trim()))]
const abort = signal => { if (signal?.aborted) throw new DOMException('已取消', 'AbortError') }
const fail = message => { throw new Error(message) }
export function piapiAssetId(value) {
  return typeof value === 'string' && /^asset:[/][/]asset-[A-Za-z0-9_-]+$/.test(value) ? value.slice('asset://'.length) : undefined
}
export function mapPiapiAsset(raw) {
  const data = raw?.data || raw
  if (typeof data?.asset_id !== 'string' || !/^asset-[A-Za-z0-9_-]+$/.test(data.asset_id)) fail('PiAPI 私有资产响应缺少有效 ID')
  const status = String(data.status || '').toLowerCase()
  if (!['active', 'processing', 'failed'].includes(status)) fail('PiAPI 私有资产状态无法识别，请到平台核对')
  return { ...data, status, error: typeof data.error === 'string' ? data.error : data.error?.message || data.error?.code }
}
function assetDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    abort(signal)
    const cancelled = () => { clearTimeout(timer); reject(new DOMException('已取消', 'AbortError')) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancelled); resolve() }, ms)
    signal?.addEventListener('abort', cancelled, { once: true })
  })
}
export async function waitPiapiAsset(initial, getAsset, signal, notify = () => {}, wait = assetDelay, timeoutMs = 10 * 60 * 1000) {
  let asset = mapPiapiAsset(initial), started = Date.now()
  while (true) {
    abort(signal)
    if (asset.status === 'active') return asset
    if (asset.status === 'failed') fail(`PiAPI 私有资产 ${asset.asset_id} 审核失败：${asset.error || '请查看平台原因'}；本次未提交视频生成`)
    if (Date.now() - started > timeoutMs) fail(`私有资产 ${asset.asset_id} 仍在处理中，请稍后重试或在资产库中查看；本次未提交视频生成`)
    notify(`私有素材审核中：${asset.name || asset.asset_id}`)
    await wait(3000, signal); abort(signal)
    try { asset = mapPiapiAsset(await getAsset(asset.asset_id)) }
    catch (error) { if (!error.retryable) throw error }
  }
}
export function publicMediaUrl(value) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && host !== 'localhost' && !host.endsWith('.local') && !host.startsWith('127.') && host !== '[::1]'
  } catch { return false }
}
export function buildPiapiBody(data, refs) {
  if (data.model !== PIAPI_MODEL) fail('请选择 PiAPI 的 Seedance 2.5 Less Restriction 模型')
  const prompt = String(refs.prompt ?? data.prompt ?? '').trim()
  if (!prompt) fail('请输入视频提示词')
  if (Array.from(prompt).length > 4000) fail('PiAPI 提示词最多 4000 个字符')
  if (prompt.includes('@[')) fail('素材引用尚未解析，请重新插入引用')
  const mode = data.videoMode || 'reference'
  if (!['reference', 'edit', 'extend'].includes(mode)) fail('PiAPI 不支持此视频模式')
  const duration = mode === 'edit' ? -1 : Number(data.duration ?? 5)
  if (mode !== 'edit' && (!Number.isInteger(duration) || duration < 4 || duration > 30)) fail('PiAPI 视频时长须为 4–30 秒的整数；延长模式填写成片总时长')
  const resolution = String(data.resolution || '720p').toLowerCase()
  if (!['480p', '720p', '1080p'].includes(resolution)) fail('PiAPI 仅支持 480p、720p、1080p')
  const aspect_ratio = mode !== 'reference' ? 'adaptive' : data.ratio === 'auto' ? 'adaptive' : data.ratio || '16:9'
  if (!PIAPI_RATIOS.includes(aspect_ratio)) fail('请选择 PiAPI 支持的画幅比例')
  const body = { model: PIAPI_MODEL, prompt, duration, resolution, aspect_ratio, omni_reference_task_type: mode }
  const privateReferences = Object.fromEntries(Object.entries(data.piapiPrivateReferences || {}).filter(([, binding]) => binding?.providerId === data.providerId && binding?.mode === 'private'))
  if (Object.keys(privateReferences).length) body.privateReferences = privateReferences
  for (const [field, , limit, label] of fields) {
    const values = unique(refs[field])
    if (values.length > limit) fail(`PiAPI 最多支持 ${limit} 个参考${label}，当前 ${values.length} 个`)
    if (values.length) body[field] = values
  }
  if (mode !== 'reference' && !body.videos?.length) fail('视频编辑和视频延长需要至少一段参考视频')
  const counts = { image: body.images?.length || 0, video: body.videos?.length || 0, audio: body.audios?.length || 0 }
  if (Object.values(counts).reduce((a, b) => a + b, 0) > 50) fail('PiAPI 最多支持 50 项参考素材')
  const labels = { 图片: 'image', 视频: 'video', 音频: 'audio' }
  for (const match of prompt.matchAll(/@(image|video|audio|图片|视频|音频)([0-9]+)/gi)) {
    const type = labels[match[1]] || match[1].toLowerCase(), index = Number(match[2])
    if (index < 1 || index > counts[type]) fail(`提示词中的 ${match[0]} 没有对应素材，请重新插入引用`)
  }
  return body
}
export function piapiPayload(body) {
  const input = { prompt: body.prompt, duration: body.duration, aspect_ratio: body.aspect_ratio, resolution: body.resolution, omni_reference_task_type: body.omni_reference_task_type, auto_upload_assets: false }
  for (const [field, target] of fields) if (body[field]?.length) input[target] = body[field]
  input.mode = fields.some(([field]) => body[field]?.length) ? 'omni_reference' : 'text_to_video'
  return { model: 'seedance', task_type: PIAPI_MODEL, input }
}
export function mapPiapiTask(raw) {
  const data = raw?.data || raw
  const status = String(data?.status || '').trim().toLowerCase()
  const statuses = { staged: 'pending', pending: 'pending', queued: 'pending', processing: 'processing', running: 'processing', completed: 'completed', failed: 'failed', cancelled: 'failed', canceled: 'failed' }
  if (!statuses[status]) throw Object.assign(new Error('PiAPI 未返回可识别的任务状态，保留任务 ID 继续查询'), { retryable: true })
  const error = typeof data.error === 'string' ? data.error : data.error?.message || data.error?.raw_message || data.error?.detail || data.detail || raw?.message
  const videoUrl = data.output?.video
  return { status: statuses[status], ...(status === 'completed' && publicMediaUrl(videoUrl) ? { videoUrl } : {}), ...(statuses[status] === 'failed' ? { error: typeof error === 'string' && error.trim() ? error : 'PiAPI 视频生成失败，请到平台查看任务详情' } : {}) }
}
function bridge() {
  if (!window.electronAPI?.piapi) fail('PiAPI 接口组件未加载，请完全退出并打开更新后的桌面软件')
  return window.electronAPI.piapi
}
function unpack(result) {
  if (!result?.ok) throw Object.assign(new Error(result?.error || 'PiAPI 请求失败'), { retryable: !!result?.retryable, status: result?.status })
  return result.data
}
export function validateMediaDuration(kind, duration, mode) {
  const min = kind === 'videos' && mode === 'edit' ? 4 : 2
  if (!Number.isFinite(duration) || duration < min || duration > 30) fail(`PiAPI 参考${kind === 'videos' ? '视频' : '音频'}须为 ${min}–30 秒，当前 ${Number.isFinite(duration) ? duration.toFixed(2) : '无法读取'} 秒`)
}
export function validateLocalFile(file, field) {
  if (!file?.size) fail('参考素材为空或无法读取')
  const ext = String(file.name || '').split('.').pop()?.toLowerCase()
  const extensions = field === 'videos' ? ['mp4'] : field === 'audios' ? ['mp3', 'wav'] : ['jpg', 'jpeg', 'png', 'webp']
  if (!extensions.includes(ext)) fail(`PiAPI 本地${field === 'videos' ? '视频' : field === 'audios' ? '音频' : '图片'}上传支持 ${extensions.join('/')}；MOV 请使用可公开访问的直链`)
  // The upload service limits the base64 field itself to 10 MB.
  if (Math.ceil(file.size / 3) * 4 > 10 * 1024 * 1024) fail('PiAPI 临时上传的 Base64 数据不能超过 10 MB（原文件约 7.5 MB）；更大素材请使用公网直链')
}
export function validatePrivateMedia(field, metadata) {
  const limit = field === 'images' ? 30 : field === 'videos' ? 50 : 15
  if (metadata.size && (field === 'images' ? metadata.size >= limit * 1024 * 1024 : metadata.size > limit * 1024 * 1024)) fail(`PiAPI 私有${field === 'images' ? '图片须小于' : field === 'videos' ? '视频不能超过' : '音频不能超过'} ${limit} MB`)
  if (field === 'images') {
    const { width, height } = metadata, ratio = width / height
    if (!(width > 300 && width < 6000 && height > 300 && height < 6000 && ratio > 0.4 && ratio < 2.5)) fail(`PiAPI 私有图片宽高须大于 300 且小于 6000 像素，宽高比须大于 0.4 且小于 2.5；当前 ${width}×${height}。请调整素材或取消私有资产选项；本次未提交视频生成`)
  } else if (!Number.isFinite(metadata.duration) || metadata.duration < 2 || metadata.duration > 15) fail('PiAPI 私有视频/音频须为 2–15 秒；普通参考可使用 2–30 秒素材')
}
export function readImageSize(source, signal) {
  return new Promise((resolve, reject) => {
    abort(signal)
    const image = new Image(), objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source)
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancelled); image.onload = null; image.onerror = null; if (objectUrl) URL.revokeObjectURL(objectUrl) }
    const done = (error, value) => { cleanup(); error ? reject(error) : resolve(value) }
    const cancelled = () => done(new DOMException('已取消', 'AbortError'))
    const timer = setTimeout(() => done(new Error('私有图片尺寸读取超时，请检查素材地址')), 20000)
    signal?.addEventListener('abort', cancelled, { once: true })
    image.onload = () => done(null, { width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => done(new Error('无法读取私有图片尺寸，请使用可预览的 JPG/PNG/WebP 图片'))
    image.src = objectUrl || source
  })
}
export function readMediaDuration(source, kind, signal) {
  return new Promise((resolve, reject) => {
    abort(signal)
    const element = document.createElement(kind === 'videos' ? 'video' : 'audio')
    const objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source)
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancelled); element.onloadedmetadata = null; element.onerror = null; element.removeAttribute('src'); element.load(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
    const done = (error, duration) => { cleanup(); error ? reject(error) : resolve(duration) }
    const cancelled = () => done(new DOMException('已取消', 'AbortError'))
    const timer = setTimeout(() => done(new Error('参考媒体时长读取超时，请确认文件可播放、直链可访问后重试')), 20000)
    signal?.addEventListener('abort', cancelled, { once: true })
    element.preload = 'metadata'
    element.onloadedmetadata = () => done(null, element.duration)
    element.onerror = () => done(new Error('无法读取参考媒体时长，请使用可播放的 MP4/MOV 视频或 MP3/WAV 音频直链'))
    element.src = objectUrl || source
  })
}
export class PiapiProvider extends UnmauProvider {
  constructor(apiKey = '', baseUrl = PIAPI_BASE) { super(apiKey, baseUrl); this.downloadTimeoutMs = 15 * 60 * 1000 }
  setBaseUrl(url) { this.baseUrl = (url || PIAPI_BASE).trim(); while (this.baseUrl.endsWith('/')) this.baseUrl = this.baseUrl.slice(0, -1) }
  validate() {
    if (this.baseUrl !== PIAPI_BASE) fail(`PiAPI API 地址应为 ${PIAPI_BASE}`)
    if (!this.apiKey.trim() || /[^!-~]/.test(this.apiKey.trim())) fail('请在 PiAPI 设置中填写有效 API Key（不能含中文、空格或换行）')
  }
  prepareReferences(data, nodes, edges, id) {
    const merged = nodes.map(node => node.id === id ? { ...node, data } : node)
    if (!merged.some(node => node.id === id)) merged.push({ id, data })
    return prepareQilingReferences(id, merged, edges)
  }
  buildBody(data, refs) { return buildPiapiBody(data, refs) }
  pendingTask(taskId, body, data) { return { referenceWarning: undefined, piapiTask: { taskId, providerId: data.providerId, body: this.assetMeta(body) } } }
  clearPendingTask() { return { piapiTask: undefined, referenceWarning: undefined } }
  resumeBody(data) { return data.piapiTask?.taskId ? data.piapiTask.body : undefined }
  assetMeta(body) { return { model: PIAPI_MODEL, prompt: body.prompt, aspect_ratio: body.aspect_ratio, resolution: body.resolution, duration: body.duration === -1 ? undefined : body.duration } }
  async prepareAssets(body, readFile, signal, context = {}) {
    const files = new Map()
    const privateRefs = body.privateReferences || {}, activeAssets = new Map()
    const notify = message => context.update?.({ referenceWarning: message })
    // Validate asset ownership/type/status before skipping local file upload.
    for (const [field] of fields) for (const url of body[field] || []) {
      const assetId = privateRefs[url]?.assetId || piapiAssetId(url)
      if (!assetId) continue
      if (field === 'videos' && body.omni_reference_task_type === 'edit') {
        if (piapiAssetId(url)) fail('编辑模式的源视频必须使用公网直链或本地原视频，不能只有 asset:// ID')
        continue
      }
      let initial
      try { initial = await this.getPrivateAsset(assetId) }
      catch (error) {
        if (error.status !== 404 || piapiAssetId(url)) throw error
        privateRefs[url] = { ...privateRefs[url], assetId: undefined }
        if (context.savePrivateReferences) await context.savePrivateReferences(privateRefs)
        continue
      }
      const active = await waitPiapiAsset(initial, id => this.getPrivateAsset(id), signal, notify)
      const expectedType = field === 'images' ? 'image' : field === 'videos' ? 'video' : 'audio'
      if (String(active.asset_type || '').toLowerCase() !== expectedType) fail(`私有资产 ${assetId} 的类型与当前参考素材不一致`)
      activeAssets.set(url, active)
    }
    // Finish all local validation before uploading or submitting any paid task.
    for (const [field] of fields) {
      let total = 0
      for (const url of body[field] || []) {
        abort(signal)
        if (activeAssets.has(url)) continue
        const remote = publicMediaUrl(url)
        if (!remote && (String(url).startsWith('http:') || String(url).startsWith('https:'))) fail('参考素材须为可公开访问的直链')
        let file
        if (!remote) { file = await readFile(url); abort(signal); validateLocalFile(file, field); files.set(url, file) }
        const managed = privateRefs[url] && !(field === 'videos' && body.omni_reference_task_type === 'edit')
        let size = file?.size
        if (remote && (field !== 'images' || managed)) size = unpack(await bridge().inspectMedia({ url, kind: field })).size
        if (field === 'images' && managed) validatePrivateMedia(field, { ...await readImageSize(file || url, signal), size })
        if (field !== 'images') {
          abort(signal)
          const duration = await readMediaDuration(file || url, field, signal)
          validateMediaDuration(field, duration, body.omni_reference_task_type)
          if (managed) validatePrivateMedia(field, { duration, size })
          total += duration
        }
      }
      if (total > 30.01) fail(`PiAPI 参考${field === 'videos' ? '视频' : '音频'}总时长不能超过 30 秒，当前 ${total.toFixed(2)} 秒`)
    }
    for (const [field, , , label] of fields) if (body[field]) {
      const uploaded = []
      for (const url of body[field]) {
        abort(signal)
        if (activeAssets.has(url)) { uploaded.push('asset://' + activeAssets.get(url).asset_id); continue }
        notify(`正在准备参考${label}…`)
        const hosted = await this.uploadAsset(url, async () => files.get(url), signal, field)
        if (privateRefs[url] && !(field === 'videos' && body.omni_reference_task_type === 'edit')) {
          notify(`正在将参考${label}加入 PiAPI 私有资产库…`)
          const created = unpack(await bridge().ensurePrivateAsset({ apiKey: this.apiKey, url: hosted, sourceKey: url, assetType: field === 'images' ? 'Image' : field === 'videos' ? 'Video' : 'Audio', name: privateRefs[url].name || `画布参考${label}` }))
          const asset = mapPiapiAsset(created)
          privateRefs[url] = { ...privateRefs[url], assetId: asset.asset_id }
          // Persist Processing IDs before waiting; restarting does not duplicate ingestion.
          if (context.savePrivateReferences) await context.savePrivateReferences(privateRefs)
          await waitPiapiAsset(created, id => this.getPrivateAsset(id), signal, notify)
          uploaded.push('asset://' + asset.asset_id)
        } else uploaded.push(hosted)
      }
      body[field] = uploaded
    }
    notify('素材已就绪，正在提交视频任务…')
  }
  async getPrivateAsset(id) {
    if (typeof id !== 'string' || !/^asset-[A-Za-z0-9_-]+$/.test(id)) fail('PiAPI 私有资产 ID 无效')
    return this.request('/api/v1/asset/' + id)
  }
  async listPrivateAssets(page = 1) {
    const raw = await this.request(`/api/v1/asset/list?page=${Math.max(1, Math.floor(page))}&size=50&order=-last_used_at`)
    const data = raw?.data || raw
    if (!Array.isArray(data.items)) fail('PiAPI 私有资产列表响应无效')
    return data
  }
  async request(path, body) { this.validate(); return unpack(await bridge().request({ apiKey: this.apiKey, path, ...(body ? { body } : {}) })) }
  async testAuth(key) {
    const previous = this.apiKey; this.apiKey = key
    try { await this.request('/account/info'); return { success: true } }
    catch (error) { return { success: false, error: error.message } }
    finally { this.apiKey = previous }
  }
  async uploadAsset(url, readFile, signal, field = 'images') {
    this.validate(); abort(signal)
    if (publicMediaUrl(url)) return url
    const file = await readFile(url); abort(signal); validateLocalFile(file, field)
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768))
    abort(signal)
    const raw = unpack(await bridge().upload({ apiKey: this.apiKey, data: btoa(binary), fileName: file.name }))
    abort(signal)
    if (!publicMediaUrl(raw?.data?.url)) fail('PiAPI 上传未返回有效素材直链')
    return raw.data.url
  }
  async createTask(body) {
    const raw = await this.request('/api/v1/task', piapiPayload(body))
    const taskId = raw?.data?.task_id
    if (typeof taskId !== 'string' || !taskId.trim()) fail('PiAPI 未返回任务 ID，请到平台确认任务是否已创建，避免重复付费提交')
    return { taskId }
  }
  async getTaskStatus(id) { return mapPiapiTask(await this.request(`/api/v1/task/${encodeURIComponent(id)}`)) }
  async download(taskId, videoUrl) {
    this.validate()
    if (!publicMediaUrl(videoUrl)) throw Object.assign(new Error('PiAPI 任务已完成，但成片地址尚未就绪，正在继续查询原任务'), { retryable: true })
    const result = unpack(await bridge().download({ apiKey: this.apiKey, taskId, videoUrl }))
    if (!result?.path) throw Object.assign(new Error('PiAPI 成片尚未保存到本地'), { retryable: true })
    return 'local-upload:///' + result.path.split(String.fromCharCode(92)).join('/')
  }
}
