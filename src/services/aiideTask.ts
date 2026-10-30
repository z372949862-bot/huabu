import type { CreateTaskParams, TaskStatus, ContentItem } from './ai-provider'
import { prepareQilingReferences } from './qilingReferences'
import { AIIDE_SEEDANCE_25_MODEL, AiideRequestError } from './providers/aiide'

export interface AiidePendingTask {
  taskId: string
  providerId: string
  model: string
  prompt: string
  ratio?: string
  resolution?: string
  duration?: number
}

interface Context {
  id: string
  data: Record<string, any>
  nodes: Array<{ id: string; type?: string; data?: Record<string, any> }>
  edges: Array<{ source: string; target: string }>
  providerId: string
  provider: {
    createTask: (params: CreateTaskParams) => Promise<{ taskId: string }>
    getTaskStatus: (taskId: string, signal?: AbortSignal) => Promise<TaskStatus>
  }
  upload: (url: string) => Promise<string>
  resolveVideoUrl: (url: string) => string
  update: (patch: Record<string, any>) => void
  persist: () => Promise<void>
  rememberTask?: (task: AiidePendingTask) => Promise<void>
  isCurrent: () => boolean
  complete: (url: string, task: AiidePendingTask) => void
}

interface Run { ctx: Context; controller: AbortController; timer?: ReturnType<typeof setTimeout>; task?: AiidePendingTask; canceled: boolean; submitting: boolean }
const runs = new Map<string, Run>()
function stop(run: Run) {
  if (run.timer) clearTimeout(run.timer)
  run.controller.abort()
  if (runs.get(run.ctx.id) === run) runs.delete(run.ctx.id)
}

export function cancelAiideNode(id: string) {
  const run = runs.get(id)
  if (!run) return
  run.canceled = true
  if (run.timer) clearTimeout(run.timer)
  run.controller.abort()
  // Do not abort/repeat a billed POST. Keep its lock until the response arrives.
  if (!run.submitting) stop(run)
  if (run.ctx.isCurrent()) run.ctx.update({ status: 'idle', progress: undefined,
    referenceWarning: run.submitting ? '正在确认 AIIDE 提交结果，请勿重复生成。' : run.task ? '已停止本地查询，点击「继续查询」可取回平台结果。' : undefined })
}

