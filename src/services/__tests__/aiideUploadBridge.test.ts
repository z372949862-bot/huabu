// @vitest-environment node
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'
const register = createRequire(import.meta.url)('../../../electron/aiide.cjs')

function setup() {
  const handlers = new Map<string, Function>()
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ url: 'https://example.com/reference.png' })))
  register({ ipcMain: { handle: (key: string, fn: Function) => handlers.set(key, fn) }, fetch, retryDelay: async () => {} })
  return { upload: handlers.get('aiide:upload')!, fetch }
}
const dataUrl = 'data:image/png;base64,YWJj'
describe('AIIDE local media staging', () => {
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })
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

  it('allows a video upload to take longer than 60 seconds and shares the in-flight upload', async () => {
    vi.useFakeTimers()
    const { upload, fetch } = setup()
    let finish!: (value: Response) => void
    fetch.mockImplementation((_url, init) => new Promise((resolve, reject) => {
      finish = resolve
      init.signal.addEventListener('abort', () => reject(init.signal.reason))
    }))
    const args = { dataUrl: 'data:video/mp4;base64,YWJj' }
    const first = upload(null, args), second = upload(null, args)
    await vi.advanceTimersByTimeAsync(90_000)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(false)
    finish(new Response(JSON.stringify({ url: 'https://example.com/reference.mp4' })))
    expect(await first).toEqual({ ok: true, data: { url: 'https://example.com/reference.mp4' } })
    expect(await second).toEqual(await first)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds video timeouts, explains them in Chinese and permits recovery', async () => {
    vi.useFakeTimers()
    const { upload, fetch } = setup()
    fetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason))
    }))
    const args = { dataUrl: 'data:video/mp4;base64,YWJj' }
    const pending = upload(null, args)
    await vi.advanceTimersByTimeAsync(900_001)
    const result = await pending
    expect(result.ok).toBe(false)
    expect(result.error).toContain('素材上传超时（等待 300 秒')
    expect(result.error).toContain('视频任务尚未提交')
    expect(result.error).not.toMatch(/aborted/i)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
    fetch.mockImplementation(async () => new Response(JSON.stringify({ url: 'https://example.com/recovered.mp4' })))
    expect((await upload(null, args)).ok).toBe(true)
  })

  it('keeps the timeout active while reading the upload response body', async () => {
    vi.useFakeTimers()
    const { upload, fetch } = setup()
    fetch.mockImplementation(async (_url, init) => ({
      ok: true,
      json: () => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))),
    }))
    const pending = upload(null, { dataUrl })
    await vi.advanceTimersByTimeAsync(363_001)
    expect((await pending).error).toContain('素材上传超时')
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
  })
})
