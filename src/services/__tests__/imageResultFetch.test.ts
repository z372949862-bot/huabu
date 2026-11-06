// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
const { createImageResultFetch } = createRequire(import.meta.url)('../../../electron/imageResultFetch.cjs')

describe('desktop generated-image download', () => {
  it('keeps original GIF bytes despite PNG MIME, follows public redirects and sends no API key', async () => {
    const bytes = Buffer.from('GIF89a-original-bytes')
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://cdn.example/animation.png' } }))
      .mockResolvedValueOnce(new Response(bytes, { headers: { 'content-type': 'image/png' } }))
    const result = await createImageResultFetch({ fetch })({ url: 'https://example.com/result', apiKey: 'must-not-send' })
    expect(Buffer.from(result.base64, 'base64')).toEqual(bytes)
    expect(fetch.mock.calls[1][0]).toBe('https://cdn.example/animation.png')
    for (const [, options] of fetch.mock.calls) { expect(options.headers).toBeUndefined(); expect(options.credentials).toBe('omit') }
  })

  it('rejects local/file URLs, credentials and redirects to private hosts', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }))
    const download = createImageResultFetch({ fetch })
    for (const url of ['file:///C:/test', 'http://localhost/test', 'http://192.168.1.1/test', 'https://user:password@example.com/result']) {
      await expect(download({ url })).rejects.toThrow('公网')
    }
    expect(fetch).not.toHaveBeenCalled()
    await expect(download({ url: 'https://example.com/result' })).rejects.toThrow('公网')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('limits download size and reports HTTP errors without retrying', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('12345'))
      .mockResolvedValueOnce(new Response('oops', { status: 503 }))
    const download = createImageResultFetch({ fetch, maxBytes: 4 })
    await expect(download({ url: 'https://example.com/large' })).rejects.toThrow('超过')
    await expect(download({ url: 'https://example.com/error' })).rejects.toThrow('503')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('times out a stalled body, not just waiting for headers', async () => {
    const fetch = async (_url: string, { signal }: { signal: AbortSignal }) => new Response(new ReadableStream({
      start(controller) { signal.addEventListener('abort', () => controller.error(new Error('aborted'))) },
    }))
    await expect(createImageResultFetch({ fetch, timeoutMs: 10 })({ url: 'https://example.com/slow' })).rejects.toThrow('下载超时')
  })
})
