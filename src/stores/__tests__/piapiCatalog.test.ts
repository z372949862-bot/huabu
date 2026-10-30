import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { useAIStore } from '../ai'
import { PiapiProvider, PIAPI_MODEL } from '../../services/providers/piapi'
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })
it('adds PiAPI once while preserving existing defaults and credentials across reloads', async () => {
  vi.useFakeTimers()
  const original = { id: 'existing', type: 'video', kind: 'aimi', name: 'AIMI', baseUrl: 'https://aimiapi.com', apiKey: 'existing-test-key', models: [] }
  const disk = new Map([['aiProviders', JSON.stringify({ providers: [original], migrationVersion: 15, defaultProviderId: 'existing' })]])
  vi.stubGlobal('electronAPI', { store: { get: async (key: string) => disk.get(key), set: async (key: string, value: string) => { disk.set(key, value) } } })
  setActivePinia(createPinia()); const store = useAIStore(); await store.init()
  const added = store.videoProviders.filter(provider => provider.kind === 'piapi')
  expect(added).toHaveLength(1)
  expect(added[0].models.map(model => model.id)).toEqual([PIAPI_MODEL])
  expect(added[0].apiKey).toBe('')
  expect(added[0].baseUrl).toBe('https://api.piapi.ai')
  expect(store.getProvider(added[0].id)).toBeInstanceOf(PiapiProvider)
  expect(store.defaultProviderId).toBe('existing')
  expect(store.getProviderConfig('existing')?.apiKey).toBe('existing-test-key')
  await vi.advanceTimersByTimeAsync(300)
  setActivePinia(createPinia()); const reopened = useAIStore(); await reopened.init()
  expect(reopened.videoProviders.filter(provider => provider.kind === 'piapi')).toHaveLength(1)
  expect(reopened.defaultProviderId).toBe('existing')
})
