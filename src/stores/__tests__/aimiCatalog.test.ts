import { createPinia, setActivePinia } from 'pinia'
import { expect, it, vi } from 'vitest'
import { useAIStore } from '../ai'
import { AIMI_MODELS } from '../../services/providers/aimi'

it('replaces both saved AIMI catalogs and persists their own credentials and prices', async () => {
  const cards = ['first', 'second'].map(id => ({
    id, kind: 'aimi', type: 'video', name: id, baseUrl: 'https://aimiapi.com', apiKey: id + '-fixture',
    models: [{ id: 'JL-seedance-2.5-480p' }, { id: 'sd2.5-n-720p' }],
  }))
  const disk = new Map([['aiProviders', JSON.stringify({ providers: cards, migrationVersion: 20, defaultProviderId: 'second' })]])
  vi.stubGlobal('electronAPI', { store: {
    get: async (key: string) => disk.get(key),
    set: async (key: string, value: string) => disk.set(key, value),
  } })
  vi.useFakeTimers()
  try {
    for (let load = 0; load < 2; load++) {
      setActivePinia(createPinia())
      const store = useAIStore()
      await store.init()
      for (const card of cards) {
        expect(store.getProviderConfig(card.id)).toMatchObject({ ...card, models: AIMI_MODELS })
      }
      expect(store.defaultProviderId).toBe('second')
      await vi.advanceTimersByTimeAsync(300)
      expect(JSON.parse(disk.get('aiProviders')!).providers.filter((p: { kind: string }) => p.kind === 'aimi')
        .map((p: { models: unknown[] }) => p.models)).toEqual([AIMI_MODELS, AIMI_MODELS])
    }
  } finally {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  }
})
