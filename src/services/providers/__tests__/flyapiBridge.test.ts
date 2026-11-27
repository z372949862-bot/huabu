// @vitest-environment node
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
const register = createRequire(import.meta.url)('../../../../electron/flyapi.cjs')

it('sends D model unchanged, blocks ordinary model creation, and still polls existing tasks', async () => {
  const handlers = new Map<string, Function>()
  const api = vi.fn(async () => Response.json({ id: 'task_old', status: 'queued' }))
  register({ ipcMain: { handle: (key: string, fn: Function) => handlers.set(key, fn) },
    fetch: api, app: { getPath: () => tmpdir() } })
  const run = (args: object) => handlers.get('flyapi:request')!(null, { apiKey: 'fixture', ...args })
  const body = { model: 'seedance2.5-D', prompt: 'test', duration: 4, reference_videos: ['assetId://asset_video'] }
  expect((await run({ path: '/v1/videos', body })).ok).toBe(true)
  expect(api).toHaveBeenCalledWith('https://flyapi.vip/v1/videos', expect.objectContaining({ method: 'POST', body: JSON.stringify(body) }))
  expect((await run({ path: '/v1/videos', body: { ...body, model: 'seedance2.5' } })).ok).toBe(false)
  expect(api).toHaveBeenCalledTimes(1)
  expect((await run({ path: '/v1/videos/task_old' })).ok).toBe(true)
  expect(api).toHaveBeenLastCalledWith('https://flyapi.vip/v1/videos/task_old', expect.objectContaining({ method: 'GET' }))
})

it('forwards a discovered Magi-2 OpenAI video model with resolution, duration and multimodal references', async () => {
  const handlers = new Map<string, Function>()
  const api = vi.fn(async () => Response.json({ id: 'task_magi', status: 'queued' }))
  register({ ipcMain: { handle: (key: string, fn: Function) => handlers.set(key, fn) },
    fetch: api, app: { getPath: () => tmpdir() } })
  const body = { model: 'magi-2-vip', prompt: 'test', duration: 30, resolution: '1080p', aspect_ratio: '16:9',
    reference_images: ['assetId://asset_image'], reference_videos: ['assetId://asset_video'], reference_audios: ['assetId://asset_audio'] }
  const result = await handlers.get('flyapi:request')!(null, { apiKey: 'fixture', path: '/v1/videos', catalog: 'magi2', body })
  expect(result.ok).toBe(true)
  expect(api).toHaveBeenCalledWith('https://flyapi.vip/v1/videos', expect.objectContaining({
    method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer fixture', 'Content-Type': 'application/json' }), body: JSON.stringify(body),
  }))
})

it('uses separate upload and authenticated FlyAPI routes, and streams the protected video once per account/task', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'flyapi-bridge-'))
  const handlers = new Map<string, Function>(), key = 'fixture-key'
  const stage = vi.fn(async (_url: string, _opts: RequestInit) => Response.json({ url: 'https://media.example/clip.mp4' }))
  const api = vi.fn(async (url: string, opts: RequestInit) => {
    const path = new URL(url).pathname
    expect(new URL(url).origin).toBe('https://flyapi.vip')
    expect(new Headers(opts.headers).get('Authorization')).toBe('Bearer ' + key)
    if (path.endsWith('/content')) return new Response(new Uint8Array([0, 0, 0, 16, 102, 116, 121, 112]), { headers: { 'Content-Type': 'video/mp4' } })
    return Response.json({ assetId: 'asset_test', status: 'ACTIVE' })
  })
  const prepareVideo = vi.fn(async (dataUrl: string) => dataUrl)
  const fetch = (url: string, opts: RequestInit) => new URL(url).origin === 'https://flyapi.vip' ? api(url, opts) : stage(url, opts)
  register({ ipcMain: { handle: (k: string, cb: Function) => handlers.set(k, cb) }, fetch, app: { getPath: () => profile }, prepareVideo })
  const run = (handler: string, data: unknown) => handlers.get('flyapi:' + handler)!(null, data)
  try {
    const staged = await run('upload', { dataUrl: 'data:video/mp4;base64,AAAAEGZ0eXA=', apiKey: key })
    expect(staged.data.url).toBe('https://media.example/clip.mp4')
    expect(prepareVideo).toHaveBeenCalledExactlyOnceWith('data:video/mp4;base64,AAAAEGZ0eXA=')
    expect(prepareVideo.mock.invocationCallOrder[0]).toBeLessThan(stage.mock.invocationCallOrder[0])
    const [stagingUrl, opts] = stage.mock.calls[0]
    expect(stagingUrl).toBe('https://imageproxy.zhongzhuan.chat/api/upload')
    expect(new Headers(opts.headers).has('Authorization')).toBe(false)
    expect((opts.body as FormData).get('file')).toBeInstanceOf(Blob)
    const body = { assetType: 'Video', url: staged.data.url }
    await run('request', { apiKey: key, path: '/kyyReactApiServer/asset/seedance2/assetUpload', body })
    expect(api.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify(body), redirect: 'error' })
    const a = await run('download', { apiKey: key, taskId: 'task_test' }), b = await run('download', { apiKey: key, taskId: 'task_test' })
    expect(a.data.path).toBe(b.data.path); expect((await readFile(a.data.path)).length).toBe(8)
    expect(api.mock.calls.map(c => c[0])).toEqual(['https://flyapi.vip/kyyReactApiServer/asset/seedance2/assetUpload', 'https://flyapi.vip/v1/videos/task_test/content'])
    expect((await run('request', { apiKey: key, path: 'https://other.example/v1/models' })).ok).toBe(false)
    expect((await run('request', { apiKey: key, path: '/v1/videos', body: { model: 'other' } })).ok).toBe(false)
    expect(api).toHaveBeenCalledTimes(2)
  } finally { await rm(profile, { recursive: true, force: true }) }
})

it('does not upload or call FlyAPI when lossless preparation fails', async () => {
  const handlers = new Map<string, Function>(), fetch = vi.fn()
  register({ ipcMain: { handle: (key: string, fn: Function) => handlers.set(key, fn) }, fetch,
    app: { getPath: () => tmpdir() }, prepareVideo: async () => { throw Error('参考视频缺少有效时长') } })
  expect(await handlers.get('flyapi:upload')!(null, { dataUrl: 'data:video/mp4;base64,invalid' })).toEqual({ ok: false, error: '参考视频缺少有效时长' })
  expect(fetch).not.toHaveBeenCalled()
})
