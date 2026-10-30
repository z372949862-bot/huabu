import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelAiideNode, runAiideNode } from '../aiideTask'
import { AiideRequestError } from '../providers/aiide'

const pending = { taskId: 'saved-task', providerId: 'aiide', model: 'dreamina-seedance-2-5-hc', prompt: '原提示词', duration: 8 }
function context(data: Record<string, any> = {}) {
  const nodeData: Record<string, any> = { prompt: '向前走', model: pending.model, ...data }
  return {
    id: 'v', data: nodeData, nodes: [{ id: 'v', data: nodeData }], edges: [], providerId: 'aiide',
    provider: { createTask: vi.fn().mockResolvedValue({ taskId: 'new-task' }), getTaskStatus: vi.fn().mockResolvedValue({ status: 'processing' }) },
    upload: vi.fn().mockImplementation(async url => url), resolveVideoUrl: (url: string) => url,
    update: vi.fn(patch => Object.assign(nodeData, patch)), persist: vi.fn().mockResolvedValue(undefined),
    isCurrent: vi.fn(() => true), complete: vi.fn(),
  }
}
describe('AIIDE task recovery', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { cancelAiideNode('v'); vi.clearAllTimers(); vi.useRealTimers() })

  it('persists the task before querying and retries 502 queries without any new POST', async () => {
    const ctx = context()
    ctx.provider.getTaskStatus.mockRejectedValueOnce(new AiideRequestError('AIIDE 请求失败 502：fail_to_fetch_task', true))
      .mockResolvedValue({ status: 'completed', videoUrl: 'https://example.com/final.mp4' })
    await runAiideNode(ctx)
    expect(ctx.data.aiideTask).toMatchObject({ taskId: 'new-task', prompt: '向前走' })
    expect(ctx.persist).toHaveBeenCalled()
    expect(ctx.provider.getTaskStatus).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(3000)
    expect(ctx.data.status).toBe('running')
    expect(ctx.data.referenceWarning).toContain('不会重新提交')
    await vi.advanceTimersByTimeAsync(6000)
    expect(ctx.provider.createTask).toHaveBeenCalledTimes(1)
    expect(ctx.complete).toHaveBeenCalledTimes(1)
    expect(ctx.data).toMatchObject({ status: 'completed', aiideTask: undefined })
  })

  it('retains the task after retry exhaustion and resumes without uploads or another POST', async () => {
    const ctx = context({ aiideTask: pending })
    ctx.provider.getTaskStatus.mockRejectedValue(new AiideRequestError('network', true))
    await runAiideNode(ctx)
    await vi.advanceTimersByTimeAsync(130_000)
    expect(ctx.provider.getTaskStatus).toHaveBeenCalledTimes(6)
    expect(ctx.data).toMatchObject({ status: 'error', aiideTask: pending })
    ctx.provider.getTaskStatus.mockResolvedValue({ status: 'completed', videoUrl: 'https://example.com/result.mp4' })
    await runAiideNode(ctx)
    await vi.advanceTimersByTimeAsync(3000)
    expect(ctx.provider.createTask).not.toHaveBeenCalled()
    expect(ctx.upload).not.toHaveBeenCalled()
    expect(ctx.complete).toHaveBeenCalledExactlyOnceWith('https://example.com/result.mp4', pending)
  })

  it('retains an existing task on auth errors but clears it on an actual task failure', async () => {
    const ctx = context({ aiideTask: pending })
    ctx.provider.getTaskStatus.mockRejectedValue(new AiideRequestError('AIIDE API Key 无效或已过期'))
    await runAiideNode(ctx)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(ctx.provider.getTaskStatus).toHaveBeenCalledTimes(1)
    expect(ctx.data.aiideTask).toEqual(pending)
    ctx.provider.getTaskStatus.mockResolvedValue({ status: 'failed', error: '参考素材审核未通过' })
    await runAiideNode(ctx)
    await vi.advanceTimersByTimeAsync(3000)
    expect(ctx.data).toMatchObject({ status: 'error', error: '参考素材审核未通过', aiideTask: undefined, taskId: undefined })
  })

  it('never submits generation when the reference upload fails', async () => {
    const ctx = context({ inputImages: ['local-upload:///C:/a.png'] })
    ctx.upload.mockRejectedValue(new Error('图床不可用'))
    await runAiideNode(ctx)
    expect(ctx.data.status).toBe('error')
    expect(ctx.data.error).toContain('图床不可用')
    expect(ctx.provider.createTask).not.toHaveBeenCalled()
  })

  it('does not POST again after an uncertain submission error', async () => {
    const ctx = context()
    ctx.provider.createTask.mockRejectedValue(new Error('提交结果不确定，请先到平台核实'))
    await runAiideNode(ctx)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(ctx.provider.createTask).toHaveBeenCalledTimes(1)
    expect(ctx.provider.getTaskStatus).not.toHaveBeenCalled()
    expect(ctx.data.error).toContain('先到平台核实')
  })

  it('keeps an outstanding POST locked and preserves its task ID after local cancellation', async () => {
    const ctx = context()
    let resolve!: (value: any) => void
    ctx.provider.createTask.mockImplementation(() => new Promise(r => { resolve = r }))
    const run = runAiideNode(ctx)
    cancelAiideNode('v')
    await runAiideNode(ctx)
    expect(ctx.provider.createTask).toHaveBeenCalledTimes(1)
    resolve({ taskId: 'late-task' })
    await run
    expect(ctx.data).toMatchObject({ status: 'idle', aiideTask: { taskId: 'late-task' } })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(ctx.provider.getTaskStatus).not.toHaveBeenCalled()
  })

  it('ignores late queries after project switching and serializes slow queries', async () => {
    const ctx = context({ aiideTask: pending })
    let resolve!: (value: any) => void
    ctx.provider.getTaskStatus.mockImplementation(() => new Promise(r => { resolve = r }))
    await runAiideNode(ctx)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(ctx.provider.getTaskStatus).toHaveBeenCalledTimes(1)
    ctx.isCurrent.mockReturnValue(false)
    resolve({ status: 'completed', videoUrl: 'https://example.com/late.mp4' })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(ctx.complete).not.toHaveBeenCalled()
    expect(ctx.data.aiideTask).toEqual(pending)
  })

  it('keeps the task when a completed response is missing the video URL', async () => {
    const ctx = context({ aiideTask: pending })
    ctx.provider.getTaskStatus.mockResolvedValue({ status: 'completed' })
    await runAiideNode(ctx)
    await vi.advanceTimersByTimeAsync(12_000)
    expect(ctx.data).toMatchObject({ status: 'error', aiideTask: pending })
    expect(ctx.complete).not.toHaveBeenCalled()
  })
})
