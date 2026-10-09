import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelDmxApiNode, prepareDmxMediaUrl, prepareDmxReferences, runDmxApiNode } from '../dmxapiTask'

describe('DMXAPI references', () => {
  it('binds filenames to deduplicated media positions and keeps the complete prompt', () => {
    const result = prepareDmxReferences({
      id: 'v', edges: [{ source: 'a', target: 'v' }, { source: 'b', target: 'v' }],
      nodes: [
        { id: 'a', type: 'asset-ref', data: { assetUrl: 'https://example.com/a.png' } },
        { id: 'b', type: 'asset-ref', data: { assetUrl: 'https://example.com/b.png' } },
        { id: 'v', data: {
          prompt: '角色：@[乙.png](node_b)是乙、@[甲.png](node_a)是甲。\n内容：乙转身，按@[动作](m)运动。',
          inputImages: ['https://example.com/a.png', 'https://example.com/b.png'],
          _uploads: [{ id: 'm', type: 'video', url: 'asset://motion' }],
        } },
      ],
    })
    expect(result.images).toEqual(['https://example.com/a.png', 'https://example.com/b.png'])
    expect(result.videos).toEqual(['asset://motion'])
    expect(result.prompt).toBe('角色：@图像2是乙、@图像1是甲。\n内容：乙转身，按@视频1运动。')
  })

  it('converts a local image to inline data without any upload request', async () => {
    const read = vi.fn().mockResolvedValue(new File(['image-bytes'], 'reference.png', { type: 'image/png' }))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'))
    try {
      const result = await prepareDmxMediaUrl('local-upload:///C:/reference.png', 'image', read)
      expect(result).toBe('data:image/png;base64,' + btoa('image-bytes'))
      expect(fetchMock).not.toHaveBeenCalled()
      expect(await prepareDmxMediaUrl(result, 'image', read)).toBe(result)
      expect(read).toHaveBeenCalledTimes(1)
    } finally { fetchMock.mockRestore() }
  })

  it('requires links or asset IDs for video/audio without reading or uploading local files', async () => {
    const read = vi.fn()
    await expect(prepareDmxMediaUrl('local-upload:///C:/video.mp4', 'video', read)).rejects.toThrow('公网链接')
    await expect(prepareDmxMediaUrl('data:audio/wav;base64,AAAA', 'audio', read)).rejects.toThrow('公网链接')
    expect(await prepareDmxMediaUrl('asset://video-id', 'video', read)).toBe('asset://video-id')
    expect(read).not.toHaveBeenCalled()
  })
})

const pending = {
  taskId: 'task_saved', providerId: 'dmx', model: 'doubao-seedance-2-5-260628',
  prompt: '原提示词', ratio: '16:9', resolution: '720p', duration: 5, createdAt: 1,
}

function makeContext(data: Record<string, any> = {}) {
  const nodeData: Record<string, any> = { prompt: '角色向前走', model: pending.model, duration: 5, ...data }
  return {
    id: 'v', data: nodeData, nodes: [{ id: 'v', data: nodeData }], edges: [],
    providerId: 'dmx',
    provider: {
      createTask: vi.fn().mockResolvedValue({ taskId: 'task_new' }),
      getTaskStatus: vi.fn().mockResolvedValue({ status: 'processing' }),
    },
    readFile: vi.fn(), update: vi.fn(patch => Object.assign(nodeData, patch)),
    persist: vi.fn().mockResolvedValue(undefined), isCurrent: vi.fn(() => true), complete: vi.fn(),
  }
}

