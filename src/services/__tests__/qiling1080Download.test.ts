// @vitest-environment node
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const register = require('../../../electron/qiling.cjs')
const directories: string[] = []
const JS = 'SD2.5-满血-JS-1080P'
const GF = 'SD2.5-满血-GF-1080P'

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'qiling-download-test-'))
  directories.push(directory)
  const handlers = new Map<string, Function>()
  const fetch = vi.fn().mockImplementation(async () => new Response('offline-video', {
    headers: { 'Content-Type': 'video/mp4' },
  }))
  register({
    ipcMain: { handle: (key: string, handler: Function) => handlers.set(key, handler) },
    net: { fetch },
    app: { getPath: () => directory },
  })
  return { download: handlers.get('qiling:download')!, fetch }
}

describe('Qiling 1080P native downloads', () => {
  it.each([JS, GF])('prefers the signed returned URL for %s without sending credentials to the CDN', async model => {
    const { download, fetch } = setup()
    const videoUrl = 'https://cdn.example.com/video.mp4?signature=a%2Fb%3D&expires=123'
    const result = await download(null, { apiKey: 'offline-key', taskId: 'task', videoUrl, model })
    expect(result.ok).toBe(true)
    expect(readFileSync(result.data.path, 'utf8')).toBe('offline-video')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe(videoUrl)
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
  })

  it('waits for a GF returned URL instead of inventing a content endpoint', async () => {
    const { download, fetch } = setup()
    const result = await download(null, { apiKey: 'offline-key', taskId: 'task', model: GF })
    expect(result).toMatchObject({ ok: false, retryable: true })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('falls back to the authenticated legacy content endpoint for JS only', async () => {
    const { download, fetch } = setup()
    fetch.mockResolvedValueOnce(new Response('', { status: 404 }))
    const result = await download(null, {
      apiKey: 'offline-key', taskId: 'task/a', videoUrl: 'https://cdn.example.com/expired.mp4', model: JS,
    })
    expect(result.ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1][0]).toBe('https://api.qilingze.com/v1/videos/task%2Fa/content')
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer offline-key')
  })

  it('preserves content-first downloading for existing models', async () => {
    const { download, fetch } = setup()
    const result = await download(null, {
      apiKey: 'offline-key', taskId: 'existing', videoUrl: 'https://cdn.example.com/old.mp4', model: 'SD2.5-满血-GF-720P',
    })
    expect(result.ok).toBe(true)
    expect(fetch.mock.calls[0][0]).toBe('https://api.qilingze.com/v1/videos/existing/content')
  })
})
