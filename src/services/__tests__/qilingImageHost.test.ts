import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureQilingImageUrl } from '../qilingImageHost'
import { urlToBase64, compressImageToDataUrl } from '../imageProviderUtils'

vi.mock('../imageProviderUtils', () => ({
  urlToBase64: vi.fn().mockResolvedValue({ base64: 'original', mimeType: 'image/png' }),
  compressImageToDataUrl: vi.fn().mockResolvedValue('data:image/jpeg;base64,YWJj'),
}))
afterEach(() => { delete window.electronAPI; vi.clearAllMocks() })

describe('Qiling reference image upload', () => {
  it('compresses local images and uses the Qiling upload bridge', async () => {
    const upload = vi.fn().mockResolvedValue({ ok: true, data: { url: 'https://api.qilingze.com/ref/image.jpg' } })
    window.electronAPI = { qiling: { upload } } as any
    expect(await ensureQilingImageUrl('local-upload:///C:/person.png', 'test-key')).toBe('https://api.qilingze.com/ref/image.jpg')
    expect(urlToBase64).toHaveBeenCalledWith('local-upload:///C:/person.png')
    expect(compressImageToDataUrl).toHaveBeenCalledWith('original', 'image/png', 1280, 0.85)
    expect(upload).toHaveBeenCalledWith({ apiKey: 'test-key', dataUrl: 'data:image/jpeg;base64,YWJj' })
  })

  it('keeps existing HTTPS references and rejects HTTP/asset references', async () => {
    expect(await ensureQilingImageUrl('https://example.com/person.png', 'test-key')).toBe('https://example.com/person.png')
    expect(urlToBase64).not.toHaveBeenCalled()
    await expect(ensureQilingImageUrl('http://example.com/image.png', 'test-key')).rejects.toThrow('HTTPS')
    await expect(ensureQilingImageUrl('asset://image', 'test-key')).rejects.toThrow('HTTPS')
  })

  it('does not proceed with missing or failed uploads', async () => {
    await expect(ensureQilingImageUrl('local-upload:///C:/person.png', 'test-key')).rejects.toThrow('完全退出')
    window.electronAPI = { qiling: { upload: vi.fn().mockResolvedValue({ ok: false, error: '器灵图片上传失败' }) } } as any
    await expect(ensureQilingImageUrl('local-upload:///C:/person.png', 'test-key')).rejects.toThrow('器灵图片上传失败')
  })
})
