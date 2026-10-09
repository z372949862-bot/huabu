import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNodeStore } from '../node'
import { useAssetStore } from '../asset'

const mock = vi.hoisted(() => ({ provider: { createTask: vi.fn(), getTaskStatus: vi.fn() }, error: vi.fn() }))
vi.mock('@/stores/ai', () => ({ useAIStore: () => ({
  defaultProviderId: 'test',
  getProvider: () => mock.provider,
  getProviderConfig: () => ({ id: 'test', kind: 'custom', name: 'Test', apiKey: 'test-only' }),
}) }))
vi.mock('element-plus', () => ({ ElMessage: { error: mock.error } }))
const deferred = <T = any>() => {
  let resolve!: (value: T) => void, reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const remote = 'https://example.test/result.mp4'
const assetInput = { type: 'video' as const, url: remote, nodeId: 'v', nodeType: 'ai-video',
  projectId: 'default', prompt: '走路', model: 'test', providerId: 'test', providerName: 'Test' }

describe('video completion and automatic storage', () => {
  let disk: Map<string, string>
  let save: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    setActivePinia(createPinia())
    disk = new Map()
    save = vi.fn().mockResolvedValue({ ok: true, path: 'C:\\videos\\result.mp4' })
    vi.stubGlobal('electronAPI', { video: { saveGenerated: save }, store: {
      get: vi.fn(async key => disk.get(key) ?? null),
      set: vi.fn(async (key, value) => { disk.set(key, value) }),
      delete: vi.fn(),
    } })
    mock.provider.createTask.mockResolvedValue({ taskId: 't' })
  })
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })
  async function setup() {
    const nodes = useNodeStore()
    await nodes.init()
    nodes.addNode({ id: 'v', type: 'ai-video', position: { x: 0, y: 0 },
      data: { status: 'idle', prompt: '走路', model: 'test', providerId: 'test' } })
    return nodes
  }
  it('allows only one slow query and never times out after completion', async () => {
    const result = deferred()
    mock.provider.getTaskStatus.mockReturnValue(result.promise)
    const nodes = await setup()
    await nodes.executeNode('v')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mock.provider.getTaskStatus).toHaveBeenCalledTimes(1)
    result.resolve({ status: 'completed', videoUrl: remote })
    await vi.advanceTimersByTimeAsync(31 * 60_000)
    expect(nodes.nodes[0].data).toMatchObject({ status: 'completed', outputVideo: 'local-upload:///C:/videos/result.mp4' })
    expect(mock.error).not.toHaveBeenCalled()
    expect(mock.provider.getTaskStatus).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledTimes(1)
  })
  it('ignores an old query rejection after a newer run completed', async () => {
    const old = deferred()
    mock.provider.getTaskStatus.mockReturnValueOnce(old.promise).mockResolvedValue({ status: 'completed', videoUrl: remote })
    const nodes = await setup()
    await nodes.executeNode('v')
    await vi.advanceTimersByTimeAsync(3000)
    await nodes.executeNode('v')
    await vi.advanceTimersByTimeAsync(3000)
    old.reject(new Error('查询超时'))
    await vi.advanceTimersByTimeAsync(31 * 60_000)
    expect(nodes.nodes[0].data.status).toBe('completed')
    expect(mock.error).not.toHaveBeenCalled()
    expect(useAssetStore().assets).toHaveLength(1)
  })
  it('does not start an orphan timer when cancelled submission returns', async () => {
    const submitting = deferred()
    mock.provider.createTask.mockReturnValueOnce(submitting.promise)
    const nodes = await setup()
    const pending = nodes.executeNode('v')
    await vi.advanceTimersByTimeAsync(0)
    nodes.cancelExecution('v')
    submitting.resolve({ taskId: 'late' })
    await pending
    await vi.advanceTimersByTimeAsync(31 * 60_000)
    expect(mock.provider.getTaskStatus).not.toHaveBeenCalled()
    expect(mock.error).not.toHaveBeenCalled()
  })
  it('keeps completed video on save failure and retries only the save', async () => {
    save.mockResolvedValueOnce({ ok: false, error: 'download timeout' })
    const nodes = await setup()
    nodes.updateNodeData('v', { status: 'completed', outputVideo: remote })
    const assets = useAssetStore()
    const asset = assets.addAsset(assetInput)
    await assets.retrySaveVideo(asset.id)
    expect(nodes.nodes[0].data.status).toBe('completed')
    expect(assets.assets[0]).toMatchObject({ url: remote, saveStatus: 'error' })
    await assets.retrySaveVideo(asset.id)
    await nextTick()
    expect(nodes.nodes[0].data.outputVideo).toBe('local-upload:///C:/videos/result.mp4')
    expect(JSON.parse(disk.get('generatedAssets')!)[0].saveStatus).toBe('saved')
    expect(assets.remoteVideoUrl(assets.assets[0].url)).toBe(remote)
    expect(assets.addAsset(assetInput).id).toBe(asset.id)
    expect(mock.provider.createTask).not.toHaveBeenCalled()
    setActivePinia(createPinia())
    const restored = useAssetStore()
    await restored.init()
    expect(restored.assets[0].url).toBe('local-upload:///C:/videos/result.mp4')
    expect(save).toHaveBeenCalledTimes(2)
  })
  it('does not replace a newer video when an older download finishes', async () => {
    const download = deferred()
    save.mockReturnValue(download.promise)
    const nodes = await setup()
    const assets = useAssetStore()
    const asset = assets.addAsset(assetInput)
    nodes.updateNodeData('v', { status: 'completed', outputVideo: 'https://example.test/new.mp4' })
    download.resolve({ ok: true, path: 'C:\\videos\\old.mp4' })
    await assets.retrySaveVideo(asset.id)
    await nextTick()
    expect(nodes.nodes[0].data.outputVideo).toBe('https://example.test/new.mp4')
  })
  it('resumes interrupted saves on startup without submitting generation', async () => {
    disk.set('generatedAssets', JSON.stringify([{ ...assetInput, id: 'resume', createdAt: 1, sourceUrl: remote, saveStatus: 'saving' }]))
    const assets = useAssetStore()
    await assets.init()
    await assets.retrySaveVideo('resume')
    expect(assets.assets[0].saveStatus).toBe('saved')
    expect(save).toHaveBeenCalledTimes(1)
    expect(mock.provider.createTask).not.toHaveBeenCalled()
  })
  it('never assigns another local result to an empty node', async () => {
    const nodes = await setup()
    useAssetStore().addAsset({ ...assetInput, nodeId: 'other', url: 'local-upload:///C:/videos/other.mp4' })
    await nextTick()
    expect(nodes.nodes[0].data.outputVideo).toBeUndefined()
  })
})
