import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNodeStore } from '../node'

const mocked = vi.hoisted(() => ({
  provider: { createTask: vi.fn(), getTaskStatus: vi.fn() },
  addAsset: vi.fn(),
}))
vi.mock('@/stores/ai', () => ({
  useAIStore: () => ({
    defaultProviderId: 'dmx',
    getProvider: () => mocked.provider,
    getProviderConfig: () => ({ id: 'dmx', kind: 'dmxapi', name: 'DMXAPI', apiKey: 'fake-key' }),
  }),
}))
vi.mock('@/stores/asset', () => ({ useAssetStore: () => ({ addAsset: mocked.addAsset }) }))

describe('DMXAPI persisted task recovery', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('preserves the task across project switching and an application restart, then resumes without a POST create', async () => {
    vi.useFakeTimers()
    const disk = new Map<string, string>()
    vi.stubGlobal('electronAPI', { store: {
      get: vi.fn(async key => disk.get(key) ?? null),
      set: vi.fn(async (key, value) => { disk.set(key, value) }),
      delete: vi.fn(async key => { disk.delete(key) }),
    } })
    mocked.provider.createTask.mockResolvedValue({ taskId: 'task_persisted' })
    mocked.provider.getTaskStatus.mockResolvedValue({ status: 'completed', videoUrl: 'https://example.com/final.mp4' })
    setActivePinia(createPinia())
    const original = useNodeStore()
    await original.init()
    original.addNode({ id: 'dmx-node', type: 'ai-video', position: { x: 0, y: 0 }, data: {
      label: 'video', status: 'idle', providerId: 'dmx', model: 'doubao-seedance-2-5-260628', prompt: '向前走', duration: 5,
    } })
    await original.executeNode('dmx-node')
    const saved = JSON.parse(disk.get('nodeCanvas:default')!)
    expect(saved.nodes[0].data.dmxTask.taskId).toBe('task_persisted')
    expect(JSON.stringify(saved)).not.toContain('fake-key')
    await original.loadProject('other')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(mocked.provider.getTaskStatus).not.toHaveBeenCalled()
    await original.loadProject('default')
    // A fresh store simulates restoring only the persisted project data.
    setActivePinia(createPinia())
    const reopened = useNodeStore()
    await reopened.init()
    expect(reopened.nodes[0].data).toMatchObject({ status: 'idle', taskId: 'task_persisted' })
    await reopened.executeNode('dmx-node')
    await vi.advanceTimersByTimeAsync(6000)
    expect(mocked.provider.createTask).toHaveBeenCalledTimes(1)
    expect(mocked.provider.getTaskStatus).toHaveBeenCalledTimes(1)
    expect(mocked.addAsset).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      projectId: 'default', prompt: '向前走', type: 'video', url: 'https://example.com/final.mp4',
    }))
    expect(reopened.nodes[0].data.dmxTask).toBeUndefined()
    expect(JSON.parse(disk.get('nodeCanvas:default')!).nodes[0].data.dmxTask).toBeUndefined()
    vi.clearAllTimers()
  })
})