export async function runAiideNode(ctx: Context) {
  if (runs.has(ctx.id)) return
  const run: Run = { ctx, controller: new AbortController(), canceled: false, submitting: false }
  runs.set(ctx.id, run)
  const active = () => {
    if (runs.get(ctx.id) !== run || run.canceled) return false
    if (!ctx.isCurrent()) { stop(run); return false }
    return true
  }
  const fail = (message: string, terminal = false) => {
    if (!active()) return
    stop(run)
    ctx.update({ status: 'error', error: message, referenceWarning: undefined, ...(terminal ? { aiideTask: undefined, taskId: undefined } : {}) })
    void ctx.persist()
  }
  ctx.update({ status: 'running', progress: undefined, error: undefined, referenceWarning: undefined })
  try {
    if (ctx.data.aiideTask?.taskId) {
      run.task = { ...ctx.data.aiideTask }
    } else {
      const refs = prepareQilingReferences(ctx.id, ctx.nodes, ctx.edges)
      if (!refs.prompt) throw new Error('请输入视频提示词或编辑、延长指令')
      if (refs.images.length + refs.videos.length + refs.audios.length > 50) throw new Error('AIIDE 最多支持 50 项参考素材')
      const mode = ctx.data.videoMode || 'reference'
      if ((mode === 'edit' || mode === 'extend') && !refs.videos.length) throw new Error('视频编辑或延长需要连接视频素材')
      const content: ContentItem[] = []
      for (const [type, urls] of [['video', refs.videos], ['image', refs.images], ['audio', refs.audios]] as const) {
        for (const [i, url] of urls.entries()) {
          if (!active()) return
          ctx.update({ referenceWarning: `正在准备参考${{ image: '图片', video: '视频', audio: '音频' }[type]} ${i + 1}/${urls.length}，较大素材上传可能需要数分钟，尚未提交生成任务。` })
          let remote: string
          try { remote = await ctx.upload(type === 'video' ? ctx.resolveVideoUrl(url) : url) }
          catch (error) { throw new Error(`参考${{ image: '图片', video: '视频', audio: '音频' }[type]}第 ${i + 1} 项上传失败：${error instanceof Error ? error.message : '网络错误'}`) }
          if (!active()) return
          content.push({ type: type + '_url', [type + '_url']: { url: remote }, role: 'reference_' + type } as ContentItem)
        }
      }
      const params: CreateTaskParams = {
        model: ctx.data.model || AIIDE_SEEDANCE_25_MODEL, prompt: refs.prompt,
        mode: mode === 'reference' ? (content.length ? 'reference_material' : 't2v') : mode,
        content, ratio: ctx.data.ratio, resolution: ctx.data.resolution,
        duration: ctx.data.duration, generate_audio: ctx.data.generateAudio,
      }
      run.submitting = true
      ctx.update({ referenceWarning: '参考素材已就绪，正在提交 AIIDE 生成任务，请勿重复点击。' })
      let result: { taskId: string }
      try { result = await ctx.provider.createTask(params) }
      finally { run.submitting = false }
      if (!result.taskId) throw new Error('AIIDE 未返回任务 ID，请先到平台确认提交结果，避免重复生成')
      run.task = { taskId: result.taskId, providerId: ctx.providerId, model: params.model, prompt: params.prompt,
        ratio: params.ratio, resolution: params.resolution, duration: params.duration }
      // A response after local cancellation still contains a valuable billed task ID.
      if (ctx.isCurrent()) {
        ctx.update({ taskId: result.taskId, aiideTask: run.task, referenceWarning: undefined,
          ...(run.canceled ? { status: 'idle', referenceWarning: 'AIIDE 已创建任务，点击「继续查询」取回结果，无需重新生成。' } : {}) })
      }
      if (ctx.rememberTask) await ctx.rememberTask(run.task)
      else if (ctx.isCurrent()) await ctx.persist()
    }
    if (!active()) { stop(run); return }
    ctx.update({ taskId: run.task!.taskId })
  } catch (error) {
    if (run.canceled && ctx.isCurrent()) {
      ctx.update({ status: 'error', error: error instanceof Error ? error.message : 'AIIDE 提交结果不确定，请到平台核实', referenceWarning: undefined })
      void ctx.persist()
    } else fail(error instanceof Error ? error.message : 'AIIDE 提交失败')
    stop(run)
    return
  }

  const started = Date.now()
  let failures = 0
  let missingUrl = 0
  const poll = async () => {
    if (!active()) return
    if (Date.now() - started > 30 * 60 * 1000) { fail('查询已达 30 分钟，任务 ID 已保留，请点击「继续查询」。'); return }
    let delay = 3000
    try {
      const status = await ctx.provider.getTaskStatus(run.task!.taskId, run.controller.signal)
      if (!active()) return
      failures = 0
      if (status.status === 'failed') { fail(status.error || 'AIIDE 生成失败', true); return }
      if (status.status === 'completed' && status.videoUrl) {
        stop(run)
        ctx.update({ status: 'completed', progress: 100, outputVideo: status.videoUrl, aiideTask: undefined,
          taskId: undefined, error: undefined, referenceWarning: status.warning })
        ctx.complete(status.videoUrl, run.task!)
        void ctx.persist()
        return
      }
      if (status.status === 'completed') {
        if (++missingUrl >= 3) { fail('AIIDE 已完成但未返回视频地址，任务 ID 已保留，请稍后继续查询。'); return }
      } else missingUrl = 0
      ctx.update({ progress: typeof status.progress === 'number' ? Math.min(99, Math.max(0, status.progress)) : undefined, error: undefined, referenceWarning: undefined })
    } catch (error) {
      if (!active()) return
      if (error instanceof AiideRequestError && error.retryable && ++failures <= 5) {
        ctx.update({ referenceWarning: `AIIDE 查询暂时失败，正在重试（${failures}/5），不会重新提交生成。` })
        delay = Math.min(30_000, 3000 * 2 ** failures)
      } else { fail((error instanceof Error ? error.message : 'AIIDE 查询失败') + '；任务 ID 已保留，可继续查询，无需重新生成。'); return }
    }
    if (active()) run.timer = setTimeout(poll, delay)
  }
  run.timer = setTimeout(poll, 3000)
}
