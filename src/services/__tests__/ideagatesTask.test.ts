import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildIdeaGatesNodeParams, cancelIdeaGatesNode, runIdeaGatesNode } from '../ideagatesTask'
import { IdeaGatesError } from '../providers/ideagates'
const pending = { taskId: 'task_saved', providerId: 'idea', model: 'doubao-seedance-2-5-260628', prompt: '原始提示词', resolution: '720p', keyFingerprint: 'original' }
function context(data: Record<string, any> = {}) {
  const nodeData: Record<string, any> = { prompt: '海浪移动', model: pending.model, ...data }
  const ctx = { id: 'idea-node', data: nodeData, nodes: [{ id: 'idea-node', data: nodeData }], edges: [], providerId: 'idea', kind: 'ideagates' as const,
    provider: { createTask: vi.fn().mockResolvedValue({ taskId: 'task_new', keyFingerprint: 'original' }), getTaskStatus: vi.fn().mockResolvedValue({ status: 'processing', raw: { status: 'running' } }), download: vi.fn().mockResolvedValue('local-upload:///C:/result.mp4') },
    resolveVideoUrl: (url: string) => url, update: vi.fn(patch => Object.assign(nodeData, patch)), persist: vi.fn().mockResolvedValue(undefined), rememberTask: vi.fn().mockResolvedValue(undefined), isCurrent: vi.fn(() => true), complete: vi.fn() }
  return ctx
}
describe('IDEA Gates task lifecycle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { cancelIdeaGatesNode('idea-node'); vi.clearAllTimers(); vi.useRealTimers() })
  it('persists before polling, retries GET and downloads without another POST', async () => {
    const ctx = context()
    ctx.provider.getTaskStatus.mockRejectedValueOnce(new IdeaGatesError('temporary', { retryable: true, retryAfterMs: 30000 })).mockResolvedValue({ status: 'completed', videoUrl: 'https://example.com/a.mp4', raw: { status: 'succeeded', 'doubao-id': 'cgt-id', usage: { total_tokens: 55 } } })
    await runIdeaGatesNode(ctx)
    expect(ctx.data.ideagatesTask.taskId).toBe('task_new')
    expect(ctx.rememberTask).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10000)
    expect(ctx.provider.getTaskStatus).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(29999)
    expect(ctx.provider.getTaskStatus).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(ctx.provider.createTask).toHaveBeenCalledTimes(1)
    expect(ctx.provider.download).toHaveBeenCalledWith('task_new', 'https://example.com/a.mp4', 'original')
    expect(ctx.data).toMatchObject({ status: 'completed', ideagatesTask: undefined, ideagatesResult: { 'doubao-id': 'cgt-id' } })
  })
  it('resumes a saved task using its original key fingerprint, without another create', async () => {
    const ctx = context({ ideagatesTask: pending, prompt: 'changed' })
    await runIdeaGatesNode(ctx); await vi.advanceTimersByTimeAsync(10000)
    expect(ctx.provider.createTask).not.toHaveBeenCalled()
    expect(ctx.provider.getTaskStatus).toHaveBeenCalledWith('task_saved', 'original')
  })
  it('blocks resubmission after uncertain create failure until explicitly reconciled', async () => {
    const ctx = context()
    ctx.provider.createTask.mockRejectedValue(new IdeaGatesError('提交结果不确定', { uncertain: true }))
    await runIdeaGatesNode(ctx)
    expect(ctx.data.ideagatesTask.submissionUncertain).toBe(true)
    await runIdeaGatesNode(ctx)
    expect(ctx.provider.createTask).toHaveBeenCalledTimes(1)
  })
  it('retains late task ID after cancellation and project switching', async () => {
    const ctx = context()
    let resolve!: (value: any) => void
    ctx.provider.createTask.mockImplementation(() => new Promise(r => { resolve = r }))
    const run = runIdeaGatesNode(ctx)
    await vi.advanceTimersByTimeAsync(0)
    cancelIdeaGatesNode(ctx.id)
    await runIdeaGatesNode(ctx)
    expect(ctx.provider.createTask).toHaveBeenCalledTimes(1)
    ctx.isCurrent.mockReturnValue(false)
    resolve({ taskId: 'task_late', keyFingerprint: 'original' }); await run
    expect(ctx.rememberTask).toHaveBeenLastCalledWith(expect.objectContaining({ taskId: 'task_late' }))
    await vi.advanceTimersByTimeAsync(60000)
    expect(ctx.provider.getTaskStatus).not.toHaveBeenCalled()
  })
  it('rejects local media before submitting and permits URL/asset references', async () => {
    const ctx = context({ inputImages: ['local-upload:///C:/a.png'] })
    await runIdeaGatesNode(ctx)
    expect(ctx.provider.createTask).not.toHaveBeenCalled()
    expect(ctx.data.error).toContain('公网')
    const frames = context({ inputImages: ['asset://first', 'https://example.com/last.png'], dmxFrameMode: 'first_last_frame' })
    expect(buildIdeaGatesNodeParams(frames).content?.map(item => item.role)).toEqual([undefined, 'first_frame', 'last_frame'])
  })
  it('keeps auth failures and cancelled/expired tasks recoverable', async () => {
    const ctx = context({ ideagatesTask: pending })
    ctx.provider.getTaskStatus.mockRejectedValue(new IdeaGatesError('wrong key'))
    await runIdeaGatesNode(ctx); await vi.advanceTimersByTimeAsync(10000)
    expect(ctx.data.ideagatesTask).toEqual(pending)
    ctx.provider.getTaskStatus.mockResolvedValue({ status: 'failed', raw: { status: 'expired' } })
    await runIdeaGatesNode(ctx); await vi.advanceTimersByTimeAsync(10000)
    expect(ctx.data.ideagatesTask).toEqual(pending)
  })
  it('keeps download failures recoverable and never marks an unsaved video complete', async () => {
    const ctx = context({ ideagatesTask: pending })
    ctx.provider.getTaskStatus.mockResolvedValue({ status: 'completed', videoUrl: 'https://example.com/a.mp4', raw: { status: 'succeeded' } })
    ctx.provider.download.mockRejectedValue(new IdeaGatesError('download failure'))
    await runIdeaGatesNode(ctx); await vi.advanceTimersByTimeAsync(10000)
    expect(ctx.data.ideagatesTask).toEqual(pending)
    expect(ctx.complete).not.toHaveBeenCalled()
  })
  it('does not submit when the uncertainty marker cannot be persisted', async () => {
    const ctx = context()
    ctx.rememberTask.mockRejectedValue(new Error('disk full'))
    await runIdeaGatesNode(ctx)
    expect(ctx.provider.createTask).not.toHaveBeenCalled()
    expect(ctx.data.error).toContain('disk full')
  })
  it('restores the pending task when writing completed state fails, then retries without a POST', async () => {
    const ctx = context({ ideagatesTask: pending })
    ctx.provider.getTaskStatus.mockResolvedValue({ status: 'completed', videoUrl: 'https://example.com/a.mp4', raw: { status: 'succeeded' } })
    ctx.rememberTask.mockImplementation(async task => { if (!task) throw new Error('completion write failed') })
    await runIdeaGatesNode(ctx); await vi.advanceTimersByTimeAsync(10000)
    expect(ctx.data).toMatchObject({ status: 'error', ideagatesTask: pending })
    ctx.rememberTask.mockResolvedValue(undefined)
    await runIdeaGatesNode(ctx); await vi.advanceTimersByTimeAsync(10000)
    expect(ctx.data).toMatchObject({ status: 'completed', ideagatesTask: undefined })
    expect(ctx.provider.createTask).not.toHaveBeenCalled()
  })
})
