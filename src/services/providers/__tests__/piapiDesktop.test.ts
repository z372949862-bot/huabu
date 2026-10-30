// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
const require = createRequire(import.meta.url)
const register = require('../../../../electron/piapi.cjs')
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
function setup() {
  const handlers = new Map<string, any>(), fetch = vi.fn()
  const root = mkdtempSync(path.join(tmpdir(), 'wuhu-piapi-test-')); roots.push(root)
  register({ ipcMain: { handle: (channel: string, fn: any) => handlers.set(channel, fn) }, net: { fetch }, app: { getPath: () => root } })
  return { fetch, call: (channel: string, args: any) => handlers.get('piapi:' + channel)(null, args) }
}
const body = { model: 'seedance', task_type: 'seedance-2.5-less-restriction', input: { prompt: 'test', duration: 5, resolution: '720p' } }
const task = { apiKey: 'test-key', taskId: 'task_test', videoUrl: 'https://cdn.example.com/video.mp4' }
function mp4() {
  return Buffer.concat(['ftyp', 'moov', 'mdat'].map(type => { const box = Buffer.alloc(12); box.writeUInt32BE(12); box.write(type, 4); return box }))
}
describe('PiAPI Electron bridge', () => {
  const imageBody = { model: 'seedream', task_type: 'seedream-5-pro-less-restriction', input: { prompt: 'forest', size: '1K', aspect_ratio: '4:5', output_format: 'png', image_urls: ['https://example.com/ref.png'] } }
  const imageTask = { apiKey: 'test-key', taskId: 'task_image', imageUrl: 'https://cdn.example.com/image.png' }
  const png = () => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64')
  it('accepts Seedream Pro using the same task endpoint and X-API-Key', async () => {
    const { fetch, call } = setup(); fetch.mockResolvedValue(json({ code: 200, data: { task_id: 'task_image', status: 'Completed' } }))
    expect((await call('request', { apiKey: 'test-key', path: '/api/v1/task', body: imageBody })).ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(imageBody)
    expect(fetch.mock.calls[0][1].headers['X-API-Key']).toBe('test-key')
  })
  it('rejects incompatible image parameters and private asset IDs before I/O', async () => {
    const { fetch, call } = setup()
    for (const input of [{ size: '4K' }, { aspect_ratio: 'adaptive' }, { image_urls: ['asset://asset-test'] }, { image_urls: Array(11).fill('https://example.com/a.png') }, { video_urls: ['https://example.com/a.mp4'] }]) {
      expect((await call('request', { apiKey: 'test-key', path: '/api/v1/task', body: { ...imageBody, input: { ...imageBody.input, ...input } } })).ok).toBe(false)
    }
    expect(fetch).not.toHaveBeenCalled()
  })
  it('saves image bytes locally and reuses the account/task cache', async () => {
    const { fetch, call } = setup(); const bytes = png()
    fetch.mockImplementation(async () => new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Content-Length': String(bytes.length) } }))
    const result = await call('download-image', imageTask)
    expect(result.ok).toBe(true); expect(readFileSync(result.data.path)).toEqual(bytes)
    expect((await call('download-image', imageTask)).data.path).toBe(result.data.path)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('X-API-Key')
  })
  it('drops image download credentials on CDN redirects', async () => {
    const { fetch, call } = setup()
    fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: imageTask.imageUrl } })).mockResolvedValueOnce(new Response(png()))
    expect((await call('download-image', { ...imageTask, imageUrl: 'https://api.piapi.ai/media/image' })).ok).toBe(true)
    expect(fetch.mock.calls[0][1].headers['X-API-Key']).toBe('test-key')
    expect(fetch.mock.calls[1][1].headers).not.toHaveProperty('X-API-Key')
  })
  it('rejects HTML, incomplete transfers and oversized images', async () => {
    const { fetch, call } = setup()
    fetch.mockResolvedValueOnce(new Response('<html>not an image</html>')).mockResolvedValueOnce(new Response(png(), { headers: { 'Content-Length': '200' } })).mockResolvedValueOnce(new Response(png(), { headers: { 'Content-Length': String(51 * 1024 * 1024) } }))
    expect((await call('download-image', imageTask)).error).toContain('有效')
    expect((await call('download-image', imageTask)).error).toContain('不完整')
    expect((await call('download-image', imageTask)).error).toContain('50 MB')
  })
  const managed = { apiKey: 'test-key', url: 'https://example.com/actor.png', sourceKey: 'local-upload:///actor.png', assetType: 'Image', name: 'actor' }
  const asset = { asset_id: 'asset-test', status: 'Active', asset_type: 'Image' }
  it('accepts asset HTTP 202, persists the ID and reuses it with a GET', async () => {
    const { fetch, call } = setup()
    fetch.mockResolvedValueOnce(json({ ...asset, status: 'Processing' }, 202)).mockResolvedValueOnce(json(asset))
    expect((await call('ensure-private-asset', managed)).data.asset_id).toBe('asset-test')
    expect((await call('ensure-private-asset', managed)).data.status).toBe('Active')
    expect(fetch.mock.calls.map(c => c[1].method)).toEqual(['POST', 'GET'])
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ url: managed.url, asset_type: 'Image', name: 'actor' })
  })
  it('does not blindly repeat ambiguous ingestion; definitive 403 can be retried', async () => {
    const { fetch, call } = setup()
    fetch.mockRejectedValueOnce(new TypeError('network'))
    expect((await call('ensure-private-asset', managed)).ok).toBe(false)
    expect((await call('ensure-private-asset', managed)).error).toContain('先在资产库')
    expect(fetch).toHaveBeenCalledTimes(1)
    const other = { ...managed, sourceKey: 'other' }
    fetch.mockResolvedValueOnce(json({ message: 'not allowed' }, 403)).mockResolvedValueOnce(json(asset, 202))
    expect((await call('ensure-private-asset', other)).status).toBe(403)
    expect((await call('ensure-private-asset', other)).ok).toBe(true)
  })
  it('renews an expired asset and isolates cache entries by account key', async () => {
    const { fetch, call } = setup()
    fetch.mockResolvedValueOnce(json(asset, 202)).mockResolvedValueOnce(json({ message: 'expired' }, 404)).mockResolvedValueOnce(json({ ...asset, asset_id: 'asset-new' }, 202)).mockResolvedValueOnce(json({ ...asset, asset_id: 'asset-account2' }, 202))
    await call('ensure-private-asset', managed)
    expect((await call('ensure-private-asset', managed)).data.asset_id).toBe('asset-new')
    expect((await call('ensure-private-asset', { ...managed, apiKey: 'other-key' })).data.asset_id).toBe('asset-account2')
    expect(fetch.mock.calls.map(c => c[1].method)).toEqual(['POST', 'GET', 'POST', 'POST'])
  })
  it('accepts private references and paged reads while rejecting asset-only editing', async () => {
    const { fetch, call } = setup(); fetch.mockImplementation(async () => json({ code: 200, data: {} }))
    expect((await call('request', { apiKey: 'test-key', path: '/api/v1/task', body: { ...body, input: { ...body.input, image_urls: ['asset://asset-test', 'https://example.com/a.png'] } } })).ok).toBe(true)
    expect((await call('request', { apiKey: 'test-key', path: '/api/v1/asset/list?page=1&size=50&order=-last_used_at' })).ok).toBe(true)
    expect((await call('request', { apiKey: 'test-key', path: '/api/v1/task', body: { ...body, input: { ...body.input, omni_reference_task_type: 'edit', video_urls: ['asset://asset-test'] } } })).error).toContain('编辑源视频')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('uses X-API-Key and exactly one create request', async () => {
    const { fetch, call } = setup(); fetch.mockResolvedValue(json({ code: 200, data: { task_id: 'test' } }))
    expect((await call('request', { apiKey: 'test-key', path: '/api/v1/task', body })).ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('https://api.piapi.ai/api/v1/task')
    expect(options.headers['X-API-Key']).toBe('test-key')
    expect(options.headers).not.toHaveProperty('Authorization')
    expect(JSON.parse(options.body)).toEqual(body)
  })
  it('does not retry ambiguous create failures', async () => {
    const { fetch, call } = setup(); fetch.mockRejectedValue(new TypeError('network'))
    const result = await call('request', { apiKey: 'test-key', path: '/api/v1/task', body })
    expect(result).toMatchObject({ ok: false, retryable: false })
    expect(result.error).toContain('不会自动重提')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('allows only configured protocol paths and valid ASCII keys', async () => {
    const { fetch, call } = setup()
    expect((await call('request', { apiKey: '中文', path: '/account/info' })).ok).toBe(false)
    expect((await call('request', { apiKey: 'test-key', path: 'https://example.com' })).ok).toBe(false)
    expect((await call('request', { apiKey: 'test-key', path: '/api/v1/task', body: { ...body, task_type: 'other' } })).ok).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('polls retryable failures while redacting the key', async () => {
    const { fetch, call } = setup(); fetch.mockResolvedValue(json({ message: 'temporarily failed for test-key' }, 503))
    const result = await call('request', { apiKey: 'test-key', path: '/api/v1/task/task_test' })
    expect(result.retryable).toBe(true); expect(result.error).not.toContain('test-key')
  })
  it('uses the official uploader with a safe filename and explains Creator requirement', async () => {
    const { fetch, call } = setup(); fetch.mockResolvedValue(json({ message: 'plan required' }, 403))
    const result = await call('upload', { apiKey: 'test-key', data: 'YQ==', fileName: '角色.jpg' })
    expect(result.error).toContain('Creator')
    expect(result.error).toContain('未提交')
    expect(fetch.mock.calls[0][0]).toBe('https://upload.theapi.app/api/ephemeral_resource')
    expect(JSON.parse(fetch.mock.calls[0][1].body).file_name).toMatch(/^reference-.*[.]jpg$/)
  })
  it('rejects oversized uploads before network I/O', async () => {
    const { fetch, call } = setup()
    expect((await call('upload', { apiKey: 'test-key', data: 'a'.repeat(10 * 1024 * 1024 + 1), fileName: 'a.png' })).ok).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('saves a complete MP4 and reuses the cached original task', async () => {
    const { fetch, call } = setup(); const bytes = mp4()
    fetch.mockImplementation(async () => new Response(bytes, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length) } }))
    const result = await call('download', task)
    expect(result.ok).toBe(true); expect(readFileSync(result.data.path)).toEqual(bytes)
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('X-API-Key')
    expect((await call('download', task)).data.path).toBe(result.data.path)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('checks remote size and rejects unsupported audio before submission', async () => {
    const { fetch, call } = setup()
    fetch.mockResolvedValueOnce(new Response(new Uint8Array([0]), { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-0/250000000' } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([0]), { headers: { 'Content-Type': 'audio/ogg' } }))
    expect((await call('inspect-media', { url: 'https://example.com/a.mp4', kind: 'videos' })).error).toContain('200 MB')
    expect((await call('inspect-media', { url: 'https://example.com/a.ogg', kind: 'audios' })).error).toContain('MP3/WAV')
    expect(fetch.mock.calls[0][1].headers).toEqual({ Range: 'bytes=0-0' })
  })
  it('never forwards PiAPI credentials after redirecting to a CDN', async () => {
    const { fetch, call } = setup()
    fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://cdn.example.com/result.mp4' } })).mockResolvedValueOnce(new Response(mp4(), { headers: { 'Content-Type': 'video/mp4' } }))
    expect((await call('download', { ...task, videoUrl: 'https://api.piapi.ai/media/video' })).ok).toBe(true)
    expect(fetch.mock.calls[0][1].headers['X-API-Key']).toBe('test-key')
    expect(fetch.mock.calls[1][1].headers).not.toHaveProperty('X-API-Key')
  })
  it('rejects HTML or incomplete videos and preserves retryability', async () => {
    const { fetch, call } = setup()
    fetch.mockResolvedValueOnce(new Response('<html>waiting</html>', { headers: { 'Content-Type': 'text/html' } }))
      .mockResolvedValueOnce(new Response(mp4().subarray(0, 20), { headers: { 'Content-Type': 'video/mp4' } }))
    expect(await call('download', task)).toMatchObject({ ok: false, retryable: true })
    expect(await call('download', task)).toMatchObject({ ok: false, retryable: true })
  })
})
