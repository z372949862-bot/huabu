import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { compressImageToDataUrl } from '../imageProviderUtils'

// 1x1 transparent PNG
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII='

// jsdom 不会真的去解码 data URL 图片（既不触发 onload 也不触发 onerror，会卡死），
// 所以这里把 Image 全局 stub 成"赋值 src 后异步触发 onerror"，
// 这条路径正好命中 compressImageToDataUrl 的 catch 分支：返回原始 data URL。
// 这是该函数文档中保证的容错行为，单测覆盖的也正是这个保证。
class StubImage {
  onload: (() => void) | null = null
  onerror: ((e?: unknown) => void) | null = null
  naturalWidth = 0
  naturalHeight = 0
  width = 0
  height = 0
  set src(_v: string) {
    queueMicrotask(() => this.onerror?.(new Error('jsdom stub: decode unsupported')))
  }
}

let originalImage: typeof Image | undefined
beforeAll(() => {
  originalImage = (globalThis as any).Image
  ;(globalThis as any).Image = StubImage
})
afterAll(() => {
  if (originalImage) (globalThis as any).Image = originalImage
})

describe('compressImageToDataUrl', () => {
  it('returns a data URL string', async () => {
    const out = await compressImageToDataUrl(TINY_PNG, 'image/png', 1024, 0.85)
    expect(out.startsWith('data:image/')).toBe(true)
  })

  it('falls back to source on decode failure', async () => {
    const out = await compressImageToDataUrl('not-a-real-base64', 'image/png')
    expect(out).toContain('data:image/png;base64,not-a-real-base64')
  })
})
