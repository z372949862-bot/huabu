// @vitest-environment node
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
const register = createRequire(import.meta.url)('../../../../electron/flyapi.cjs')

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
  register({ ipcMain: { handle: (k: string, cb: Function) => handlers.set(k, cb) }, stagingFetch: stage, net: { fetch: api }, app: { getPath: () => profile } })
  const run = (handler: string, data: unknown) => handlers.get('flyapi:' + handler)!(null, data)
  try {
    const staged = await run('upload', { dataUrl: 'data:video/mp4;base64,AAAAEGZ0eXA=', apiKey: key })
    expect(staged.data.url).toBe('https://media.example/clip.mp4')
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
