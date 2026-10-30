import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNodeStore } from '../node'
import { PiapiProvider, PIAPI_MODEL } from '@/services/providers/piapi'
const mock = vi.hoisted(() => ({ provider: null as any, addAsset: vi.fn() }))
vi.mock('@/stores/ai', () => ({ useAIStore: () => ({ defaultProviderId: 'piapi', getProvider: () => mock.provider, getProviderConfig: () => ({ id: 'piapi', kind: 'piapi', name: 'PiAPI', apiKey: 'fake-key', models: [{ id: 'seedance-2.5-less-restriction' }] }) }) }))
vi.mock('@/stores/asset', () => ({ useAssetStore: () => ({ addAsset: mock.addAsset }) }))
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe('PiAPI persisted task recovery', () => {
  it('keeps task and asset bindings across project reload and resumes only polling', async () => {
    vi.useFakeTimers()
    const disk = new Map<string, string>()
    vi.stubGlobal('electronAPI', { store: { get: vi.fn(async key => disk.get(key) ?? null), set: vi.fn(async (key, value) => { disk.set(key, value) }), delete: vi.fn() } })
    mock.provider = new PiapiProvider('fake-key')
    const create = vi.spyOn(mock.provider, 'createTask').mockResolvedValue({ taskId: 'task-persisted' })
    const poll = vi.spyOn(mock.provider, 'getTaskStatus').mockResolvedValue({ status: 'completed', videoUrl: 'https://example.com/result.mp4' })
    vi.spyOn(mock.provider, 'download').mockResolvedValue('local-upload:///result.mp4')
    setActivePinia(createPinia())
    const original = useNodeStore(); await original.init()
    original.addNode({ id: 'piapi-node', type: 'ai-video', position: { x: 0, y: 0 }, data: { label: 'video', status: 'idle', providerId: 'piapi', model: PIAPI_MODEL, prompt: '向前走', piapiPrivateReferences: { 'local-upload:///actor.png': { providerId: 'piapi', mode: 'private', assetId: 'asset-actor' } } } })
    const running = original.executeNode('piapi-node')
    await vi.advanceTimersByTimeAsync(1)
    const saved = JSON.parse(disk.get('nodeCanvas:default')!)
    expect(saved.nodes[0].data.piapiTask.taskId).toBe('task-persisted')
    expect(JSON.stringify(saved)).not.toContain('fake-key')
    await original.loadProject('other'); await running
    await original.loadProject('default')
    setActivePinia(createPinia())
    const reopened = useNodeStore(); await reopened.init()
    expect(reopened.nodes[0].data).toMatchObject({ status: 'idle', taskId: 'task-persisted', piapiPrivateReferences: saved.nodes[0].data.piapiPrivateReferences })
    const resumed = reopened.executeNode('piapi-node')
    await vi.advanceTimersByTimeAsync(10001); await resumed
    expect(create).toHaveBeenCalledTimes(1); expect(poll).toHaveBeenCalledTimes(1)
    expect(mock.addAsset).toHaveBeenCalledWith(expect.objectContaining({ type: 'video', projectId: 'default', prompt: '向前走', url: 'local-upload:///result.mp4' }))
    expect(JSON.parse(disk.get('nodeCanvas:default')!).nodes[0].data.piapiTask).toBeUndefined()
    vi.clearAllTimers()
  })
})
