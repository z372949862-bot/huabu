import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { useAIStore } from '../ai'
import { PiapiImageProvider, PIAPI_IMAGE_MODEL } from '@/services/providers/piapiImage'
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })
it('adds the Seedream image provider once and reuses only the official PiAPI key', async () => {
  vi.useFakeTimers()
  const image = { id: 'gpt', type: 'image', kind: 'geeknow', name: 'GPT', baseUrl: 'https://www.geeknow.top', apiKey: 'gpt-test-key', models: [{ id: 'gpt-image-2' }] }
  const video = { id: 'pi-video', type: 'video', kind: 'piapi', name: 'PiAPI', baseUrl: 'https://api.piapi.ai', apiKey: 'piapi-test-key', models: [] }
  const disk = new Map([['aiProviders', JSON.stringify({ providers: [image, video], migrationVersion: 16, defaultProviderId: 'pi-video', defaultImageProviderId: 'gpt' })]])
  vi.stubGlobal('electronAPI', { store: { get: async (key: string) => disk.get(key), set: async (key: string, value: string) => { disk.set(key, value) } } })
  setActivePinia(createPinia()); const store = useAIStore(); await store.init()
  const added = store.imageProviders.filter(provider => provider.kind === 'piapi')
  expect(added).toHaveLength(1); expect(added[0].apiKey).toBe('piapi-test-key')
  expect(added[0].models.map(model => model.id)).toEqual([PIAPI_IMAGE_MODEL])
  expect(added[0].models[0].capabilities).toMatchObject({ resolutions: ['1K', '2K'], maxImages: 10 })
  expect(added[0].models[0].capabilities.ratios).toHaveLength(10)
  expect(store.getImageProvider(added[0].id)).toBeInstanceOf(PiapiImageProvider)
  expect(store.getProviderConfig('gpt')).toMatchObject(image); expect(store.defaultImageProviderId).toBe('gpt')
  await vi.advanceTimersByTimeAsync(300)
  setActivePinia(createPinia()); const reopened = useAIStore(); await reopened.init()
  expect(reopened.imageProviders.filter(provider => provider.kind === 'piapi')).toHaveLength(1)
  expect(reopened.defaultImageProviderId).toBe('gpt')
})
