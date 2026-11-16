import { afterEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { LuociImageProvider } from '../luoci'
import { findImageTemplate } from '../../imageModelTemplates'
import { useAIStore } from '../../../stores/ai'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
const params = { model: 'seedream-5-5', prompt: '猫', imageSize: '1.5K' as const, aspectRatio: '1:2' }
function setup() {
  const request = vi.fn(async ({ route }: any) => ({ ok: true, data:
    route.endsWith('/quote') ? { estimatedPoints: 0.039 } : route.endsWith('/generations') ? { taskId: 't55' } :
      { task: { status: 'succeeded', settled: true, chargedPoints: 0.039, images: [{ url: '/api/v1/tasks/t55/images/0' }] } } }))
  const upload = vi.fn(async () => ({ ok: true, data: { id: 'ref55' } }))
  const download = vi.fn(async () => ({ ok: true, data: { dataUrl: 'data:image/png;base64,AA==' } }))
  vi.stubGlobal('electronAPI', { luociImage: { request, upload, download }, upload: { read: vi.fn(async () => ({ data: 'AA==' })) } })
  return { request, upload, download }
}

it('adds Seedream 5.5 capabilities and preserves existing and custom models on load', async () => {
  const template = findImageTemplate('seedream-5-5', 'luoci')!
  expect(template).toBeDefined()
  expect(template.capabilities).toMatchObject({ ratios: ['auto', '1:1', '9:16', '16:9', '3:4', '4:3', '2:3', '3:2', '1:2', '2:1', '21:9'], resolutions: ['1K', '1.5K', '2K'], maxImages: 10 })
  const custom = { id: 'my-model', name: '我的模型', capabilities: { ratios: ['1:1'] } }
  const disk = new Map([['aiProviders', JSON.stringify({ migrationVersion: 20, providers: [{ id: 'luoci-image', type: 'image', kind: 'luoci', name: '我的洛辞', apiKey: 'fixture', baseUrl: 'https://luocisheng.cn', models: [{ id: 'seedream-5-pro', name: '旧模型' }, custom] }] })]])
  vi.stubGlobal('electronAPI', { store: { get: async (key: string) => disk.get(key), set: async (key: string, value: string) => disk.set(key, value) } })
  setActivePinia(createPinia()); const store = useAIStore(); await store.init()
  const provider = store.getProviderConfig('luoci-image')!
  expect(provider.models.map(m => m.id)).toEqual(expect.arrayContaining(['seedream-5-5', 'seedream-5-pro', 'my-model']))
  expect(provider.models.find(m => m.id === custom.id)).toEqual(custom)
  expect(provider.apiKey).toBe('fixture')
})

it('uploads original local bytes, quotes identical parameters, saves the task and downloads', async () => {
  vi.useFakeTimers(); const { request, upload, download } = setup()
  const saved: any[] = []
  const result = new LuociImageProvider('fixture').generateImage({ ...params, imageUrls: ['local-upload:///C:/ref.png'], onLuociImageTask: state => { saved.push(structuredClone(state)) } })
  await vi.runAllTimersAsync()
  expect(await result).toEqual({ imageUrls: ['data:image/png;base64,AA=='] })
  expect(upload).toHaveBeenCalledWith(expect.objectContaining({ key: 'fixture', base64: 'AA==', mime: 'image/png', modelId: 'seedream-5-5' }))
  const calls = request.mock.calls.map(([args]) => args)
  expect(calls[0].body).toMatchObject({ modelId: 'seedream-5-5', imageSize: '1.5K', aspectRatio: '1:2', referenceImageIds: ['ref55'] })
  expect(calls[1].body).toEqual(calls[0].body)
  expect(calls[1].body).not.toHaveProperty('image')
  expect(saved[0].requestKey).toBe(calls[1].requestKey)
  expect(saved.at(-1).taskId).toBe('t55')
  expect(download).toHaveBeenCalledWith(expect.objectContaining({ taskId: 't55', url: '/api/v1/tasks/t55/images/0' }))
})

it('reuses the persisted body and idempotency key after an uncertain submission', async () => {
  vi.useFakeTimers(); const { request, upload } = setup()
  const normal = request.getMockImplementation()!
  let saved: any
  request.mockImplementation(async args => args.route.endsWith('/generations') ? { ok: false, error: 'timeout' } as any : normal(args))
  await expect(new LuociImageProvider('fixture').generateImage({ ...params, onLuociImageTask: state => { saved = structuredClone(state) } })).rejects.toThrow('timeout')
  const original = structuredClone(saved)
  request.mockImplementation(normal)
  const result = new LuociImageProvider('fixture').generateImage({ ...params, prompt: 'changed', imageUrls: ['deleted'], luociImageTask: saved })
  await vi.runAllTimersAsync(); await result
  const submits = request.mock.calls.map(([args]) => args).filter(args => args.route.endsWith('/generations'))
  expect(submits).toHaveLength(2)
  expect(submits[1]).toEqual(submits[0])
  expect(submits[1].requestKey).toBe(original.requestKey)
  expect(upload).not.toHaveBeenCalled()
})

it('resumes an existing task without quoting, uploading or submitting again', async () => {
  vi.useFakeTimers(); const { request, upload } = setup()
  const result = new LuociImageProvider('fixture').generateImage({ ...params, prompt: '', luociImageTask: { requestKey: 'original-key', body: { modelId: 'seedream-5-5', prompt: '猫', numImages: 1, aspectRatio: 'auto', imageSize: '2K' }, taskId: 't55' } })
  await vi.runAllTimersAsync(); await result
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0][0].route).toBe('/api/v1/tasks/t55')
  expect(upload).not.toHaveBeenCalled()
})

it.each([{ imageUrls: Array(11).fill('data:image/png;base64,AA==') }, { imageSize: '4K' }, { aspectRatio: '4:5' }, { imageUrls: ['data:image/gif;base64,AA=='] }])('rejects unsupported inputs before uploading or charging: %j', async values => {
  const { request, upload } = setup()
  await expect(new LuociImageProvider('fixture').generateImage({ ...params, ...values } as any)).rejects.toThrow()
  expect(request).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled()
})

it('waits for settlement before downloading a partial result', async () => {
  vi.useFakeTimers(); const { request, download } = setup()
  const normal = request.getMockImplementation()!
  let polls = 0
  request.mockImplementation(args => args.route.includes('/tasks/') && polls++ === 0
    ? Promise.resolve({ ok: true, data: { task: { status: 'partial', settled: false, images: [{ url: '/api/v1/tasks/t55/images/0' }] } } }) as any : normal(args))
  const result = new LuociImageProvider('fixture').generateImage(params)
  await vi.advanceTimersByTimeAsync(1)
  expect(download).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(4000); await result
  expect(download).toHaveBeenCalledTimes(1)
  expect(polls).toBe(2)
})

it('does not submit when quote retrieval fails', async () => {
  const { request } = setup()
  request.mockResolvedValueOnce({ ok: false, error: 'API 积分不足' } as any)
  await expect(new LuociImageProvider('fixture').generateImage(params)).rejects.toThrow('API 积分不足')
  expect(request).toHaveBeenCalledTimes(1)
})

it('validates every reference before uploading any of them', async () => {
  const { request, upload } = setup()
  await expect(new LuociImageProvider('fixture').generateImage({ ...params, imageUrls: ['data:image/png;base64,AA==', 'data:image/gif;base64,AA=='] })).rejects.toThrow('PNG')
  expect(upload).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled()
})
