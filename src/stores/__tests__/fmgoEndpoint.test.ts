import { createRequire } from 'node:module'
import { createPinia, setActivePinia } from 'pinia'
import { expect, it, vi } from 'vitest'
import type { FmgoProvider } from '../../services/providers/fmgo'
import { useAIStore } from '../ai'

const register = createRequire(import.meta.url)('../../../electron/fmgo.cjs')
const origin = 'https://api.feimiaoapi.com'

it('moves saved FMGO settings and sends create and polling requests to the new host', async () => {
  const old = 'https://api.fmgo.top'
  const privateModel = { id: 'my-model', name: '自定义' }
  const oldModel = { id: 'feimiao-v2.5-720p-30s', name: '我的旧模型' }
  const card = { id: 'video', type: 'video', kind: 'fmgo', name: 'My FMGO', apiKey: 'fixture-key', baseUrl: old + '/v1/', models: [privateModel, oldModel] }
  const custom = { ...card, id: 'custom', baseUrl: 'https://custom.example', models: [] }
  const other = { ...card, id: 'text', type: 'text', kind: 'openaichat', baseUrl: old }
  let saved = JSON.stringify({ providers: [card, custom, other], migrationVersion: 21, defaultProviderId: card.id })
  const handlers = new Map()
  const netFetch = vi.fn(async (_url: string, options: RequestInit) => ({
    ok: true, json: async () => options.method === 'POST' ? { id: 'test-video' } : { status: 'processing' },
  }))
  register({ ipcMain: { handle: (name: string, fn: Function) => handlers.set(name, fn) }, net: { fetch: netFetch } })
  vi.stubGlobal('electronAPI', {
    store: { get: async () => saved, set: async (_key: string, value: string) => { saved = value } },
    fmgo: { request: (args: unknown) => handlers.get('fmgo:request')(null, args) },
  })
  vi.useFakeTimers()
  try {
    setActivePinia(createPinia())
    const store = useAIStore()
    await store.init()
    const fresh = store.addProvider({ type: 'video', kind: 'fmgo' })
    expect(store.getProviderConfig(fresh)?.baseUrl).toBe(origin)
    await vi.advanceTimersByTimeAsync(250)
    expect(JSON.parse(saved)).toMatchObject({ defaultProviderId: card.id, providers: expect.arrayContaining([
      expect.objectContaining({ ...card, baseUrl: origin, models: [privateModel, expect.objectContaining(oldModel), expect.objectContaining({ id: 's2.5-pro' }), expect.objectContaining({ id: 's2.5-max' })] }),
      expect.objectContaining({ ...custom, models: expect.arrayContaining([expect.objectContaining({ id: 's2.5-pro' })]) }), other,
    ]) })

    const provider = store.getProvider(card.id) as FmgoProvider
    await expect(provider.createTask({ model: 'feimiao-v2.5-720p-30s', prompt: 'test' })).resolves.toEqual({ taskId: 'test-video' })
    await expect(provider.getTaskStatus('test-video')).resolves.toMatchObject({ status: 'processing' })
    expect(netFetch.mock.calls.map(([url, options]) => [url, options.method])).toEqual([
      [origin + '/v1/videos', 'POST'], [origin + '/v1/videos/test-video', 'GET'],
    ])
  } finally {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  }
})
