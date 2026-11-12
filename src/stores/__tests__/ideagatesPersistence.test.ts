import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAIStore } from '../ai'
import { useNodeStore } from '../node'
import { IdeaGatesProvider } from '@/services/providers/ideagates'
const asset = vi.hoisted(() => ({ addAsset: vi.fn() }))
vi.mock('@/stores/asset', () => ({ useAssetStore: () => ({ ...asset, remoteVideoUrl: (url: string) => url }) }))
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const model = 'doubao-seedance-2-5-260628'
function setup() {
  vi.useFakeTimers()
  const existing = { id: 'old', type: 'video', kind: 'seedance', name: 'existing', apiKey: 'existing-key', baseUrl: 'https://example.com', models: [] }
  const disk = new Map<string, string>([['aiProviders', JSON.stringify({ providers: [existing], defaultProviderId: 'old', migrationVersion: 17 })]])
  vi.stubGlobal('electronAPI', { store: { get: async (key: string) => disk.get(key) ?? null, set: async (key: string, value: string) => { disk.set(key, value) }, delete: vi.fn() } })
  setActivePinia(createPinia())
  vi.spyOn(IdeaGatesProvider.prototype, 'prepareTask').mockImplementation(async params => params)
  return { disk, ai: useAIStore(), store: useNodeStore() }
}
describe('IDEA Gates persistent integration', () => {
  it('adds exactly two separate groups without copying keys or replacing the default', async () => {
    const { ai, disk } = setup(); await ai.init()
    const groups = ai.providers.filter(p => p.kind?.startsWith('ideagates'))
    expect(groups).toHaveLength(2)
    expect(groups.every(p => p.apiKey === '' && p.models.length === 1 && p.models[0].capabilities.resolutions?.join() === '720p')).toBe(true)
    expect(ai.defaultProviderId).toBe('old')
    expect(ai.getProviderConfig('old')?.apiKey).toBe('existing-key')
    for (const group of groups) expect(ai.getProvider(group.id)).toBeInstanceOf(IdeaGatesProvider)
    await vi.advanceTimersByTimeAsync(250)
    expect(disk.get('aiProviders')).toContain('ideagates-overseas')
    setActivePinia(createPinia()); const reloaded = useAIStore(); await reloaded.init()
    expect(reloaded.providers.filter(p => p.kind?.startsWith('ideagates'))).toHaveLength(2)
  })
  it('preserves submitted IDs across restart and never creates again on resume', async () => {
    const { ai, store, disk } = setup(); await ai.init(); await store.init()
    const group = ai.providers.find(p => p.kind === 'ideagates')!
    ai.updateProvider(group.id, { apiKey: 'not-in-node-data' })
    vi.spyOn(IdeaGatesProvider.prototype, 'identity').mockResolvedValue('fingerprint')
    const create = vi.spyOn(IdeaGatesProvider.prototype, 'createTask').mockResolvedValue({ taskId: 'task_saved', keyFingerprint: 'fingerprint', request: {} })
    vi.spyOn(IdeaGatesProvider.prototype, 'getTaskStatus').mockResolvedValue({ status: 'completed', videoUrl: 'https://example.com/final.mp4', raw: { status: 'succeeded', 'doubao-id': 'cgt-original', usage: { total_tokens: 123 } } })
    vi.spyOn(IdeaGatesProvider.prototype, 'download').mockResolvedValue('local-upload:///C:/test-final.mp4')
    store.addNode({ id: 'idea-persist', type: 'ai-video', position: { x: 0, y: 0 }, data: { label: '视频', status: 'idle', providerId: group.id, model, prompt: '海浪移动', duration: 5 } })
    await store.executeNode('idea-persist')
    expect(JSON.parse(disk.get('nodeCanvas:default')!).nodes[0].data.ideagatesTask.taskId).toBe('task_saved')
    expect(disk.get('nodeCanvas:default')).not.toContain('not-in-node-data')
    await vi.advanceTimersByTimeAsync(250)
    await store.loadProject('other')
    setActivePinia(createPinia()); await useAIStore().init()
    const reopened = useNodeStore(); await reopened.init(); await reopened.loadProject('default')
    expect(reopened.nodes[0].data.taskId).toBe('task_saved')
    await reopened.executeNode('idea-persist'); await vi.advanceTimersByTimeAsync(10000)
    expect(create).toHaveBeenCalledTimes(1)
    expect(reopened.nodes[0].data.ideagatesTask).toBeUndefined()
    expect(reopened.nodes[0].data.ideagatesResult['doubao-id']).toBe('cgt-original')
    expect(asset.addAsset).toHaveBeenCalled()
    expect(asset.addAsset).toHaveBeenLastCalledWith(expect.objectContaining({ sourceUrl: 'https://example.com/final.mp4', url: 'local-upload:///C:/test-final.mp4' }))
  })
  it('blocks paid submission on disk write failure', async () => {
    const { ai, store } = setup(); await ai.init(); await store.init()
    const group = ai.providers.find(p => p.kind === 'ideagates')!
    ai.updateProvider(group.id, { apiKey: 'test-key' })
    vi.spyOn(IdeaGatesProvider.prototype, 'identity').mockResolvedValue('fingerprint')
    const create = vi.spyOn(IdeaGatesProvider.prototype, 'createTask')
    store.addNode({ id: 'disk-fail', type: 'ai-video', position: { x: 0, y: 0 }, data: { label: '视频', status: 'idle', providerId: group.id, model, prompt: '海浪移动', duration: 5 } })
    const storage = window.electronAPI!.store!
    storage.set = vi.fn().mockRejectedValue(new Error('disk full'))
    await store.executeNode('disk-fail')
    expect(create).not.toHaveBeenCalled()
    expect(store.nodes[0].data.error).toContain('写入失败')
  })
  it('saves a late ID after switching A to B and back to A', async () => {
    const { ai, store, disk } = setup(); await ai.init(); await store.init()
    const group = ai.providers.find(p => p.kind === 'ideagates')!
    ai.updateProvider(group.id, { apiKey: 'test-key' })
    vi.spyOn(IdeaGatesProvider.prototype, 'identity').mockResolvedValue('fingerprint')
    let resolve!: (value: any) => void
    const create = vi.spyOn(IdeaGatesProvider.prototype, 'createTask').mockImplementation(() => new Promise(r => { resolve = r }))
    store.addNode({ id: 'late-return', type: 'ai-video', position: { x: 0, y: 0 }, data: { label: '视频', status: 'idle', providerId: group.id, model, prompt: '海浪移动', duration: 5 } })
    const submitting = store.executeNode('late-return')
    await vi.advanceTimersByTimeAsync(0)
    await store.loadProject('other'); await store.loadProject('default')
    resolve({ taskId: 'task_late_return', keyFingerprint: 'fingerprint' }); await submitting
    expect(create).toHaveBeenCalledTimes(1)
    expect(store.nodes[0].data.ideagatesTask.taskId).toBe('task_late_return')
    expect(JSON.parse(disk.get('nodeCanvas:default')!).nodes[0].data.ideagatesTask.taskId).toBe('task_late_return')
  })
})
