// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
const register = createRequire(import.meta.url)('../../../../electron/luoci-image.cjs')
const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status })
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64')
function setup() {
  const handlers = new Map(), fetch = vi.fn()
  register({ ipcMain: { handle: (name: string, fn: any) => handlers.set(name, fn) }, net: { fetch } })
  return { fetch, call: (name: string, args: any) => handlers.get('luoci-image:' + name)(null, { key: 'fixture-secret', ...args }) }
}

it('authorizes the real byte count, PUTs original bytes without API credentials and confirms once', async () => {
  const { fetch, call } = setup()
  const signedHeaders = { 'Content-Type': 'image/png', 'x-upload-signature': 'signature' }
  fetch.mockResolvedValueOnce(json({ uploadId: 'up55', uploadUrl: 'https://storage.example/upload', headers: signedHeaders, expiresAt: new Date(Date.now() + 60000).toISOString() }))
    .mockResolvedValueOnce(new Response(null, { status: 200 })).mockResolvedValueOnce(json({ id: 'ref55', mime: 'image/png', size: png.length }))
  expect(await call('upload', { modelId: 'seedream-5-5', mime: 'image/png', base64: png.toString('base64'), name: 'ref.png' })).toMatchObject({ ok: true, data: { id: 'ref55' } })
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ modelId: 'seedream-5-5', file: { name: 'ref.png', type: 'image/png', size: png.length } })
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer fixture-secret')
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'PUT', headers: signedHeaders, body: png, redirect: 'error' })
  expect(fetch.mock.calls[1][1].headers).not.toHaveProperty('Authorization')
  expect(fetch.mock.calls[2][0]).toBe('https://luocisheng.cn/api/v1/reference-uploads/up55/complete')
  expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer fixture-secret')
})

it('does not complete a failed upload and surfaces duplicate confirmation errors', async () => {
  const { fetch, call } = setup()
  const args = { modelId: 'seedream-5-5', mime: 'image/png', base64: png.toString('base64') }
  const auth = () => json({ uploadId: 'up55', uploadUrl: 'https://storage.example/upload', headers: {} })
  fetch.mockResolvedValueOnce(auth()).mockResolvedValueOnce(new Response(null, { status: 500 }))
  expect(await call('upload', args)).toMatchObject({ ok: false })
  expect(fetch).toHaveBeenCalledTimes(2)
  fetch.mockResolvedValueOnce(auth()).mockResolvedValueOnce(new Response()).mockResolvedValueOnce(json({ error: 'already completed' }, 409))
  expect(await call('upload', args)).toMatchObject({ ok: false, status: 409 })
  expect(fetch).toHaveBeenCalledTimes(5)
})

it.each([
  ['milliseconds', Date.now() + 60000],
  ['seconds', Math.floor(Date.now() / 1000) + 60],
  ['numeric string', String(Date.now() + 60000)],
  ['local clock ahead', '2000-01-01T00:00:00Z'],
])('lets storage validate a freshly issued upload credential: %s', async (_format, expiresAt) => {
  const { fetch, call } = setup()
  fetch.mockResolvedValueOnce(json({ uploadId: 'up55', uploadUrl: 'https://storage.example/upload', headers: {}, expiresAt }))
    .mockResolvedValueOnce(new Response()).mockResolvedValueOnce(json({ id: 'ref55' }))
  expect(await call('upload', { modelId: 'seedream-5-5', mime: 'image/png', base64: png.toString('base64') })).toMatchObject({ ok: true, data: { id: 'ref55' } })
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(fetch.mock.calls[1][1].method).toBe('PUT')
})

it('does not confirm or submit when storage rejects the credential', async () => {
  const { fetch, call } = setup()
  fetch.mockResolvedValueOnce(json({ uploadId: 'up55', uploadUrl: 'https://storage.example/upload', headers: {}, expiresAt: Date.now() + 60000 }))
    .mockResolvedValueOnce(new Response(null, { status: 403 }))
  expect(await call('upload', { modelId: 'seedream-5-5', mime: 'image/png', base64: png.toString('base64') })).toMatchObject({ ok: false, error: expect.stringContaining('403') })
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('sends the same JSON and idempotency key without automatic retries', async () => {
  const { fetch, call } = setup()
  const body = { modelId: 'seedream-5-5', prompt: '猫', numImages: 1, imageSize: '2K', aspectRatio: 'auto', referenceImageIds: ['ref55'] }
  fetch.mockResolvedValueOnce(json({ taskId: 't55' }, 202))
  expect(await call('request', { route: '/api/v1/images/generations', body, requestKey: 'seedream-fixture' })).toMatchObject({ ok: true, data: { taskId: 't55' } })
  expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe('seedream-fixture')
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(body)
  fetch.mockRejectedValueOnce(new Error('timeout fixture-secret'))
  expect(await call('request', { route: '/api/v1/images/generations', body, requestKey: 'seedream-fixture' })).toMatchObject({ ok: false, error: 'timeout [密钥]' })
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('downloads with authentication and drops credentials on a storage redirect', async () => {
  const { fetch, call } = setup()
  fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://storage.example/result.png' } }))
    .mockResolvedValueOnce(new Response(png))
  expect(await call('download', { taskId: 't55', url: '/api/v1/tasks/t55/images/0' })).toMatchObject({ ok: true, data: { dataUrl: 'data:image/png;base64,' + png.toString('base64') } })
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer fixture-secret')
  expect(fetch.mock.calls[1][1].headers).toEqual({})
})

it('rejects invalid image types, oversized uploads and unrelated download URLs before I/O', async () => {
  const { fetch, call } = setup()
  expect((await call('upload', { modelId: 'seedream-5-5', mime: 'image/gif', base64: 'AA==' })).ok).toBe(false)
  expect((await call('upload', { modelId: 'seedream-5-5', mime: 'image/png', base64: Buffer.alloc(30 * 1024 * 1024 + 1).toString('base64') })).ok).toBe(false)
  expect((await call('download', { taskId: 't55', url: 'https://other.example/api/v1/tasks/t55/images/0' })).ok).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
})
