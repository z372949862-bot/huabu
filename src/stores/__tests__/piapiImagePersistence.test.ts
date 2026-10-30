import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNodeStore } from '../node'
import { PiapiImageProvider, PIAPI_IMAGE_MODEL } from '@/services/providers/piapiImage'
const mock = vi.hoisted(() => ({ provider: null as any, addAsset: vi.fn() }))
vi.mock('@/stores/ai', () => ({ useAIStore: () => ({ defaultImageProviderId: 'pi-image', imageProviders: [], getImageProvider: () => mock.provider, getProviderConfig: () => ({ id: 'pi-image', type: 'image', kind: 'piapi', name: 'PiAPI', apiKey: 'fake-key', models: [{ id: 'seedream-5-pro-less-restriction', capabilities: { resolutions: ['1K', '2K'] } }] }) }) }))
vi.mock('@/stores/asset', () => ({ useAssetStore: () => ({ addAsset: mock.addAsset }) }))
vi.mock('@/services/imageStorage', () => ({ persistImage: async (url: string) => url }))
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); mock.addAsset.mockClear() })
function setup() {
  vi.useFakeTimers()
  const disk = new Map<string, string>()
  const request = vi.fn().mockResolvedValue({ ok: true, data: { data: { task_id: 'task_image', status: 'Completed', output: { image_url: 'https://example.com/output.png' } } } })
  const downloadImage = vi.fn().mockResolvedValue({ ok: true, data: { path: 'C:/images/result.png' } })
  vi.stubGlobal('electronAPI', { piapi: { request, downloadImage }, store: { get: vi.fn(async key => disk.get(key) ?? null), set: vi.fn(async (key, value) => { disk.set(key, value) }), delete: vi.fn() } })
  mock.provider = new PiapiImageProvider('fake-key')
  setActivePinia(createPinia())
  return { disk, request, downloadImage, store: useNodeStore() }
}
function addNode(store: ReturnType<typeof useNodeStore>) {
  store.addNode({ id: 'image-node', type: 'ai-image', position: { x: 0, y: 0 }, data: { label: '图片', status: 'idle', model: PIAPI_IMAGE_MODEL, prompt: '原提示词', ratio: '4:5', resolution: '2K', imageOutputFormat: 'png' } })
}
describe('durable PiAPI image recovery', () => {
  it('persists the task on download failure, resumes after reload and writes history once', async () => {
    const { disk, request, downloadImage, store } = setup(); await store.init(); addNode(store)
    downloadImage.mockResolvedValueOnce({ ok: false, error: 'download unavailable' })
    await store.executeNode('image-node')
    const saved = JSON.parse(disk.get('nodeCanvas:default')!)
    expect(saved.nodes[0].data.piapiImageTask).toMatchObject({ taskId: 'task_image', providerId: 'pi-image', prompt: '原提示词', resolution: '2K' })
    expect(JSON.stringify(saved)).not.toContain('fake-key')
    setActivePinia(createPinia()); const reopened = useNodeStore(); await reopened.init()
    expect(reopened.nodes[0].data.status).toBe('idle')
    reopened.updateNodeData('image-node', { prompt: '修改过的提示词', inputImages: ['local-upload:///missing.png'] })
    await reopened.executeNode('image-node')
    expect(request.mock.calls.filter(call => call[0].body)).toHaveLength(1)
    expect(request.mock.calls[1][0].path).toBe('/api/v1/task/task_image')
    expect(reopened.nodes[0].data).toMatchObject({ status: 'completed', outputImage: 'local-upload:///C:/images/result.png', piapiImageTask: undefined })
    expect(mock.addAsset).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ prompt: '原提示词', projectId: 'default', ratio: '4:5', resolution: '2K', type: 'image' }))
    expect(JSON.parse(disk.get('nodeCanvas:default')!).nodes[0].data.piapiImageTask).toBeUndefined()
  })
  it('locks duplicate submission after cancel until POST returns, then resumes GET only', async () => {
    const { store, request } = setup(); await store.init(); addNode(store)
    let resolvePost!: (value: any) => void
    request.mockImplementationOnce(() => new Promise(resolve => { resolvePost = resolve }))
    const running = store.executeNode('image-node'); await vi.advanceTimersByTimeAsync(1)
    store.cancelImageNode('image-node'); await store.executeNode('image-node')
    expect(request).toHaveBeenCalledTimes(1)
    resolvePost({ ok: true, data: { data: { task_id: 'task_image', status: 'Pending' } } }); await running
    expect(store.nodes[0].data.piapiImageTask?.taskId).toBe('task_image')
    await store.executeNode('image-node')
    expect(request.mock.calls.filter(call => call[0].body)).toHaveLength(1)
    expect(store.nodes[0].data.status).toBe('completed')
  })
  it('saves a delayed response to the original project without changing the new canvas', async () => {
    const { store, request, disk } = setup(); await store.init(); addNode(store)
    let resolvePost!: (value: any) => void
    request.mockImplementationOnce(() => new Promise(resolve => { resolvePost = resolve }))
    const running = store.executeNode('image-node'); await vi.advanceTimersByTimeAsync(1)
    await store.loadProject('other'); addNode(store)
    resolvePost({ ok: true, data: { data: { task_id: 'task_image', status: 'Completed', output: { image_url: 'https://example.com/output.png' } } } }); await running
    expect(store.nodes[0].data.status).toBe('idle')
    expect(store.nodes[0].data.outputImage).toBeUndefined()
    expect(JSON.parse(disk.get('nodeCanvas:default')!).nodes[0].data.piapiImageTask.taskId).toBe('task_image')
    await store.loadProject('default'); await store.executeNode('image-node')
    expect(store.nodes[0].data.status).toBe('completed')
    expect(request.mock.calls.filter(call => call[0].body)).toHaveLength(1)
  })
})
