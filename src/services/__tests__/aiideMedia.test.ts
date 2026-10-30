import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureAiideMediaUrl } from '../aiideMedia'
const read = vi.hoisted(() => vi.fn())
vi.mock('../imageHost', () => ({ urlToFile: read }))
describe('AIIDE media upload routing', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })
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
})
