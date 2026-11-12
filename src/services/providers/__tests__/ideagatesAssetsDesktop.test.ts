// @vitest-environment node
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
const register = createRequire(import.meta.url)('../../../../electron/ideagates.cjs')
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
function setup(root = mkdtempSync(path.join(tmpdir(), 'idea-assets-'))) {
  if (!roots.includes(root)) roots.push(root)
  const handlers = new Map<string, any>(), fetch = vi.fn()
  register({ ipcMain: { handle: (name: string, fn: any) => handlers.set(name, fn) }, net: { fetch }, app: { getPath: () => root } })
  return { root, fetch, call: (channel: string, args: any = {}) => handlers.get('ideagates:' + channel)(null, { apiKey: 'sk-test', group: 'ideagates', ...args }) }
}
const local = { dataUrl: 'data:image/png;base64,aGVsbG8=', assetType: 'Image' }
it('stages local bytes without credentials, registers with persisted idempotency keys, and reuses the ID after restart', async () => {
  const first = setup()
  first.fetch.mockImplementation(async (url: string) => {
    if (url.includes('imageproxy.')) return json({ url: 'https://imageproxy.zhongzhuan.chat/ref.png' })
    if (url.endsWith('/asset/groups')) return json({ result: { Id: 'group_test' } })
    if (url.endsWith('/asset/create')) return json({ result: { Id: 'asset_test', Status: 'Processing' } })
    return json({ result: { Id: 'asset_test', GroupId: 'group_test', AssetType: 'Image', Status: 'Active' } })
  })
  expect(await first.call('prepare-asset', local)).toMatchObject({ ok: true, data: { asset: { Id: 'asset_test', Status: 'Processing' } } })
  const upload = first.fetch.mock.calls.find(([url]) => url.includes('imageproxy.'))!
  expect(upload[1].headers).toBeUndefined()
  const creates = first.fetch.mock.calls.filter(([url]) => url.includes('/asset/'))
  expect(creates).toHaveLength(2)
  for (const [, options] of creates) expect(options.headers['Idempotency-Key']).toBeTruthy()
  const second = setup(first.root)
  second.fetch.mockResolvedValue(json({ result: { Id: 'asset_test', AssetType: 'Image', Status: 'Active' } }))
  expect(await second.call('prepare-asset', local)).toMatchObject({ ok: true, data: { asset: { Id: 'asset_test' } } })
  expect(second.fetch).toHaveBeenCalledTimes(1)
  expect(second.fetch.mock.calls[0][0]).toMatch(/\/asset\/get$/)
})
it('reuses exact idempotency key/body after ambiguous registration and across restart', async () => {
  const first = setup()
  first.fetch.mockResolvedValueOnce(json({ result: { Id: 'group_test' } }))
    .mockResolvedValueOnce(json({ url: 'https://example.com/signed.png?sig=original' }))
    .mockRejectedValueOnce(new TypeError('connection lost'))
  expect(await first.call('prepare-asset', local)).toMatchObject({ ok: false, retryable: true, uncertain: false })
  const submitted = first.fetch.mock.calls[2][1]
  const restarted = setup(first.root)
  restarted.fetch.mockResolvedValue(json({ result: { Id: 'asset_retry', Status: 'Processing' } }))
  expect((await restarted.call('prepare-asset', local)).ok).toBe(true)
  expect(restarted.fetch).toHaveBeenCalledTimes(1)
  expect(restarted.fetch.mock.calls[0][1].body).toBe(submitted.body)
  expect(restarted.fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe(submitted.headers['Idempotency-Key'])
})
it('keeps different Keys and groups isolated; unsupported overseas does not upload local bytes', async () => {
  const { fetch, call } = setup()
  fetch.mockResolvedValue(json({ error: { code: 'unavailable', message: '素材库未开放' } }, 503))
  const result = await call('prepare-asset', { ...local, group: 'ideagates-overseas' })
  expect(result).toMatchObject({ ok: false, status: 503, uncertain: false })
  expect(result.error).toContain('未开放')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0][0]).toMatch(/\/asset\/groups$/)
  const key1 = fetch.mock.calls[0][1].headers['Idempotency-Key']
  await call('prepare-asset', { ...local, group: 'ideagates-overseas', apiKey: 'sk-other' })
  expect(fetch.mock.calls[1][1].headers['Idempotency-Key']).not.toBe(key1)
})
it('distinguishes pending ingestion from body conflicts and supports uppercase Result', async () => {
  const { fetch, call } = setup()
  fetch.mockResolvedValueOnce(json({ error: { code: 'seedance_asset_submission_pending', message: 'pending' } }, 409))
    .mockResolvedValueOnce(json({ error: { code: 'idempotency_conflict', message: 'conflict' } }, 409))
  expect(await call('prepare-asset', local)).toMatchObject({ retryable: true })
  expect(await call('prepare-asset', local)).toMatchObject({ retryable: false })
  expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetch.mock.calls[1][1].headers['Idempotency-Key'])
  fetch.mockResolvedValue(json({ Result: { Id: 'asset_test', Status: 'Active', AssetType: 'Image' } }))
  expect(await call('get-asset', { id: 'asset_test', assetType: 'Image' })).toMatchObject({ ok: true, data: { asset: { Status: 'Active' } } })
  expect(fetch.mock.lastCall?.[1].method).toBe('POST')
})
it('renews a definitively failed local asset, but does not recreate one after a query network failure', async () => {
  const { fetch, call } = setup()
  fetch.mockResolvedValueOnce(json({ result: { Id: 'group_old' } })).mockResolvedValueOnce(json({ url: 'https://example.com/a.png' }))
    .mockResolvedValueOnce(json({ result: { Id: 'asset_old', Status: 'Processing' } }))
  await call('prepare-asset', local)
  const originalKey = fetch.mock.calls[2][1].headers['Idempotency-Key']
  fetch.mockRejectedValueOnce(new TypeError('network'))
  expect((await call('prepare-asset', local)).ok).toBe(false)
  expect(fetch).toHaveBeenCalledTimes(4)
  fetch.mockResolvedValueOnce(json({ result: { Id: 'asset_old', Status: 'Failed', AssetType: 'Image' } }))
    .mockResolvedValueOnce(json({ result: { Id: 'group_old' } }))
    .mockResolvedValueOnce(json({ result: { Id: 'asset_new', Status: 'Processing' } }))
  expect(await call('prepare-asset', local)).toMatchObject({ ok: true, data: { asset: { Id: 'asset_new' } } })
  expect(fetch.mock.lastCall?.[1].headers['Idempotency-Key']).not.toBe(originalKey)
})
it('recreates a confirmed deleted group and asset with fresh keys', async () => {
  const { fetch, call } = setup()
  fetch.mockResolvedValueOnce(json({ result: { Id: 'group_old' } })).mockResolvedValueOnce(json({ url: 'https://example.com/a.png' }))
    .mockResolvedValueOnce(json({ result: { Id: 'asset_old' } }))
  await call('prepare-asset', local)
  const key = fetch.mock.calls[0][1].headers['Idempotency-Key']
  fetch.mockResolvedValueOnce(json({ error: { code: 'seedance_asset_not_found' } }, 404))
    .mockResolvedValueOnce(json({ error: { code: 'seedance_asset_not_found' } }, 404))
    .mockResolvedValueOnce(json({ result: { Id: 'group_new' } }))
    .mockResolvedValueOnce(json({ result: { Id: 'asset_new' } }))
  expect((await call('prepare-asset', local)).ok).toBe(true)
  expect(fetch.mock.calls[5][1].headers['Idempotency-Key']).not.toBe(key)
  expect(JSON.parse(fetch.mock.calls[6][1].body).group_id).toBe('group_new')
})
it('recovers a deleted cached group when registering a new file', async () => {
  const { fetch, call } = setup()
  fetch.mockResolvedValueOnce(json({ result: { Id: 'group_old' } })).mockResolvedValueOnce(json({ url: 'https://example.com/a.png' }))
    .mockResolvedValueOnce(json({ result: { Id: 'asset_old' } }))
  await call('prepare-asset', local)
  const another = { url: 'https://example.com/another.png', assetType: 'Image' }
  fetch.mockResolvedValueOnce(json({ error: { code: 'seedance_asset_group_not_found' } }, 404))
    .mockResolvedValueOnce(json({ error: { code: 'seedance_asset_not_found' } }, 404))
  expect(await call('prepare-asset', another)).toMatchObject({ ok: false, retryable: true })
  fetch.mockResolvedValueOnce(json({ result: { Id: 'group_new' } })).mockResolvedValueOnce(json({ result: { Id: 'asset_new' } }))
  expect((await call('prepare-asset', another)).ok).toBe(true)
  expect(JSON.parse(fetch.mock.lastCall?.[1].body).group_id).toBe('group_new')
})
