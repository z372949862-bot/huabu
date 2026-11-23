import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { useAIStore } from '../ai'
const allowed = ['SD2.5-满血-GF-480P', 'SD2.5-满血-GF-720P']
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })
it('replaces only the Qiling catalog, preserves accounts/defaults, and adds FlyAPI only once', async () => {
  vi.useFakeTimers()
  const old = { id: 'existing', type: 'video', kind: 'qiling', name: '我的器灵', baseUrl: 'https://api.qilingze.com', apiKey: 'fixture', models: ['custom-model', 'SD2.5-满血-GF-1080P', 'SD2.5-满血-CB-720P', allowed[1]].map(id => ({ id, capabilities: {} })) }
  const other = { ...old, id: 'other', kind: 'chuhaiying' }
  const disk = new Map([['aiProviders', JSON.stringify({ providers: [old, other], migrationVersion: 23, defaultProviderId: 'existing' })]])
  vi.stubGlobal('electronAPI', { store: { get: async (key: string) => disk.get(key), set: async (key: string, value: string) => { disk.set(key, value) } } })
  for (let n = 0; n < 2; n++) {
    setActivePinia(createPinia()); const store = useAIStore(); await store.init()
    store.addModel('existing', 'SD2.5-满血-CB-720P')
    expect(store.getProviderConfig('existing')!.models.map(m => m.id)).toEqual(allowed)
    expect(store.getProviderConfig('existing')).toMatchObject({ name: old.name, baseUrl: old.baseUrl, apiKey: old.apiKey })
    expect(store.defaultProviderId).toBe('existing'); expect(store.getProviderConfig('other')?.models).toEqual(other.models)
    const fly = store.videoProviders.filter(p => p.kind === 'flyapi'); expect(fly).toHaveLength(1)
    expect(fly[0]).toMatchObject({ baseUrl: 'https://flyapi.vip', apiKey: '', models: [{ id: 'seedance2.5-D' }] })
    await vi.advanceTimersByTimeAsync(300)
  }
})
