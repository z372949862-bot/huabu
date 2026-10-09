// @vitest-environment node
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { createVideoSaver } = createRequire(import.meta.url)('../../../electron/videoStorage.cjs')
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(24)])
describe('atomic video downloads', () => {
  let root: string
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-video-test-')) })
  afterEach(async () => {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'canvas-video-test-')) throw new Error('unsafe test cleanup')
    await fs.rm(root, { recursive: true, force: true })
  })
  it('deduplicates downloads, writes final files and reuses them', async () => {
    const fetch = vi.fn(async () => new Response(mp4, { headers: { 'content-type': 'video/mp4', 'content-length': String(mp4.length) } }))
    const save = createVideoSaver({ root, fetch })
    const input = { url: 'https://example.test/video', projectId: '../../escape', assetId: 'same' }
    const [a, b] = await Promise.all([save(input), save(input)])
    expect(a).toEqual(b)
    expect(await fs.readFile(a.path)).toEqual(mp4)
    expect(path.resolve(a.path).startsWith(root + path.sep)).toBe(true)
    expect(await save(input)).toEqual(a)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][1]).not.toHaveProperty('headers')
  })
  it.each([
    [Buffer.from('<html>error</html>'), { 'content-type': 'text/html' }],
    [mp4, { 'content-type': 'video/mp4', 'content-length': '1000' }],
    [Buffer.from('not a video'), { 'content-type': 'application/octet-stream' }],
  ])('rejects invalid or truncated payloads and cleans temporary files', async (body, headers) => {
    const save = createVideoSaver({ root, fetch: async () => new Response(body, { headers }) })
    await expect(save({ url: 'https://example.test/bad' })).rejects.toThrow()
    const dirs = await fs.readdir(root)
    expect(await fs.readdir(path.join(root, dirs[0]))).toEqual([])
  })
  it('aborts stalled downloads with a storage-only error', async () => {
    const fetch = (_url: string, { signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
    const save = createVideoSaver({ root, fetch, timeoutMs: 10 })
    await expect(save({ url: 'https://example.test/slow' })).rejects.toThrow('成片已生成，但保存到本地超时')
  })
})
