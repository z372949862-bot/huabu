import { afterEach, describe, expect, it, vi } from 'vitest'
import { GeekNowImageProvider } from '../geeknow'
import { findImageTemplate, ratioToSize } from '../../imageModelTemplates'
import { SUNBURST26_MODEL, sunburst26Fields, sunburst26Size } from '../../geeknowSunburst26'

vi.mock('../../imageProviderUtils', () => ({
  prepareReferenceImage: async (url: string) => ({ base64: url, mimeType: 'image/png' }),
}))
afterEach(() => vi.unstubAllGlobals())

describe('GeekNow GPT image request contracts', () => {
  it('sends Sunburst reference images and its documented 4K dimensions', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ url: 'https://example.com/result.png' }] })))
    vi.stubGlobal('fetch', fetch)
    const result = await new GeekNowImageProvider('test-key', 'https://example.com/v1').generateImage({
      model: 'gpt-image-2.5-sunburst', prompt: 'test', aspectRatio: '16:9', imageSize: '4K', imageUrls: ['ref1', 'ref2'],
    })
    expect(fetch.mock.calls[0][0]).toBe('https://example.com/v1/images/generations')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      model: 'gpt-image-2.5-sunburst', prompt: 'test', n: 1, size: '3840x2160', image: ['ref1', 'ref2'], quality: 'high', response_format: 'url',
    })
    expect(result.imageUrls).toEqual(['https://example.com/result.png'])
  })

  it('omits VIP response_format and accepts Base64 output', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=' }] })))
    vi.stubGlobal('fetch', fetch)
    const result = await new GeekNowImageProvider('test-key').generateImage({
      model: 'gpt-image-2-vip', prompt: 'test', aspectRatio: '21:9', imageSize: '4K',
    })
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.size).toBe('3808x1632')
    expect(body).not.toHaveProperty('response_format')
    expect(result.imageUrls).toEqual(['data:image/png;base64,aW1hZ2U='])
  })

  it('keeps every VIP preset inside the documented pixel constraints', () => {
    const tpl = findImageTemplate('gpt-image-2-vip', 'geeknow')!
    for (const tier of ['1K', '2K', '4K'] as const) {
      for (const ratio of tpl.capabilities.ratios!) {
        const [w, h] = ratioToSize(ratio, tier, tpl.sizeMaps).split('x').map(Number)
        expect(w % 16).toBe(0)
        expect(h % 16).toBe(0)
        expect(Math.max(w, h)).toBeLessThanOrEqual(3840)
        expect(Math.max(w, h) / Math.min(w, h)).toBeLessThanOrEqual(3)
        expect(w * h).toBeGreaterThanOrEqual(655360)
        expect(w * h).toBeLessThanOrEqual(8294400)
      }
    }
  })
})

