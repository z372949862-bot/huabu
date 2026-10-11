import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNodeStore } from '../node'

vi.mock('@/stores/ai', () => ({ useAIStore: () => ({}) }))
vi.mock('@/stores/asset', () => ({ useAssetStore: () => ({ assets: [] }) }))

describe('canvas node naming', () => {
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

  const setup = () => {
    vi.useFakeTimers()
    const disk = new Map<string, string>()
    vi.stubGlobal('electronAPI', { store: {
      get: async (key: string) => disk.get(key) ?? null,
      set: async (key: string, value: string) => { disk.set(key, value) },
      delete: async (key: string) => { disk.delete(key) },
    } })
    setActivePinia(createPinia())
    return { disk, store: useNodeStore() }
  }
  const node = (id: string, type = 'ai-image') => ({
    id, type, position: { x: 0, y: 0 }, data: { label: '旧名称', status: 'idle' },
  })

  it('numbers each type independently, renumbers copies and retains the high-water mark after deletion and restart', async () => {
    const { store } = setup()
    await store.init()
    store.addNode(node('image1'))
    store.addNode(node('video1', 'ai-video'))
    store.addNode({ ...node('image2'), data: { ...store.nodes[0].data } })
    expect(store.nodes.map(n => n.data.label)).toEqual(['图片 01', '视频 01', '图片 02'])
    store.removeNode('image2')
    await store.loadProject('other')
    setActivePinia(createPinia())
    const reopened = useNodeStore()
    await reopened.init()
    await reopened.loadProject('default')
    reopened.addNode(node('image3'))
    expect(reopened.nodes.at(-1)?.data.label).toBe('图片 03')
    await reopened.createProject('new')
    reopened.addNode(node('new-image'))
    expect(reopened.nodes[0].data.label).toBe('图片 01')
  })

  it('migrates legacy nodes in saved order and preserves imported file names', async () => {
    const { disk, store } = setup()
    const asset = { ...node('asset', 'asset-ref'), data: { label: '海边日落.png', assetName: '海边日落.png' } }
    disk.set('nodeCanvas:default', JSON.stringify({ nodes: [node('a'), asset, node('b', 'ai-video'), node('c')], edges: [] }))
    await store.init()
    expect(store.nodes.map(n => n.data.label)).toEqual(['图片 01', '海边日落.png', '视频 01', '图片 02'])
    store.addNode({ ...asset, id: 'asset-copy' })
    store.addNode(node('d'))
    expect(store.nodes.at(-2)?.data.assetName).toBe('海边日落.png')
    expect(store.nodes.at(-1)?.data.label).toBe('图片 03')
  })
})
