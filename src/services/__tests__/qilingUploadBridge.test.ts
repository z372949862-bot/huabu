// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
const require = createRequire(import.meta.url)
const register = require('../../../electron/qiling.cjs')

function setup(response: Response) {
  const handlers = new Map<string, Function>()
  const fetch = vi.fn().mockResolvedValue(response)
  register({ ipcMain: { handle: (key: string, fn: Function) => handlers.set(key, fn) }, net: { fetch }, app: {}, uploadRetryDelay: async () => {} })
  return { upload: handlers.get('qiling:upload')!, fetch }
}

describe('Qiling native stable image host', () => {
  it('uses authenticated multipart upload with image bytes and returns HTTPS', async () => {
    const { upload, fetch } = setup(new Response(JSON.stringify({ url: 'https://api.qilingze.com/ref/image.jpg' })))
    expect(await upload(null, { apiKey: 'test-api-key', dataUrl: 'data:image/jpeg;base64,YWJj' }))
      .toEqual({ ok: true, data: { url: 'https://api.qilingze.com/ref/image.jpg' } })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.qilingze.com/qiling-reference-upload')
    expect(init.headers).toEqual({ Authorization: 'Bearer test-api-key' })
    expect(init.method).toBe('POST')
    const file = init.body.get('file')
    expect(file.type).toBe('image/jpeg')
    expect(file.name).toBe('reference.jpeg')
    expect(Buffer.from(await file.arrayBuffer()).toString()).toBe('abc')
  })

  it('blocks invalid payloads and non-HTTPS upload responses', async () => {
    const { upload, fetch } = setup(new Response(JSON.stringify({ url: 'http://example.com/image.jpg' })))
    expect((await upload(null, { apiKey: 'test-api-key', dataUrl: 'https://example.com/image.jpg' })).ok).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    expect((await upload(null, { apiKey: 'test-api-key', dataUrl: 'data:image/jpeg;base64,YWJj' })).ok).toBe(false)
  })

  it('reports upload errors without exposing the API key', async () => {
    const { upload } = setup(new Response(JSON.stringify({ message: 'invalid token test-api-key' }), { status: 401 }))
    const result = await upload(null, { apiKey: 'test-api-key', dataUrl: 'data:image/jpeg;base64,YWJj' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('HTTP 401')
    expect(result.error).not.toContain('test-api-key')
  })

  it('retries HTTP 524 then falls back without sending the Qiling key', async () => {
    const { upload, fetch } = setup(new Response())
    fetch.mockReset()
    fetch.mockResolvedValueOnce(new Response('', { status: 524 }))
      .mockResolvedValueOnce(new Response('', { status: 524 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://imageproxy.zhongzhuan.chat/api/proxy/image/test.jpg' })))
    const result = await upload(null, { apiKey: 'test-api-key', dataUrl: 'data:image/jpeg;base64,YWJj' })
    expect(result.ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(fetch.mock.calls[0][0]).toBe('https://api.qilingze.com/qiling-reference-upload')
    expect(fetch.mock.calls[1][0]).toBe('https://api.qilingze.com/qiling-reference-upload')
    expect(fetch.mock.calls[2][0]).toBe('https://imageproxy.zhongzhuan.chat/api/upload')
    expect(fetch.mock.calls[2][1].headers).toEqual({})
    expect(Buffer.from(await fetch.mock.calls[2][1].body.get('file').arrayBuffer()).toString()).toBe('abc')
  })

  it('reuses uploaded image URLs instead of uploading the same image again', async () => {
    const { upload, fetch } = setup(new Response(JSON.stringify({ url: 'https://example.com/test.jpg' })))
    const args = { apiKey: 'test-api-key', dataUrl: 'data:image/jpeg;base64,YWJj' }
    expect((await upload(null, args)).ok).toBe(true)
    expect((await upload(null, args)).ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('stops after bounded retries when both hosts are unavailable', async () => {
    const { upload, fetch } = setup(new Response())
    fetch.mockImplementation(async () => new Response('', { status: 524 }))
    const args = { apiKey: 'test-api-key', dataUrl: 'data:image/jpeg;base64,YWJj' }
    const result = await upload(null, args)
    expect(result.ok).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(result.error).toContain('视频任务尚未提交')
    fetch.mockReset().mockResolvedValue(new Response(JSON.stringify({ url: 'https://example.com/recovered.jpg' })))
    expect((await upload(null, args)).ok).toBe(true)
  })
})
