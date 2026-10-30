// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
const register = createRequire(import.meta.url)('../../../electron/aiide.cjs')

function setup() {
  const handlers = new Map<string, Function>()
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ url: 'https://example.com/reference.png' })))
  register({ ipcMain: { handle: (key: string, fn: Function) => handlers.set(key, fn) }, fetch, retryDelay: async () => {} })
  return { upload: handlers.get('aiide:upload')!, fetch }
}
const dataUrl = 'data:image/png;base64,YWJj'
describe('AIIDE local media staging', () => {
  it('uses desktop multipart upload, reuses the result and never forwards provider credentials', async () => {
    const { upload, fetch } = setup()
    const args = { dataUrl, apiKey: 'must-not-leave-the-app' }
    expect(await upload(null, args)).toEqual({ ok: true, data: { url: 'https://example.com/reference.png' } })
    expect((await upload(null, args)).ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://imageproxy.zhongzhuan.chat/api/upload')
    expect(init.headers).toBeUndefined()
    expect(init.body.get('file').name).toBe('reference.png')
    expect(Buffer.from(await init.body.get('file').arrayBuffer()).toString()).toBe('abc')
  })

  it('retries temporary network/502 upload failures, and stops on a permanent failure', async () => {
    const { upload, fetch } = setup()
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('', { status: 502 }))
    expect((await upload(null, { dataUrl })).ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(3)
    fetch.mockReset().mockImplementation(async () => new Response('', { status: 413 }))
    const result = await upload(null, { dataUrl: 'data:image/png;base64,ZGVm' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('视频任务尚未提交')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('bounds retries and allows retrying the upload after recovery', async () => {
    const { upload, fetch } = setup()
    fetch.mockImplementation(async () => new Response('', { status: 503 }))
    expect((await upload(null, { dataUrl })).ok).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(3)
    fetch.mockImplementation(async () => new Response(JSON.stringify({ url: 'https://example.com/recovered.png' })))
    expect((await upload(null, { dataUrl })).ok).toBe(true)
  })

  it('rejects unsupported media and invalid upload URLs', async () => {
    const { upload, fetch } = setup()
    expect((await upload(null, { dataUrl: 'data:video/webm;base64,YWJj' })).ok).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockImplementation(async () => new Response(JSON.stringify({ url: 'file:///C:/a.png' })))
    expect((await upload(null, { dataUrl })).ok).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
