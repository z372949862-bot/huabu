import { afterEach, describe, expect, it, vi } from 'vitest'
import { GeekNowImageProvider } from '../geeknow'
import { findImageTemplate, ratioToSize } from '../../imageModelTemplates'

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