describe('GeekNow Sunburst 2.6', () => {
  it('keeps the configured default channel and sends PNG, actual pixels and all references', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ url: 'https://example.com/result.png' }] })))
    vi.stubGlobal('fetch', fetch)
    await new GeekNowImageProvider('fake-key').generateImage({ model: SUNBURST26_MODEL, prompt: 'test', aspectRatio: '16:9', imageUrls: ['ref1', 'ref2'] })
    expect(fetch.mock.calls[0][0]).toBe('https://www.geeknow.top/v1/images/generations')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ model: SUNBURST26_MODEL, prompt: 'test', n: 1, size: '1536x864', quality: 'medium', output_format: 'png', response_format: 'url', image: ['ref1', 'ref2'] })
  })

  it('keeps custom URLs and transmits custom WxH with selected quality', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=' }] })))
    vi.stubGlobal('fetch', fetch)
    const result = await new GeekNowImageProvider('fake-key', 'https://custom.example/v1/').generateImage({ model: SUNBURST26_MODEL, prompt: 'test', sunburst26: { customSize: true, width: 1728, height: 1152, quality: 'xhigh', frameCount: 12 } })
    expect(fetch.mock.calls[0][0]).toBe('https://custom.example/v1/images/generations')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ size: '1728x1152', quality: 'xhigh', output_format: 'png' })
    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty('frame_count')
    expect(result.imageUrls).toEqual(['data:image/png;base64,aW1hZ2U='])
  })

  it('uses the desktop bridge for generation without any renderer POST', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, data: { data: [{ url: 'https://example.com/result.png' }] } })
    vi.stubGlobal('electronAPI', { geeknow: { request, cancel: vi.fn() } })
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await new GeekNowImageProvider('fake-key').generateImage({ model: SUNBURST26_MODEL, prompt: 'test', imageUrls: ['ref1'] })
    expect(fetch).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: 'https://www.geeknow.top/v1/images/generations', apiKey: 'fake-key', requestId: expect.any(String), body: expect.objectContaining({ model: SUNBURST26_MODEL, image: ['ref1'] }) }))
  })

  it('shows the actual host and certificate error without falling back to a second POST', async () => {
    const request = vi.fn().mockResolvedValue({ ok: false, error: 'net::ERR_CERT_COMMON_NAME_INVALID' })
    vi.stubGlobal('electronAPI', { geeknow: { request, cancel: vi.fn() } })
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(new GeekNowImageProvider('fake-key', 'https://custom.example').generateImage({ model: SUNBURST26_MODEL, prompt: 'test' })).rejects.toThrow('https://custom.example：net::ERR_CERT_COMMON_NAME_INVALID')
    expect(request).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('cancels the desktop wait through its request ID', async () => {
    let resolve!: (value: unknown) => void
    const request = vi.fn().mockImplementation(() => new Promise(done => { resolve = done }))
    const cancel = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('electronAPI', { geeknow: { request, cancel } })
    const controller = new AbortController()
    const running = new GeekNowImageProvider('fake-key').generateImage({ model: SUNBURST26_MODEL, prompt: 'test', signal: controller.signal })
    controller.abort()
    expect(cancel).toHaveBeenCalledWith({ requestId: request.mock.calls[0][0].requestId })
    resolve({ ok: false, cancelled: true, error: '已取消' })
    await expect(running).rejects.toThrow('已取消')
  })

  it('uses independent size maps and auto size only for GIF', () => {
    expect(sunburst26Size({}, '16:9', '1K')).toBe('1536x864')
    expect(sunburst26Size({}, '16:9', '2K')).toBe('2048x1152')
    expect(sunburst26Size({}, '16:9', '4K')).toBe('3840x2160')
    expect(sunburst26Size({ format: 'gif', customSize: true, width: 1000, height: 1000 })).toBe('auto')
    expect(sunburst26Fields({ format: 'gif' })).toEqual({ output_format: 'gif', quality: 'medium', response_format: 'url', frame_count: 9, frame_duration_ms: 200 })
    for (const options of [{ customSize: true, width: 0, height: 768 }, { customSize: true, width: 16.9, height: 2 }]) expect(() => sunburst26Size(options)).toThrow('正整数')
  })

  it.each([{ frameCount: 1 }, { frameCount: 65 }, { frameCount: 2.5 }, { frameDurationMs: 25 }, { frameDurationMs: 2001 }])('rejects invalid GIF settings before a billed request: %j', async options => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(new GeekNowImageProvider('fake-key').generateImage({ model: SUNBURST26_MODEL, prompt: 'test', sunburst26: { format: 'gif', ...options } })).rejects.toThrow('GIF')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('persists every returned source before downloads and retries only GET after a failure', async () => {
    const sources = ['https://cdn.example/storyboard.png', 'https://cdn.example/animation.png']
    const fetch = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => options.method === 'POST'
      ? new Response(JSON.stringify({ data: sources.map(url => ({ url })) }))
      : new Response('unavailable', { status: 503 }))
    vi.stubGlobal('fetch', fetch)
    const onResult = vi.fn()
    const provider = new GeekNowImageProvider('fake-key')
    await expect(provider.generateImage({ model: SUNBURST26_MODEL, prompt: 'loop', sunburst26: { format: 'gif', frameCount: 12, frameDurationMs: 150 }, onGeekNowImageResult: onResult })).rejects.toThrow('重试下载')
    expect(onResult).toHaveBeenCalledWith({ sources, model: SUNBURST26_MODEL, prompt: 'loop' })
    expect(onResult.mock.invocationCallOrder[0]).toBeLessThan(fetch.mock.invocationCallOrder[1])
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toMatchObject({ size: 'auto', output_format: 'gif', frame_count: 12, frame_duration_ms: 150 })
    await expect(provider.generateImage({ model: SUNBURST26_MODEL, prompt: 'loop', geeknowImageResult: onResult.mock.calls[0][0] })).rejects.toThrow('重试下载')
    expect(fetch.mock.calls.filter(([, opts]) => opts.method === 'POST')).toHaveLength(1)
    for (const [, options] of fetch.mock.calls.slice(1)) {
      expect(options.headers).toBeUndefined()
      expect(options.credentials).toBe('omit')
    }
  })
})
