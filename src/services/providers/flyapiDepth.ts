import { FLYAPI_DEPTH_MODEL, FlyapiProvider, isFlyapiTaskId, stageFlyapiLocal } from './flyapi'
import { readMediaDuration } from './piapi'
import { canvasMediaUrl, type CanvasMedia } from '@/utils/canvasMedia'
import { isVideoNode } from '@/utils/canvasConnection'
import type { NodeData } from '@/stores/node'

export const DEPTH_MODEL = FLYAPI_DEPTH_MODEL
export const DEPTH_RATE = 0.20
export type DepthSource = Pick<CanvasMedia, 'url' | 'name'>
type NodeLike = { id: string; type?: string; data?: Record<string, any> }
export function depthSourceFor(data: Pick<NodeData,'depthSource'>, nodes: NodeLike[], edges: {source:string;target:string}[], id: string): DepthSource {
  const incoming = edges.filter(e => e.target === id)
  if (incoming.length + Number(!!data.depthSource) !== 1) throw new Error('请选择一个本地 MP4，或只连接一个视频节点；更换来源前请移除原视频或断开连线')
  if (data.depthSource) return { ...data.depthSource, url: canvasMediaUrl(data.depthSource.url) }
  const n = nodes.find(n => n.id === incoming[0].source)
  if (!n || !isVideoNode(n)) throw new Error('视频转深度只能连接视频节点')
  const d = n.data || {}, asset = n.type === 'asset-ref', url = asset ? d.assetUrl : d.outputVideo
  if (!url || (!asset && d.status !== 'completed')) throw new Error('请先等待上游视频完成，或连接一个已有视频')
  return {url: canvasMediaUrl(url), name: (asset ? d.assetName : d.label) || '源视频'}
}
// Stored local paths are raw disk paths; encode #, %, spaces etc. only for playback, not IPC reads.
export function mediaPreview(url:string) {
  const prefix='local-upload:///'
  return url.startsWith(prefix) ? prefix+url.slice(prefix.length).split('/').map((s,i)=>i===0 && /^[a-z]:$/i.test(s) ? s : encodeURIComponent(s)).join('/') : url
}
export function depthPrice(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 30) throw new Error('源视频须可读取时长且不超过 30 秒')
  return (seconds * DEPTH_RATE).toFixed(2)
}
export function depthAccount(accounts: {id:string;kind?:string;apiKey?:string}[], selected?: string) {
  const all = accounts.filter(p => p.kind === 'flyapi')
  return selected || all.find(p => p.apiKey?.trim())?.id || all[0]?.id || ''
}
type DepthWork = { model: string; source: DepthSource; video: string; duration: number; prompt: string }
type Update = (patch: Partial<NodeData>) => void
export class FlyapiDepthProvider {
  canResumeTask = true
  keepOutputWhileRunning = true
  downloadTimeoutMs = 15 * 60_000
  constructor(private account: FlyapiProvider) {}
  validate() { this.account.validate() }
  prepareReferences(data: NodeData, nodes: NodeLike[], edges: {source:string;target:string}[], id: string) { return depthSourceFor(data,nodes,edges,id) }
  buildBody(_data: NodeData, source: DepthSource): DepthWork { return {model:DEPTH_MODEL,source,video:'',duration:0,prompt:'视频转深度 · '+source.name} }
  async prepareAssets(body: DepthWork, readFile: (url:string)=>Promise<File>, signal: AbortSignal, {update}: {update: Update}) {
    const bridge = window.electronAPI?.flyapi
    if (!bridge?.checkDepthSource) throw new Error('请使用支持视频转深度的桌面版')
    const source = body.source.url
    update({referenceWarning:'正在检查源视频格式和时长…'})
    const checked = await bridge.checkDepthSource({source}); signal.throwIfAborted()
    if (!checked.ok) throw new Error(checked.error || '无法读取源 MP4 视频')
    const seconds = Number(await readMediaDuration(mediaPreview(source),'videos',signal,true)); signal.throwIfAborted()
    const cost = depthPrice(seconds), local = !/^https?:\/\//i.test(source)
    if (!window.confirm(`源视频：${body.source.name}\n时长 ${Number(seconds.toFixed(3))} 秒 × ¥${DEPTH_RATE.toFixed(2)}/秒，预计 ¥${cost}，以平台结算为准。${local ? '\n确认后会先上传本地视频到临时图床。' : ''}\n确认提交视频转深度？`)) {
      update({status:'idle',progress:undefined,referenceWarning:undefined}); throw new DOMException('已取消','AbortError')
    }
    signal.throwIfAborted();body.duration=seconds
    update({referenceWarning:local?'正在上传源视频…':'正在提交视频转深度…'})
    body.video = local ? await stageFlyapiLocal(source,'video',readFile,signal) : source
    signal.throwIfAborted(); update({referenceWarning:undefined})
  }
  createTask(body: DepthWork, signal: AbortSignal) {
    return this.account.submitTracked({model:DEPTH_MODEL,video:body.video}, {model:DEPTH_MODEL,prompt:body.prompt,duration:body.duration}, {images:0,videos:1,audios:0}, signal)
  }
  resumeBody(data: NodeData) { return this.account.resumeBody(data) }
  clearPendingTask() { return this.account.clearPendingTask() }
  async getTaskStatus(id: string, requireIdentity = false) {
    if (!isFlyapiTaskId(id)) throw new Error('FlyAPI 任务号无效')
    const raw = await this.account.request('/v1/videos/'+encodeURIComponent(id))
    if (requireIdentity && ((raw?.id !== id && raw?.task_id !== id) || raw?.model !== DEPTH_MODEL)) throw new Error('平台未确认这是当前账号的视频转深度任务，请核对原任务号')
    if ((raw?.id && raw.id!==id) || (raw?.task_id && raw.task_id!==id) || (raw?.model && raw.model!==DEPTH_MODEL)) throw new Error('FlyAPI 返回的不是这个视频转深度任务，请核对原任务号')
    const progress=typeof raw?.progress==='number' ? Math.max(0,Math.min(100,raw.progress)) : undefined
    switch(raw?.status){
      case 'completed': return {status:'completed',videoUrl:raw.metadata?.url}
      case 'failed': return {status:'failed',error: typeof raw.error==='string' ? raw.error : [raw.error?.code,raw.error?.message].filter(Boolean).join('：') || '平台未能转换此视频'}
      case 'unknown': case 'queued': case 'in_progress': return {status:'running',progress}
      default: throw new Error('FlyAPI 返回了无法识别的任务状态，可稍后继续查询')
    }
  }
  async download(taskId:string,url?:string) {
    if (!url) throw Object.assign(new Error('任务已完成，平台尚未提供深度视频地址'),{retryable:true})
    const saved=await window.electronAPI?.flyapi?.downloadDepth({taskId,url})
    if (!saved?.ok || !saved.data?.path) throw new Error((saved?.error || '深度视频保存失败')+'；可继续查询原任务，无需再次付费转换')
    return 'local-upload:///'+saved.data.path.replace(/\\/g,'/')
  }
}
