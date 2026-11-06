import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { useAIStore } from '../ai'
import { Qiling1080JS, Qiling1080GF } from '../../services/qiling1080'
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })
it('adds both 1080P models to existing Qiling configurations without losing custom entries or credentials', async () => {
  vi.useFakeTimers()
  const original = { id: 'existing', type: 'video', kind: 'qiling', name: '器灵', baseUrl: 'https://api.qilingze.com', apiKey: 'offline-fixture', models: [{ id: 'custom-model', name: 'Custom', capabilities: {} }] }
  const disk = new Map([['aiProviders', JSON.stringify({ providers: [original], migrationVersion: 17, defaultProviderId: 'existing' })]])
  vi.stubGlobal('electronAPI', { store: { get: async (key: string) => disk.get(key), set: async (key: string, value: string) => { disk.set(key, value) } } })
  setActivePinia(createPinia()); const store = useAIStore(); await store.init()
  const ids = store.getProviderConfig('existing')!.models.map(model => model.id)
  for (const id of [Qiling1080JS, Qiling1080GF, 'custom-model']) expect(ids.filter(value => value === id)).toHaveLength(1)
  expect(store.defaultProviderId).toBe('existing')
  expect(store.getProviderConfig('existing')!.apiKey).toBe('offline-fixture')
  await vi.advanceTimersByTimeAsync(300)
  setActivePinia(createPinia()); const reopened = useAIStore(); await reopened.init()
  expect(reopened.getProviderConfig('existing')!.models.map(model => model.id)).toEqual(ids)
})
