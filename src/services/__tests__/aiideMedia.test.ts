import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureAiideMediaUrl } from '../aiideMedia'
const read = vi.hoisted(() => vi.fn())
vi.mock('../imageHost', () => ({ urlToFile: read }))
describe('AIIDE media upload routing', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.clearAllTimers(); vi.useRealTimers() })
  it('passes through remote URLs and asset identifiers', async () => {
    for (const url of ['https://example.com/a.png', 'asset://mat_123', 'mat_123']) expect(await ensureAiideMediaUrl(url)).toBe(url)
    expect(read).not.toHaveBeenCalled()
  })
  it('sends only local bytes through the desktop bridge, with no provider key', async () => {
    const upload = vi.fn().mockResolvedValue({ ok: true, data: { url: 'https://example.com/a.png' } })
    vi.stubGlobal('electronAPI', { aiide: { upload } })
    read.mockResolvedValue(new File(['abc'], 'a.png', { type: 'image/png' }))
    expect(await ensureAiideMediaUrl('local-upload:///C:/a.png')).toBe('https://example.com/a.png')
    expect(upload).toHaveBeenCalledExactlyOnceWith({ dataUrl: 'data:image/png;base64,YWJj' })
  })

  it('does not cut off browser video uploads at 60 seconds', async () => {
    vi.useFakeTimers()
    read.mockResolvedValue(new File(['abc'], 'a.mp4', { type: 'video/mp4' }))
    let finish!: (value: Response) => void
    const fetch = vi.fn((_url, init) => new Promise<Response>((resolve, reject) => {
      finish = resolve
      init.signal.addEventListener('abort', () => reject(init.signal.reason))
    }))
    vi.stubGlobal('fetch', fetch)
    const result = ensureAiideMediaUrl('blob:local-video')
    await vi.advanceTimersByTimeAsync(90_000)
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(false)
    finish(new Response(JSON.stringify({ url: 'https://example.com/a.mp4' })))
    expect(await result).toBe('https://example.com/a.mp4')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('times out a stalled browser response body and leaves no timer behind', async () => {
    vi.useFakeTimers()
    read.mockResolvedValue(new File(['abc'], 'a.mp4', { type: 'video/mp4' }))
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => ({
      ok: true,
      json: () => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))),
    })))
    const result = expect(ensureAiideMediaUrl('blob:local-video')).rejects.toThrow('视频任务尚未提交')
    await vi.advanceTimersByTimeAsync(600_001)
    await result
    expect(vi.getTimerCount()).toBe(0)
  })
})
