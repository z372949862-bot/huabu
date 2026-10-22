import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { useAIStore } from '../ai'
import { LuociImageProvider } from '../../services/providers/luoci'

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('migrates existing image catalogs without changing credentials, custom GPTs or other provider types', async () => {
  vi.useFakeTimers()
  const model = (id: string) => ({ id, capabilities: { ratios: ['1:1'] } })
  const image = { id: 'images', type: 'image', kind: 'geeknow', name: 'My provider', apiKey: 'test-only-key', baseUrl: 'https://custom.example', models: [model('gemini-old'), model('gpt-custom'), model('gpt-image-2')] }
  const text = { ...image, id: 'text', type: 'text', kind: 'openaichat', models: [model('gemini-chat')] }
  const video = { ...image, id: 'video', type: 'video', kind: 'seedance', models: [model('video-custom')] }
  const disk = new Map([['aiProviders', JSON.stringify({ providers: [image, text, video], migrationVersion: 11, defaultImageProviderId: 'images' })]])
  vi.stubGlobal('electronAPI', { store: { get: async (k: string) => disk.get(k), set: async (k: string, v: string) => { disk.set(k, v) } } })
  setActivePinia(createPinia())
  const store = useAIStore()
  await store.init()
  const migrated = store.getProviderConfig('images')!
  expect(migrated.models.map(m => m.id)).toEqual(['gpt-image-2', 'gpt-image-2-pro', 'gpt-image-2.5-sunburst', 'gpt-image-2-vip', 'gpt-custom'])
  expect(migrated.apiKey).toBe(image.apiKey)
  expect(migrated.baseUrl).toBe(image.baseUrl)
  expect(store.defaultImageProviderId).toBe('images')
  expect(store.getProviderConfig('text')!.models).toEqual(text.models)
  expect(store.getProviderConfig('video')!.models).toEqual(video.models)
  const ch = store.addProvider({ name: 'CH', type: 'image', kind: 'chuhaiying' })
  expect(store.getProviderConfig(ch)!.models.map(m => m.id)).toEqual(['gpt-image-2-2k', 'gpt-image-2-4k'])
  const luoci = store.addProvider({ name: '洛辞', type: 'image', kind: 'luoci' })
  expect(store.getProviderConfig(luoci)!.baseUrl).toBe('https://luocisheng.cn')
  expect(store.getProviderConfig(luoci)!.models.map(m => m.id)).toEqual(['seedream-5-pro'])
  expect(store.getImageProvider(luoci)).toBeInstanceOf(LuociImageProvider)
  await vi.advanceTimersByTimeAsync(250)
  setActivePinia(createPinia())
  const reopened = useAIStore()
  await reopened.init()
  expect(reopened.getProviderConfig('images')!.models).toEqual(migrated.models)
})
