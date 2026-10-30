import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNodeStore } from '../node'
const mocked = vi.hoisted(() => ({ provider: { createTask: vi.fn(), getTaskStatus: vi.fn() }, addAsset: vi.fn() }))
vi.mock('@/stores/ai', () => ({ useAIStore: () => ({
  defaultProviderId: 'aiide', getProvider: () => mocked.provider,
  getProviderConfig: () => ({ id: 'aiide', kind: 'aiide', name: 'AIIDE', apiKey: 'not-to-persist' }),
}) }))
vi.mock('@/stores/asset', () => ({ useAssetStore: () => ({ addAsset: mocked.addAsset }) }))

describe('AIIDE durable node tasks', () => {
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks() })
  function setup() {
    vi.useFakeTimers()
    const disk = new Map<string, string>()
    vi.stubGlobal('electronAPI', { store: {
      get: vi.fn(async key => disk.get(key) ?? null),
      set: vi.fn(async (key, value) => { disk.set(key, value) }), delete: vi.fn(),
    } })
    setActivePinia(createPinia())
    return { disk, store: useNodeStore() }
  }
  const node = () => ({ id: 'aiide-node', type: 'ai-video', position: { x: 0, y: 0 }, data: {
    label: '视频', status: 'idle', providerId: 'aiide', model: 'dreamina-seedance-2-5-hc', prompt: '向前走', duration: 8,
  } })
  it('restores after restarting, queries the existing task and clears it after success', async () => {
    const { disk, store } = setup()
    await store.init()
    store.addNode(node())
    mocked.provider.createTask.mockResolvedValue({ taskId: 'saved-task' })
    mocked.provider.getTaskStatus.mockResolvedValue({ status: 'completed', videoUrl: 'https://example.com/final.mp4' })
    await store.executeNode('aiide-node')
    expect(JSON.parse(disk.get('nodeCanvas:default')!).nodes[0].data.aiideTask.taskId).toBe('saved-task')
    expect(disk.get('nodeCanvas:default')).not.toContain('not-to-persist')
    await store.loadProject('other')
    setActivePinia(createPinia())
    const reopened = useNodeStore()
    await reopened.init()
    await reopened.loadProject('default')
    expect(reopened.nodes[0].data).toMatchObject({ status: 'idle', taskId: 'saved-task' })
    await reopened.executeNode('aiide-node')
    await vi.advanceTimersByTimeAsync(6000)
    expect(mocked.provider.createTask).toHaveBeenCalledTimes(1)
    expect(mocked.addAsset).toHaveBeenCalledTimes(1)
    expect(JSON.parse(disk.get('nodeCanvas:default')!).nodes[0].data.aiideTask).toBeUndefined()
  })
  it('saves a late submission ID into the original project after switching away', async () => {
    const { disk, store } = setup()
    await store.init()
    store.addNode(node())
    let resolve!: (value: any) => void
    mocked.provider.createTask.mockImplementation(() => new Promise(r => { resolve = r }))
    const submit = store.executeNode('aiide-node')
    await store.loadProject('other')
    resolve({ taskId: 'late-task' })
    await submit
    expect(store.nodes).toHaveLength(0)
    expect(JSON.parse(disk.get('nodeCanvas:default')!).nodes[0].data.aiideTask.taskId).toBe('late-task')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(mocked.provider.getTaskStatus).not.toHaveBeenCalled()
    await store.loadProject('default')
    expect(store.nodes[0].data.taskId).toBe('late-task')
  })
})
