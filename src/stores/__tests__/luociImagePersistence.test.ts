import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { useNodeStore } from '../node'
import { LuociImageProvider } from '@/services/providers/luoci'
const mock = vi.hoisted(() => ({ provider: null as any, addAsset: vi.fn() }))
vi.mock('@/stores/ai', () => ({ useAIStore: () => ({ defaultImageProviderId: 'luoci-image', imageProviders: [], getImageProvider: () => mock.provider, getProviderConfig: () => ({ id: 'luoci-image', type: 'image', kind: 'luoci', name: '洛辞', apiKey: 'fake-key', models: [{ id: 'seedream-5-5', capabilities: { resolutions: ['1K', '1.5K', '2K'] } }] }) }) }))
vi.mock('@/stores/asset', () => ({ useAssetStore: () => ({ addAsset: mock.addAsset }) }))
vi.mock('@/services/imageStorage', () => ({ persistImage: async () => 'local-upload:///C:/images/result.png' }))
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); mock.addAsset.mockClear() })
function setup() {
  vi.useFakeTimers()
  const disk = new Map<string, string>()
  const request = vi.fn(async ({ route }: any) => ({ ok: true, data: route.endsWith('/quote') ? { estimatedPoints: 0.033 } : route.endsWith('/generations') ? { taskId: 't55' } : { task: { status: 'succeeded', settled: true, images: [{ url: '/api/v1/tasks/t55/images/0' }] } } }))
  const download = vi.fn(async () => ({ ok: true, data: { dataUrl: 'data:image/png;base64,AA==' } }))
  const set = vi.fn(async (key, value) => { disk.set(key, value) })
  vi.stubGlobal('electronAPI', { luociImage: { request, download }, store: { get: vi.fn(async key => disk.get(key) ?? null), set, delete: vi.fn() } })
  mock.provider = new LuociImageProvider('fake-key')
  setActivePinia(createPinia())
  return { disk, request, download, set, store: useNodeStore() }
}
function addNode(store: ReturnType<typeof useNodeStore>) {
  store.addNode({ id: 'image-node', type: 'ai-image', position: { x: 0, y: 0 }, data: { label: '图片', status: 'idle', model: 'seedream-5-5', prompt: '原提示词', ratio: '1:2', resolution: '1.5K' } })
}

it('persists an uncertain POST and resumes the same key/body after restarting the project', async () => {
  const { disk, request, store } = setup(); await store.init(); addNode(store)
  const normal = request.getMockImplementation()!
  request.mockImplementation(async args => args.route.endsWith('/generations') ? { ok: false, error: 'timeout' } as any : normal(args))
  await store.executeNode('image-node')
  const saved = JSON.parse(disk.get('nodeCanvas:default')!).nodes[0].data
  expect(saved.luociImageTask).toMatchObject({ providerId: 'luoci-image', body: { imageSize: '1.5K', aspectRatio: '1:2', prompt: '原提示词' } })
  expect(JSON.stringify(saved)).not.toContain('fake-key')
  request.mockImplementation(normal)
  setActivePinia(createPinia()); const reopened = useNodeStore(); await reopened.init()
  expect(reopened.nodes[0].data.status).toBe('idle')
  reopened.updateNodeData('image-node', { prompt: 'changed', inputImages: ['deleted'] })
  await reopened.executeNode('image-node')
  const posts = request.mock.calls.map(([args]) => args).filter(args => args.route.endsWith('/generations'))
  expect(posts).toHaveLength(2); expect(posts[0]).toEqual(posts[1])
  expect(reopened.nodes[0].data).toMatchObject({ status: 'completed', outputImage: 'local-upload:///C:/images/result.png', luociImageTask: undefined })
  expect(mock.addAsset).toHaveBeenCalledWith(expect.objectContaining({ prompt: '原提示词', ratio: '1:2', resolution: '1.5K' }))
  expect(JSON.parse(disk.get('nodeCanvas:default')!).nodes[0].data.luociImageTask).toBeUndefined()
})

it('retains a download failure and resumes with GET only', async () => {
  const { request, download, store } = setup(); await store.init(); addNode(store)
  download.mockResolvedValueOnce({ ok: false, error: 'download failed' } as any)
  await store.executeNode('image-node')
  expect(store.nodes[0].data.luociImageTask.taskId).toBe('t55')
  await store.executeNode('image-node')
  expect(request.mock.calls.filter(([args]) => args.route.endsWith('/generations'))).toHaveLength(1)
  expect(store.nodes[0].data.status).toBe('completed')
})

it('blocks submission when saving the request fails, including a retry', async () => {
  const { request, set, store } = setup(); await store.init(); addNode(store)
  set.mockRejectedValue(new Error('disk full'))
  await store.executeNode('image-node'); await store.executeNode('image-node')
  expect(request.mock.calls.filter(([args]) => args.route.endsWith('/generations'))).toHaveLength(0)
  expect(store.nodes[0].data.error).toContain('写入失败')
})

it('saves a delayed task response into the original project after switching canvases', async () => {
  const { request, store, disk } = setup(); await store.init(); addNode(store)
  let resolvePost!: (value: any) => void
  const normal = request.getMockImplementation()!
  request.mockImplementation(args => args.route.endsWith('/generations') ? new Promise(resolve => { resolvePost = resolve }) : normal(args))
  const running = store.executeNode('image-node'); await vi.advanceTimersByTimeAsync(1)
  await store.loadProject('other'); addNode(store)
  resolvePost({ ok: true, data: { taskId: 't55' } }); await running
  expect(store.nodes[0].data.outputImage).toBeUndefined()
  expect(JSON.parse(disk.get('nodeCanvas:default')!).nodes[0].data.luociImageTask.taskId).toBe('t55')
  await store.loadProject('default'); await store.executeNode('image-node')
  expect(store.nodes[0].data.status).toBe('completed')
  expect(request.mock.calls.filter(([args]) => args.route.endsWith('/generations'))).toHaveLength(1)
})

it('persists a returned task after cancellation and resumes without a new POST', async () => {
  const { request, store } = setup(); await store.init(); addNode(store)
  let resolvePost!: (value: any) => void
  const normal = request.getMockImplementation()!
  request.mockImplementation(args => args.route.endsWith('/generations') ? new Promise(resolve => { resolvePost = resolve }) : normal(args))
  const running = store.executeNode('image-node'); await vi.advanceTimersByTimeAsync(1)
  store.cancelImageNode('image-node'); await store.executeNode('image-node')
  resolvePost({ ok: true, data: { taskId: 't55' } }); await running
  expect(store.nodes[0].data.luociImageTask.taskId).toBe('t55')
  await store.executeNode('image-node')
  expect(request.mock.calls.filter(([args]) => args.route.endsWith('/generations'))).toHaveLength(1)
  expect(store.nodes[0].data.status).toBe('completed')
})