describe('DMXAPI lifecycle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { cancelDmxApiNode('v'); vi.clearAllTimers(); vi.useRealTimers() })

  it('saves task metadata before polling and defaults edit output to playable MP4', async () => {
    const ctx = makeContext({ videoMode: 'edit', inputVideos: ['asset://source'], ratio: '16:9', duration: 8 })
    await runDmxApiNode(ctx)
    const body = ctx.provider.createTask.mock.calls[0][0]
    expect(body).toMatchObject({ ratio: 'adaptive', duration: -1, outputFormat: 'mp4', omniReferenceTaskType: 'edit' })
    expect(body.content[1]).toEqual({ type: 'video_url', video_url: { url: 'asset://source' }, role: 'reference_video' })
    expect(ctx.data.dmxTask.taskId).toBe('task_new')
    expect(ctx.persist).toHaveBeenCalled()
    expect(ctx.provider.getTaskStatus).not.toHaveBeenCalled()
  })

  it('resumes a saved task without submitting again and archives once', async () => {
    const ctx = makeContext({ dmxTask: pending })
    ctx.provider.getTaskStatus.mockResolvedValue({ status: 'completed', videoUrl: 'https://example.com/result.mp4' })
    await runDmxApiNode(ctx)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(ctx.provider.createTask).not.toHaveBeenCalled()
    expect(ctx.provider.getTaskStatus).toHaveBeenCalledTimes(1)
    expect(ctx.complete).toHaveBeenCalledExactlyOnceWith('https://example.com/result.mp4', pending)
    expect(ctx.data).toMatchObject({ status: 'completed', dmxTask: undefined })
  })

  it('does not revive a canceled submission when its delayed response arrives', async () => {
    const ctx = makeContext()
    let resolve!: (value: any) => void
    ctx.provider.createTask.mockImplementation(() => new Promise(r => { resolve = r }))
    const submitted = runDmxApiNode(ctx)
    cancelDmxApiNode('v')
    resolve({ taskId: 'task_late' })
    await submitted
    await vi.advanceTimersByTimeAsync(60_000)
    expect(ctx.data.status).toBe('idle')
    expect(ctx.provider.getTaskStatus).not.toHaveBeenCalled()
    expect(ctx.complete).not.toHaveBeenCalled()
    expect(ctx.provider.createTask.mock.calls[0][1].aborted).toBe(true)
  })

  it('runs only one query at a time and ignores a result after cancellation', async () => {
    const ctx = makeContext({ dmxTask: pending })
    let resolve!: (value: any) => void
    ctx.provider.getTaskStatus.mockImplementation(() => new Promise(r => { resolve = r }))
    await runDmxApiNode(ctx)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(ctx.provider.getTaskStatus).toHaveBeenCalledTimes(1)
    cancelDmxApiNode('v')
    resolve({ status: 'completed', videoUrl: 'https://example.com/late.mp4' })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(ctx.complete).not.toHaveBeenCalled()
    expect(ctx.data.dmxTask).toEqual(pending)
    expect(ctx.data.status).toBe('idle')
  })

  it('cannot write a late video into a different project', async () => {
    const ctx = makeContext({ dmxTask: pending })
    let resolve!: (value: any) => void
    ctx.provider.getTaskStatus.mockImplementation(() => new Promise(r => { resolve = r }))
    await runDmxApiNode(ctx)
    await vi.advanceTimersByTimeAsync(3000)
    ctx.isCurrent.mockReturnValue(false)
    resolve({ status: 'completed', videoUrl: 'https://example.com/late.mp4' })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(ctx.complete).not.toHaveBeenCalled()
    expect(ctx.provider.getTaskStatus).toHaveBeenCalledTimes(1)
  })

  it('retries a temporary 503 query error without resubmitting the video', async () => {
    const ctx = makeContext({ dmxTask: pending })
    ctx.provider.getTaskStatus.mockRejectedValueOnce(new Error('DMXAPI 请求失败 503：busy'))
      .mockResolvedValueOnce({ status: 'completed', videoUrl: 'https://example.com/result.mp4' })
    await runDmxApiNode(ctx)
    await vi.advanceTimersByTimeAsync(9000)
    expect(ctx.provider.getTaskStatus).toHaveBeenCalledTimes(2)
    expect(ctx.provider.createTask).not.toHaveBeenCalled()
    expect(ctx.complete).toHaveBeenCalledTimes(1)
  })

  it('retains the task when completion is missing its result URL', async () => {
    const ctx = makeContext({ dmxTask: pending })
    ctx.provider.getTaskStatus.mockResolvedValue({ status: 'completed' })
    await runDmxApiNode(ctx)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(ctx.provider.getTaskStatus).toHaveBeenCalledTimes(3)
    expect(ctx.data).toMatchObject({ status: 'error', dmxTask: pending })
    expect(ctx.complete).not.toHaveBeenCalled()
  })

  it('uses real first/last frame roles instead of silently treating both as general references', async () => {
    const ctx = makeContext({ dmxFrameMode: 'first_last_frame', inputImages: ['asset://first', 'asset://last'], ratio: '16:9' })
    await runDmxApiNode(ctx)
    const body = ctx.provider.createTask.mock.calls[0][0]
    expect(body.ratio).toBe('adaptive')
    expect(body.omniReferenceTaskType).toBeUndefined()
    expect(body.content.slice(1).map((item: any) => item.role)).toEqual(['first_frame', 'last_frame'])
  })

  it('allows the same reference as both first and last frame', async () => {
    const ctx = makeContext({ dmxFrameMode: 'first_last_frame', inputImages: ['asset://same', 'asset://same'] })
    await runDmxApiNode(ctx)
    expect(ctx.provider.createTask).toHaveBeenCalledTimes(1)
    const content = ctx.provider.createTask.mock.calls[0][0].content
    expect(content.slice(1).map((item: any) => item.image_url.url)).toEqual(['asset://same', 'asset://same'])
    expect(content.slice(1).map((item: any) => item.role)).toEqual(['first_frame', 'last_frame'])
  })
})
