// @vitest-environment node
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
const require = createRequire(import.meta.url)
const register = require('../../../../electron/ideagates.cjs')
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const json = (raw: any, status = 200, headers = {}) => new Response(JSON.stringify(raw), { status, headers: { 'Content-Type': 'application/json', ...headers } })
const body = { model: 'doubao-seedance-2-5-260628', content: [{ type: 'text', text: '海浪移动' }], duration: 5, resolution: '720p', ratio: '16:9', generate_audio: false }
function setup() {
  const handlers = new Map<string, any>(), fetch = vi.fn(), root = mkdtempSync(path.join(tmpdir(), 'idea-test-')); roots.push(root)
  register({ ipcMain: { handle: (key: string, fn: any) => handlers.set(key, fn) }, net: { fetch }, app: { getPath: () => root } })
  return { fetch, root, call: (channel: string, args: any) => handlers.get('ideagates:' + channel)(null, { apiKey: 'sk-test', group: 'ideagates', ...args }) }
}
describe('IDEA Gates desktop transport', () => {
  it('preserves a failed task with its native error as a terminal response, not a transport failure', async () => {
    const { fetch, call } = setup()
    const raw = { id: 'task_failed', status: 'failed', error: { code: 'invalid_media', message: 'media rejected' } }
    fetch.mockResolvedValue(json(raw))
    expect(await call('request', { path: '/contents/generations/tasks/task_failed' })).toMatchObject({ ok: true, data: { raw } })
  })
  it('submits native JSON once and archives request/response without credentials', async () => {
    const { fetch, call, root } = setup(); fetch.mockResolvedValue(json({ id: 'task_1', extra: 0 }))
    const result = await call('request', { path: '/contents/generations/tasks', body })
    expect(result.ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe('https://ideagates.com/v1/contents/generations/tasks')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(body)
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-test')
    const dir = path.join(root, 'ideagates-tasks'), record = readFileSync(path.join(dir, readdirSync(dir)[0]), 'utf8')
    expect(record).not.toContain('sk-test')
    expect(JSON.parse(record)).toMatchObject({ request: body, response: { id: 'task_1', extra: 0 } })
  })
  it('rejects wrong group/model/resolution, HTTP media and wrong task key before network', async () => {
    const { fetch, call } = setup()
    for (const patch of [{ model: 'doubao-seedance-2-0-260128' }, { model: 'dreamina-seedance-2-5' }, { resolution: '1080p' }, { content: [...body.content, { type: 'image_url', image_url: { url: 'http://example.com/a.png' }, role: 'reference_image' }] }]) expect((await call('request', { path: '/contents/generations/tasks', body: { ...body, ...patch } })).ok).toBe(false)
    expect((await call('request', { path: '/contents/generations/tasks/task_1', keyFingerprint: 'other' })).error).toContain('同一个 Key')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('does not retry uncertain POST and honors Retry-After for GET', async () => {
    const { fetch, call } = setup(); fetch.mockRejectedValueOnce(new TypeError('network'))
    expect(await call('request', { path: '/contents/generations/tasks', body })).toMatchObject({ ok: false, retryable: false, uncertain: true })
    expect(fetch).toHaveBeenCalledTimes(1)
    fetch.mockResolvedValue(json({ error: { message: 'slow down' } }, 429, { 'Retry-After': '30' }))
    expect(await call('request', { path: '/contents/generations/tasks/task_1' })).toMatchObject({ retryable: true, retryAfterMs: 30000 })
  })
  it('downloads redirects and preserves signed query parameters without credentials', async () => {
    const { fetch, call } = setup(); const bytes = Buffer.alloc(2048, 1)
    fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://cdn.example.com/video.mp4?sig=abc&expires=5' } })).mockResolvedValueOnce(new Response(bytes, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': '2048' } }))
    const result = await call('download', { taskId: 'task_1', videoUrl: 'https://ideagates.com/video?sig=first' })
    expect(result.ok).toBe(true)
    expect(readFileSync(result.data.path)).toEqual(bytes)
    expect(fetch.mock.calls[1][0]).toContain('?sig=abc&expires=5')
    for (const [, init] of fetch.mock.calls) expect(init.headers).not.toHaveProperty('Authorization')
  })
})
