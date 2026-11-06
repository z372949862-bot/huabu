import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNodeStore } from '../node'
import { GeekNowImageProvider } from '@/services/providers/geeknow'
import { SUNBURST26_MODEL } from '@/services/geeknowSunburst26'

const mock = vi.hoisted(() => ({ provider: null as any, addAsset: vi.fn(), resolveGifs: vi.fn() }))
vi.mock('@/stores/ai', () => ({ useAIStore: () => ({ defaultImageProviderId: 'geek', imageProviders: [], getImageProvider: () => mock.provider, getProviderConfig: () => ({ id: 'geek', type: 'image', kind: 'geeknow', name: 'GeekNow', apiKey: 'fake-key', models: [{ id: 'gpt-image-2.6-sunburst', capabilities: { resolutions: ['1K', '2K', '4K'] } }] }) }) }))
vi.mock('@/stores/asset', () => ({ useAssetStore: () => ({ addAsset: mock.addAsset }) }))
vi.mock('@/services/geeknowSunburst26', async importOriginal => ({ ...await importOriginal<typeof import('@/services/geeknowSunburst26')>(), resolveSunburst26Gifs: (...args: any[]) => mock.resolveGifs(...args) }))
vi.mock('@/services/imageStorage', () => ({ persistImage: async () => 'local-upload:///C:/images/animation.gif' }))
vi.mock('@/services/imageProviderUtils', () => ({ prepareReferenceImage: async (url: string) => ({ base64: url, mimeType: 'image/png' }) }))

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); mock.addAsset.mockReset(); mock.resolveGifs.mockReset() })
function setup() {
  vi.useFakeTimers()
  const disk = new Map<string, string>()
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/animation.png' }] })))
  vi.stubGlobal('fetch', fetch)
  vi.stubGlobal('electronAPI', { store: { get: vi.fn(async key => disk.get(key) ?? null), set: vi.fn(async (key, value) => { disk.set(key, value) }), delete: vi.fn() } })
  mock.provider = new GeekNowImageProvider('fake-key')
  setActivePinia(createPinia())
  return { disk, fetch, store: useNodeStore() }
}
function addNode(store: ReturnType<typeof useNodeStore>) {
  store.addNode({ id: 'node', type: 'ai-image', position: { x: 0, y: 0 }, data: { label: '图片', status: 'idle', model: SUNBURST26_MODEL, prompt: '跳跃循环', ratio: '16:9', resolution: '2K', inputImages: ['ref1', 'ref2'], sunburst26: { format: 'gif', quality: 'high', frameCount: 12, frameDurationMs: 100 } } })
}

describe('Sunburst 2.6 result persistence', () => {
  it('passes node settings and references, saves the paid result, then recovers after reload with no POST', async () => {
    const { disk, fetch, store } = setup(); await store.init(); addNode(store)
    mock.resolveGifs.mockRejectedValueOnce(new Error('download unavailable')).mockResolvedValueOnce(['data:image/gif;base64,R0lG'])
    await store.executeNode('node')
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body).toMatchObject({ image: ['ref1', 'ref2'], size: 'auto', quality: 'high', output_format: 'gif', frame_count: 12, frame_duration_ms: 100 })
    const saved = JSON.parse(disk.get('nodeCanvas:default')!).nodes[0].data
    expect(saved.geeknowImageResult).toMatchObject({ sources: ['https://cdn.example/animation.png'], model: SUNBURST26_MODEL, providerId: 'geek', prompt: '跳跃循环' })
    expect(saved.sunburst26.frameCount).toBe(12)
    expect(JSON.stringify(saved)).not.toContain('fake-key')
    setActivePinia(createPinia()); const reopened = useNodeStore(); await reopened.init()
    reopened.updateNodeData('node', { model: 'another-model', prompt: 'changed', inputImages: ['missing-ref'] })
    await reopened.executeNode('node')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(reopened.nodes[0].data).toMatchObject({ status: 'completed', outputImage: 'local-upload:///C:/images/animation.gif', geeknowImageResult: undefined })
    expect(JSON.parse(disk.get('nodeCanvas:default')!).nodes[0].data.geeknowImageResult).toBeUndefined()
    expect(mock.addAsset).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ model: SUNBURST26_MODEL, prompt: '跳跃循环', type: 'image' }))
  })

  it('saves late results to the original project and does not overwrite another canvas', async () => {
    const { disk, fetch, store } = setup(); await store.init(); addNode(store)
    let resolvePost!: (result: Response) => void
    fetch.mockImplementationOnce(() => new Promise(resolve => { resolvePost = resolve }))
    mock.resolveGifs.mockResolvedValue(['data:image/gif;base64,R0lG'])
    const running = store.executeNode('node'); await vi.advanceTimersByTimeAsync(1)
    await store.loadProject('another'); addNode(store)
    resolvePost(new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/animation.png' }] })))
    await running
    expect(store.nodes[0].data.status).toBe('idle')
    expect(store.nodes[0].data.outputImage).toBeUndefined()
    expect(JSON.parse(disk.get('nodeCanvas:default')!).nodes[0].data.geeknowImageResult.sources).toHaveLength(1)
    await store.loadProject('default'); await store.executeNode('node')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(store.nodes[0].data.status).toBe('completed')
  })
})
