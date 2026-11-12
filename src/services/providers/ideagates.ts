import type { AuthResult, ContentItem, CreateTaskParams, ImageToVideoParams, TaskStatus, TextToVideoParams } from '../ai-provider'

export const IDEAGATES_BASE = 'https://ideagates.com/v1'
export type IdeaGatesKind = 'ideagates' | 'ideagates-overseas'
export const IDEAGATES_GROUPS = {
  ideagates: { name: 'IDEA Gates · Seedance NSFW 可溯源', model: 'doubao-seedance-2-5-260628' },
  'ideagates-overseas': { name: 'IDEA Gates · 海外-NSFW 视频 8.5 折', model: 'dreamina-seedance-2-5' },
} as const
export const isIdeaGatesKind = (kind: unknown): kind is IdeaGatesKind => kind === 'ideagates' || kind === 'ideagates-overseas'
export const IDEAGATES_RATIOS = ['16:9', '9:16', '1:1', '21:9', '4:3', '3:4']
export function ideaGatesModels(kind: IdeaGatesKind) {
  return [{ id: IDEAGATES_GROUPS[kind].model, name: 'Seedance 2.5 · 720P',
    description: '4–30 秒 · 文生视频、参考素材、首尾帧、编辑与续接',
    capabilities: { ratios: [...IDEAGATES_RATIOS], resolutions: ['720p'], durationRange: { min: 4, max: 30 }, audioGeneration: true, audioGenerationDefault: true, maxImages: 9, maxVideos: 3, maxAudios: 3 } }]
}
export class IdeaGatesError extends Error {
  retryable = false; uncertain = false; retryAfterMs = 0
  constructor(message: string, details: Record<string, any> = {}) { super(message); Object.assign(this, details) }
}
export function validateIdeaGatesMedia(value: string) {
  if (/^asset:\/\/[A-Za-z0-9_-]+$/.test(value)) return value
  let url: URL
  try { url = new URL(value) } catch { throw new Error('素材请使用公网 HTTPS 链接或已登记的 asset:// 引用；本地素材需先上传到自己的存储') }
  const h = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.username || url.password || h === 'localhost' || h.endsWith('.local') || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.includes(':')) throw new Error('参考素材必须是公网 HTTPS 链接或已登记的 asset:// 引用')
  return value
}
export function buildIdeaGatesBody(params: CreateTaskParams, kind: IdeaGatesKind) {
  if (params.model !== IDEAGATES_GROUPS[kind].model) throw new Error('请选择当前分组的 Seedance 2.5 模型')
  if ((params.resolution || '720p') !== '720p') throw new Error('此接入仅支持 720p')
  const mode = params.omniReferenceTaskType || (['edit', 'extend'].includes(params.mode || '') ? params.mode : 'reference')
  const duration = mode === 'edit' ? -1 : params.duration ?? 5
  if (mode !== 'edit' && (!Number.isInteger(duration) || duration < 4 || duration > 30)) throw new Error('Seedance 2.5 时长须为 4–30 秒整数；续接填写成片总时长')
  const ratio = mode === 'edit' || mode === 'extend' ? 'adaptive' : params.ratio || '16:9'
  if (ratio !== 'adaptive' && !IDEAGATES_RATIOS.includes(ratio) || mode === 'reference' && ratio === 'adaptive') throw new Error('请选择支持的画幅比例')
  const content: ContentItem[] = (params.content || []).map(item => ({ ...item }))
  if (!content.some(item => item.type === 'text' && item.text?.trim())) content.unshift({ type: 'text', text: params.prompt.trim() })
  if (!content.some(item => item.type === 'text' && item.text?.trim())) throw new Error('请输入视频提示词')
  for (const item of content) if (item.type !== 'text') {
    const value = item[item.type]
    if (!value || typeof value !== 'object') throw new Error('参考素材格式无效')
    validateIdeaGatesMedia(value.url)
  }
  const first = content.filter(item => item.role === 'first_frame'), last = content.filter(item => item.role === 'last_frame')
  if (first.length > 1 || last.length > 1 || last.length && !first.length || (first.length || last.length) && content.some(item => item.type !== 'text' && !['first_frame', 'last_frame'].includes(item.role || ''))) throw new Error('首尾帧不能与其他参考素材混用，尾帧必须配首帧')
  if (['edit', 'extend'].includes(mode!) && !content.some(item => item.type === 'video_url')) throw new Error('视频编辑或续接需要参考视频')
  return { model: params.model, content, duration, ratio, resolution: '720p', generate_audio: params.generate_audio ?? true,
    ...(params.returnLastFrame !== undefined ? { return_last_frame: params.returnLastFrame } : {}),
    ...(content.some(item => item.type === 'video_url') || ['edit', 'extend'].includes(mode!) ? { omni_reference_task_type: mode } : {}) }
}
export interface IdeaGatesStatus extends TaskStatus { raw: Record<string, any>; traceId?: string }
export function mapIdeaGatesTask(raw: Record<string, any>): IdeaGatesStatus {
  const states: Record<string, TaskStatus['status']> = { queued: 'pending', running: 'processing', succeeded: 'completed', failed: 'failed', cancelled: 'failed', expired: 'failed' }
  if (!states[raw?.status]) throw new IdeaGatesError('平台返回未知状态，已保留任务号', { retryable: true })
  return { status: states[raw.status], raw, traceId: raw['doubao-id'] || raw.cgt_id,
    ...(raw.status === 'succeeded' ? { videoUrl: raw.content?.video_url, progress: 100 } : {}),
    ...(states[raw.status] === 'failed' ? { error: raw.error?.message || `任务状态：${raw.status}` } : {}) }
}
export class IdeaGatesProvider {
  name: string
  constructor(private apiKey = '', private baseUrl = IDEAGATES_BASE, readonly kind: IdeaGatesKind = 'ideagates') { this.name = IDEAGATES_GROUPS[kind].name; this.setApiKey(apiKey); this.setBaseUrl(baseUrl) }
  setApiKey(key: string) { this.apiKey = key.trim().replace(/^Bearer\s+/i, '') }
  setBaseUrl(url: string) { this.baseUrl = (url || IDEAGATES_BASE).trim().replace(/\/+$/, '') }
  private bridge() {
    if (![IDEAGATES_BASE, 'https://ideagates.com', 'https://ideagates.com/api/v3'].includes(this.baseUrl)) throw new Error(`IDEA Gates 地址应为 ${IDEAGATES_BASE}`)
    const bridge = (window.electronAPI as any)?.ideagates
    if (!bridge) throw new Error('请使用更新后的桌面版，IDEA Gates 接口组件未加载')
    return bridge
  }
  private unpack(result: any) { if (!result?.ok) throw new IdeaGatesError(result?.error || 'IDEA Gates 请求失败', result); return result.data }
  private async request(path: string, body?: any, keyFingerprint?: string) {
    return this.unpack(await this.bridge().request({ apiKey: this.apiKey, group: this.kind, path, body, keyFingerprint }))
  }
  async testAuth(key: string): Promise<AuthResult> {
    const provider = new IdeaGatesProvider(key, this.baseUrl, this.kind)
    try { await provider.modelCapabilities(); return { success: true } }
    catch (error) { return { success: false, error: error instanceof Error ? error.message : '连接失败' } }
  }
  async modelCapabilities() {
    const { raw } = await this.request('/models')
    const model = raw?.data?.find((item: any) => item.id === IDEAGATES_GROUPS[this.kind].model)
    if (!model?.video || !model.video.resolutions?.includes('720p')) throw new Error('当前 Key 未开放此 Seedance 2.5 的 720p 权限，请核对 Key 分组')
    return model.video
  }
  async identity() { return (await this.request('/identity')).keyFingerprint as string }
  async createTask(params: CreateTaskParams) {
    const body = buildIdeaGatesBody(params, this.kind)
    const capability = await this.modelCapabilities()
    for (const [type, field] of [['image_url', 'max_images'], ['video_url', 'max_videos'], ['audio_url', 'max_audios']] as const) {
      const count = body.content.filter(item => item.type === type).length
      if (Number.isFinite(capability[field]) && count > capability[field]) throw new Error(`当前 Key 的 ${type} 素材上限为 ${capability[field]}`)
    }
    if (body.duration !== -1 && ((capability.duration_seconds?.min != null && body.duration < capability.duration_seconds.min) || (capability.duration_seconds?.max != null && body.duration > capability.duration_seconds.max))) throw new Error('时长超出当前 Key 的模型能力')
    if (body.ratio !== 'adaptive' && Array.isArray(capability.ratios) && !capability.ratios.includes(body.ratio)) throw new Error('当前 Key 不支持所选画幅')
    if (capability.supports_reference_video === false && body.content.some(item => item.type === 'video_url')) throw new Error('当前 Key 不支持参考视频')
    if (capability.supports_first_last_frame === false && body.content.some(item => ['first_frame', 'last_frame'].includes(item.role || ''))) throw new Error('当前 Key 不支持首尾帧')
    let response: any
    try { response = await this.request('/contents/generations/tasks', body) }
    catch (error) {
      if (!(error instanceof IdeaGatesError)) throw new IdeaGatesError('提交响应中断，请联系平台核对，避免重复生成', { uncertain: true })
      throw error
    }
    if (typeof response.raw?.id !== 'string' || !response.raw.id) throw new IdeaGatesError('创建请求未返回任务 ID，请先联系平台核对，避免重复生成', { uncertain: true })
    return { taskId: response.raw.id, keyFingerprint: response.keyFingerprint, request: body, warning: response.warning }
  }
  async getTaskStatus(taskId: string, keyFingerprint?: string) { return mapIdeaGatesTask((await this.request('/contents/generations/tasks/' + encodeURIComponent(taskId), undefined, keyFingerprint)).raw) }
  async download(taskId: string, videoUrl: string, keyFingerprint?: string) {
    const result = this.unpack(await this.bridge().download({ apiKey: this.apiKey, taskId, videoUrl, keyFingerprint }))
    return 'local-upload:///' + result.path.replace(/\\/g, '/')
  }
  async textToVideo(params: TextToVideoParams) { const result = await this.createTask({ ...params, model: params.model || IDEAGATES_GROUPS[this.kind].model }); return { taskId: result.taskId, videoUrl: '' } }
  async imageToVideo(params: ImageToVideoParams) { const result = await this.createTask({ ...params, model: params.model || IDEAGATES_GROUPS[this.kind].model, prompt: params.prompt || '让参考图自然运动', content: [{ type: 'image_url', image_url: { url: params.imageUrl }, role: 'first_frame' }] }); return { taskId: result.taskId, videoUrl: '' } }
  async textToImage(): Promise<never> { throw new Error('请选择图片生成模型') }
}
