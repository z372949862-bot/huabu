import { afterEach, describe, expect, it, vi } from 'vitest'
import { Qiling1080JS as JS, Qiling1080GF as GF, Qiling1080Body, Qiling1080Models } from '../qiling1080'
import { ChuhaiyingVideoProvider } from '../providers/chuhaiyingVideo'
import { readMediaDuration } from '../providers/piapi'
import type { CreateTaskParams } from '../ai-provider'

vi.mock('../providers/piapi', async importOriginal => ({
  ...await importOriginal<typeof import('../providers/piapi')>(),
  readMediaDuration: vi.fn().mockResolvedValue(5),
}))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })
const input = (model: string, extra: Partial<CreateTaskParams> = {}): CreateTaskParams => ({ model, prompt: 'Test scene', duration: 5, ratio: '16:9', ...extra })
const provider = () => new ChuhaiyingVideoProvider('offline-test-key', 'https://api.qilingze.com')
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })

describe('Qiling JS/GF 1080P integration', () => {
  it('builds separate legacy JS and unified GF payloads', () => {
    expect(Qiling1080Body(input(JS))).toEqual({ model: JS, prompt: 'Test scene', duration: 5, ratio: '16:9', resolution: '1080p' })
    expect(Qiling1080Body(input(GF))).toEqual({ model: GF, prompt: 'Test scene', seconds: 5, aspect_ratio: '16:9', resolution: '1080p', mode: '文生视频' })
  })
  it.each(Qiling1080Models)('validates the catalog limits for $id', model => {
    expect(model.capabilities.resolutions).toEqual(['1080p'])
    for (const ratio of model.capabilities.ratios!) expect(Qiling1080Body(input(model.id, { ratio }))).toBeTruthy()
    for (const duration of [4, 30]) expect(Qiling1080Body(input(model.id, { duration }))).toBeTruthy()
    for (const duration of [3, 31, 4.5]) expect(() => Qiling1080Body(input(model.id, { duration }))).toThrow('4–30')
    expect(() => Qiling1080Body(input(model.id, { ratio: 'adaptive' }))).toThrow('画幅')
    expect(() => Qiling1080Body(input(model.id, { prompt: ' ' }))).toThrow('提示词')
    for (const url of ['local-upload:///a.mp4', 'http://example.com/a.png', 'https://user:pass@example.com/a.png']) {
      expect(() => Qiling1080Body(input(model.id, { image_urls: [url] }))).toThrow('HTTPS')
    }
    const max = model.capabilities.maxImages!
    const images = Array.from({ length: max }, (_, i) => 'https://example.com/' + i + '.png')
    expect(Qiling1080Body(input(model.id, { image_urls: images })).images).toHaveLength(max)
    expect(() => Qiling1080Body(input(model.id, { image_urls: [...images, 'https://example.com/extra.png'] }))).toThrow('上限')
  })
  it('uses explicit first/last mode only for GF and deduplicates references', () => {
    const images = ['https://example.com/first.png', 'https://example.com/last.png']
    expect(Qiling1080Body(input(GF, { image_urls: images })).mode).toBe('参考生视频')
    expect(Qiling1080Body(input(GF, { image_urls: images, qilingFrameMode: 'first_last_frame' })).mode).toBe('首尾帧')
    expect(() => Qiling1080Body(input(GF, { image_urls: images.slice(0, 1), qilingFrameMode: 'first_last_frame' }))).toThrow('恰好2张')
    expect(() => Qiling1080Body(input(JS, { image_urls: images, qilingFrameMode: 'first_last_frame' }))).toThrow('不支持')
    expect(Qiling1080Body(input(JS, { image_urls: images, content: [{ type: 'image_url', image_url: { url: images[0] } }] })).images).toEqual(images)
  })
  it('preserves each task protocol when JS and GF share one provider instance', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ id: 'js-task' })).mockResolvedValueOnce(response({ id: 'gf-task' }))
      .mockResolvedValueOnce(response({ status: 'completed', video_url: 'https://example.com/js.mp4' }))
      .mockResolvedValueOnce(response({ status: 'completed', video_url: 'https://example.com/gf.mp4' }))
    vi.stubGlobal('fetch', fetch)
    const p = provider()
    await p.createTask(input(JS)); await p.createTask(input(GF))
    expect((await p.getTaskStatus('js-task')).videoUrl).toBe('https://example.com/js.mp4')
    expect((await p.getTaskStatus('gf-task')).status).toBe('completed')
    for (const index of [0, 2]) expect(fetch.mock.calls[index][1].headers).not.toHaveProperty('X-Qiling-API-Version')
    for (const index of [1, 3]) expect(fetch.mock.calls[index][1].headers['X-Qiling-API-Version']).toBe('1')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(Qiling1080Body(input(JS)))
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual(Qiling1080Body(input(GF)))
  })
  it('supports explicit model queries and preserves existing GF720 requests', async () => {
    const fetch = vi.fn().mockImplementation(async () => response({ id: 'task', status: 'processing' }))
    vi.stubGlobal('fetch', fetch)
    const p = provider()
    await p.getTaskStatus('restored', JS)
    expect(fetch.mock.lastCall![1].headers).not.toHaveProperty('X-Qiling-API-Version')
    await p.createTask(input('SD2.5-满血-GF-720P'))
    expect(JSON.parse(fetch.mock.lastCall![1].body).resolution).toBe('720p')
    expect(fetch.mock.lastCall![1].headers['X-Qiling-API-Version']).toBe('1')
  })
  it('rejects overlong GF references before creating a task', async () => {
    vi.mocked(readMediaDuration).mockResolvedValue(8)
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(provider().createTask(input(GF, { content: [
      { type: 'video_url', video_url: 'https://example.com/a.mp4' },
      { type: 'video_url', video_url: 'https://example.com/b.mp4' },
    ] }))).rejects.toThrow('15秒')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('does not resubmit a paid task after gateway timeout', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ error: { message: 'timeout' } }, 524)); vi.stubGlobal('fetch', fetch)
    await expect(provider().createTask(input(JS))).rejects.toThrow('524')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
