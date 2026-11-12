import type { ContentItem, CreateTaskParams } from './ai-provider'
import { prepareQilingReferences } from './qilingReferences'
import { buildIdeaGatesBody, IdeaGatesError, type IdeaGatesKind, type IdeaGatesStatus } from './providers/ideagates'

export interface IdeaGatesPendingTask {
  submissionId?: string
  taskId?: string
  providerId: string
  model: string
  prompt: string
  ratio?: string
  resolution: string
  duration?: number
  keyFingerprint?: string
  submissionUncertain?: boolean
  request?: Record<string, any>
}
interface Context {
  submissionId?: string
  id: string; data: Record<string, any>; providerId: string; kind: IdeaGatesKind
  nodes: Array<{ id: string; type?: string; data?: Record<string, any> }>; edges: Array<{ source: string; target: string }>
  provider: {
    identity?: () => Promise<string>
    createTask: (params: CreateTaskParams) => Promise<{ taskId: string; keyFingerprint?: string; request?: Record<string, any>; warning?: string }>
    getTaskStatus: (id: string, fingerprint?: string) => Promise<IdeaGatesStatus>
    download: (id: string, url: string, fingerprint?: string) => Promise<string>
  }
  resolveVideoUrl: (url: string) => string
  update: (patch: Record<string, any>) => void
  persist: () => Promise<void>
  rememberTask: (task: IdeaGatesPendingTask | undefined) => Promise<void>
  isCurrent: () => boolean
  complete: (url: string, task: IdeaGatesPendingTask, sourceUrl: string) => void
}
interface Run { ctx: Context; task?: IdeaGatesPendingTask; canceled: boolean; submitting: boolean; timer?: ReturnType<typeof setTimeout> }
const runs = new Map<string, Run>()
function stop(run: Run) { if (run.timer) clearTimeout(run.timer); if (runs.get(run.ctx.id) === run) runs.delete(run.ctx.id) }
export function cancelIdeaGatesNode(id: string) {
  const run = runs.get(id)
  if (!run) return
  run.canceled = true
  if (run.timer) clearTimeout(run.timer)
  if (!run.submitting) stop(run)
  if (run.ctx.isCurrent()) run.ctx.update({ status: 'idle', progress: undefined, referenceWarning: run.submitting ? '正在确认提交结果，请勿重复生成。' : '已停止本地查询，平台任务仍会继续；可继续查询原任务。' })
}
export function buildIdeaGatesNodeParams(ctx: Pick<Context, 'id' | 'nodes' | 'edges' | 'data' | 'resolveVideoUrl'>): CreateTaskParams {
  const nodes = ctx.nodes.map(node => node.id === ctx.id ? { ...node, data: ctx.data } : node)
  const refs = prepareQilingReferences(ctx.id, nodes, ctx.edges)
  const content: ContentItem[] = [{ type: 'text', text: refs.prompt }]
  const frameMode = ctx.data.dmxFrameMode
  if (frameMode) {
    const required = frameMode === 'first_last_frame' ? 2 : 1
    if (refs.images.length !== required || refs.videos.length || refs.audios.length) throw new Error(`当前模式需要恰好 ${required} 张图片，不能混用视频、音频或其他参考图`)
  }
  for (const [index, url] of refs.images.entries()) content.push({ type: 'image_url', image_url: { url }, role: frameMode ? index === 0 ? 'first_frame' : 'last_frame' : 'reference_image' })
  for (const url of refs.videos) content.push({ type: 'video_url', video_url: { url: ctx.resolveVideoUrl(url) }, role: 'reference_video' })
  for (const url of refs.audios) content.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' })
  return { model: ctx.data.model, prompt: refs.prompt, content, duration: ctx.data.duration, resolution: ctx.data.resolution || '720p',
    ratio: ctx.data.ratio, mode: ctx.data.videoMode === 'edit' ? 'edit' : ctx.data.videoMode === 'extend' ? 'extend' : content.length > 1 ? 'reference_material' : 't2v',
    generate_audio: ctx.data.generateAudio, returnLastFrame: ctx.data.returnLastFrame }
}
export async function runIdeaGatesNode(ctx: Context) {
  if (runs.has(ctx.id)) return
  const run: Run = { ctx, canceled: false, submitting: false }; runs.set(ctx.id, run)
  const active = () => runs.get(ctx.id) === run && !run.canceled && ctx.isCurrent()
  const saveTask = async (task: IdeaGatesPendingTask | undefined) => {
    if (ctx.isCurrent()) ctx.update({ ideagatesTask: task, taskId: task?.taskId })
    try { await ctx.rememberTask(task) }
    catch (error) {
      // A failed completion write must not turn the next click into another billed POST.
      if (!task && run.task?.taskId && ctx.isCurrent()) ctx.update({ ideagatesTask: run.task, taskId: run.task.taskId })
      throw error
    }
  }
  const fail = async (error: string) => {
    stop(run)
    if (ctx.isCurrent()) { ctx.update({ status: 'error', error, referenceWarning: undefined }); await ctx.persist().catch(() => {}) }
  }
  if (ctx.data.ideagatesTask?.submissionUncertain && !ctx.data.ideagatesTask.taskId) {
    await fail('上次提交结果未确认，请先联系平台核对；确认未创建任务后才能重新生成。'); return
  }
  ctx.update({ status: 'running', progress: undefined, error: undefined, referenceWarning: undefined })
  let accepted = false
  try {
    if (ctx.data.ideagatesTask?.taskId) run.task = { ...ctx.data.ideagatesTask }
    else {
      const params = buildIdeaGatesNodeParams(ctx)
      const request = buildIdeaGatesBody(params, ctx.kind)
      const keyFingerprint = await ctx.provider.identity?.()
      if (!active()) { stop(run); return }
      run.task = { submissionId: ctx.submissionId, providerId: ctx.providerId, model: params.model, prompt: params.prompt, ratio: request.ratio, resolution: '720p', duration: request.duration, request, keyFingerprint, submissionUncertain: true }
      // Persist an uncertainty marker before the billed POST: a crash must never cause an automatic duplicate.
      run.submitting = true
      await saveTask(run.task)
      if (!active()) { run.submitting = false; await saveTask(undefined); stop(run); return }
      ctx.update({ referenceWarning: '正在提交生成任务，请勿重复点击。' })
      const result = await ctx.provider.createTask(params)
      if (!result.taskId) throw new IdeaGatesError('平台未返回任务 ID，请先核对是否已创建任务', { uncertain: true })
      accepted = true
      run.task = { ...run.task, ...result, submissionUncertain: false }
      await saveTask(run.task)
      if (ctx.isCurrent()) ctx.update({ referenceWarning: result.warning, ...(run.canceled ? { status: 'idle' } : {}) })
    }
  } catch (error) {
    if (!accepted && !(error as IdeaGatesError).uncertain) await saveTask(undefined).catch(() => {})
    await fail(error instanceof Error ? error.message : 'IDEA Gates 提交失败')
    return
  } finally { run.submitting = false }
  if (!active()) { stop(run); return }
  const started = Date.now()
  let failures = 0
  const poll = async () => {
    if (!active()) { stop(run); return }
    if (Date.now() - started > 60 * 60 * 1000) { await fail('查询已达 60 分钟，已保留任务号，可继续查询。'); return }
    let delay = 10000
    try {
      const task = run.task!
      const state = await ctx.provider.getTaskStatus(task.taskId!, task.keyFingerprint)
      if (!active()) { stop(run); return }
      // Keep complete provider metadata, including cgt ID, usage and last frame, on the node and on disk.
      ctx.update({ ideagatesResult: state.raw })
      await ctx.persist()
      if (state.status === 'failed') {
        if (state.raw.status === 'failed') await saveTask(undefined)
        await fail((state.error || '生成失败') + (state.raw.status === 'failed' ? '' : '；请联系平台核对，已保留原任务号'))
        return
      }
      if (state.status === 'completed') {
        if (!state.videoUrl) throw new IdeaGatesError('任务成功但成片地址尚未返回', { retryable: true })
        ctx.update({ progress: 99, referenceWarning: '视频已生成，正在保存成片。' })
        const url = await ctx.provider.download(task.taskId!, state.videoUrl, task.keyFingerprint)
        if (!active()) { stop(run); return }
        ctx.update({ status: 'completed', progress: 100, outputVideo: url, referenceWarning: undefined, error: undefined })
        ctx.complete(url, task, state.videoUrl)
        await saveTask(undefined)
        stop(run); return
      }
      failures = 0
      ctx.update({ progress: undefined, referenceWarning: state.status === 'pending' ? '平台排队中…' : '平台生成中…' })
    } catch (error) {
      if (!active()) { stop(run); return }
      if ((error as IdeaGatesError).retryable && ++failures <= 5) {
        delay = Math.max(Math.min(60000, 10000 * 2 ** failures), (error as IdeaGatesError).retryAfterMs || 0)
        ctx.update({ referenceWarning: '查询或下载暂时失败，正在重试原任务，不会重新生成。' })
      } else { await fail((error instanceof Error ? error.message : '查询失败') + '；已保留任务号，可继续查询。'); return }
    }
    if (active()) run.timer = setTimeout(poll, delay)
    else stop(run)
  }
  run.timer = setTimeout(poll, 10000)
}
