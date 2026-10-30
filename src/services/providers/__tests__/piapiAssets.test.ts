import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPiapiBody, piapiPayload, PIAPI_MODEL, PiapiProvider, waitPiapiAsset, validatePrivateMedia } from '../piapi'
import { runUnmauNode } from '../unmau'
const source = 'https://example.com/actor.png', scene = 'https://example.com/scene.png'
const asset = { asset_id: 'asset-test', asset_type: 'Image', status: 'Active', url: source }
const data = { providerId: 'piapi', model: PIAPI_MODEL, prompt: '参考 @图片1', piapiPrivateReferences: { [source]: { providerId: 'piapi', mode: 'private', assetId: asset.asset_id } } }
const refs = { images: [source, scene], videos: [], audios: [] }
afterEach(() => { delete window.electronAPI; vi.restoreAllMocks(); vi.useRealTimers() })
describe('PiAPI private asset preparation', () => {
  it('waits Processing to Active before returning and surfaces rejection', async () => {
    const get = vi.fn().mockResolvedValueOnce({ ...asset, status: 'Processing' }).mockResolvedValueOnce(asset)
    const notify = vi.fn()
    expect(await waitPiapiAsset({ ...asset, status: 'Processing' }, get, undefined, notify, async () => {})).toMatchObject({ status: 'active' })
    expect(get).toHaveBeenCalledTimes(2); expect(notify).toHaveBeenCalledTimes(2)
    await expect(waitPiapiAsset({ ...asset, status: 'Failed', error: { message: '尺寸错误' } }, get)).rejects.toThrow('尺寸错误')
  })
  it('stops on abort and times out without generating', async () => {
    const controller = new AbortController(); controller.abort()
    await expect(waitPiapiAsset(asset, vi.fn(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    vi.useFakeTimers()
    await expect(waitPiapiAsset({ ...asset, status: 'Processing' }, vi.fn().mockResolvedValue({ ...asset, status: 'Processing' }), undefined, vi.fn(), async () => { vi.setSystemTime(Date.now() + 5000) }, 1000)).rejects.toThrow('仍在处理中')
  })
  it('mixes managed and raw URLs in order without uploading an existing asset', async () => {
    const provider = new PiapiProvider('test-key'), readFile = vi.fn()
    vi.spyOn(provider, 'getPrivateAsset').mockResolvedValue(asset)
    const upload = vi.spyOn(provider, 'uploadAsset')
    const body = buildPiapiBody(data, refs)
    await provider.prepareAssets(body, readFile)
    expect(body.images).toEqual(['asset://asset-test', scene])
    expect(upload).toHaveBeenCalledExactlyOnceWith(scene, expect.any(Function), undefined, 'images')
    expect(readFile).not.toHaveBeenCalled()
    expect(piapiPayload(body).input).toMatchObject({ image_urls: ['asset://asset-test', scene], auto_upload_assets: false })
    expect(piapiPayload(body)).not.toHaveProperty('privateReferences')
  })
  it('only applies bindings for the selected provider', () => {
    expect(buildPiapiBody({ ...data, providerId: 'other' }, refs)).not.toHaveProperty('privateReferences')
  })
  it('validates only private-image constraints, including strict boundaries', () => {
    expect(() => validatePrivateMedia('images', { width: 1600, height: 900, size: 1000 })).not.toThrow()
    expect(() => validatePrivateMedia('images', { width: 300, height: 500 })).toThrow('300')
    expect(() => validatePrivateMedia('images', { width: 1000, height: 2500 })).toThrow('0.4')
    expect(() => validatePrivateMedia('images', { width: 1600, height: 900, size: 30 * 1024 * 1024 })).toThrow('30 MB')
    expect(() => validatePrivateMedia('videos', { duration: 16 })).toThrow('2–15')
    expect(() => validatePrivateMedia('videos', { duration: 10, size: 51 * 1024 * 1024 })).toThrow('50 MB')
    expect(() => buildPiapiBody(data, refs)).not.toThrow()
  })
  it('rejects failed ownership/type checks and asset-only edit sources', async () => {
    const provider = new PiapiProvider('test-key')
    vi.spyOn(provider, 'getPrivateAsset').mockResolvedValue({ ...asset, asset_type: 'Video' })
    await expect(provider.prepareAssets(buildPiapiBody(data, refs), vi.fn())).rejects.toThrow('类型')
    await expect(provider.prepareAssets({ videos: ['asset://asset-test'], omni_reference_task_type: 'edit' }, vi.fn())).rejects.toThrow('源视频')
  })
  it('saves the ingested asset ID before waiting, and never submits on failure', async () => {
    const provider = new PiapiProvider('test-key')
    vi.spyOn(provider, 'prepareReferences').mockReturnValue({ images: [source], videos: [], audios: [] })
    const OriginalImage = globalThis.Image
    vi.stubGlobal('Image', class { naturalWidth = 1600; naturalHeight = 900; onload: any; set src(value: string) { queueMicrotask(() => this.onload?.()) } })
    const ensurePrivateAsset = vi.fn().mockResolvedValue({ ok: true, data: { ...asset, status: 'Failed', error: { message: '平台拒绝入库' } } })
    window.electronAPI = { piapi: { inspectMedia: vi.fn().mockResolvedValue({ ok: true, data: { size: 1000 } }), ensurePrivateAsset } } as any
    const update = vi.fn(), persist = vi.fn(), fail = vi.fn(), create = vi.spyOn(provider, 'createTask')
    try {
      await runUnmauNode({ id: 'private-test', data: { ...data, piapiPrivateReferences: { [source]: { providerId: 'piapi', mode: 'private' } } }, nodes: [], edges: [], provider, readFile: vi.fn(), update, persist, fail, complete: vi.fn(), isCurrent: () => true, wait: async () => {} })
      expect(update).toHaveBeenCalledWith({ piapiPrivateReferences: { [source]: { providerId: 'piapi', mode: 'private', assetId: 'asset-test' } } })
      expect(persist).toHaveBeenCalled(); expect(fail).toHaveBeenCalledWith(expect.stringContaining('平台拒绝入库')); expect(create).not.toHaveBeenCalled()
    } finally { vi.stubGlobal('Image', OriginalImage) }
  })
  it('re-ingests an expired binding only when the original source remains', async () => {
    const provider = new PiapiProvider('test-key'), update = vi.fn()
    vi.spyOn(provider, 'getPrivateAsset').mockRejectedValue(Object.assign(new Error('expired'), { status: 404 }))
    const OriginalImage = globalThis.Image
    vi.stubGlobal('Image', class { naturalWidth = 1600; naturalHeight = 900; onload: any; set src(value: string) { queueMicrotask(() => this.onload?.()) } })
    const ensurePrivateAsset = vi.fn().mockResolvedValue({ ok: true, data: { ...asset, asset_id: 'asset-renewed' } })
    window.electronAPI = { piapi: { inspectMedia: vi.fn().mockResolvedValue({ ok: true, data: { size: 1000 } }), ensurePrivateAsset } } as any
    try {
      const body = buildPiapiBody(data, { ...refs, images: [source] })
      await provider.prepareAssets(body, vi.fn(), undefined, { savePrivateReferences: update })
      expect(body.images).toEqual(['asset://asset-renewed']); expect(ensurePrivateAsset).toHaveBeenCalledTimes(1)
      await expect(provider.prepareAssets({ images: ['asset://asset-test'] }, vi.fn())).rejects.toThrow('expired')
    } finally { vi.stubGlobal('Image', OriginalImage) }
  })
  it('resumes a durable task even when original references are missing', async () => {
    const provider = new PiapiProvider('test-key'), complete = vi.fn(), fail = vi.fn()
    const prepare = vi.spyOn(provider, 'prepareReferences'), create = vi.spyOn(provider, 'createTask')
    vi.spyOn(provider, 'getTaskStatus').mockResolvedValue({ status: 'completed', videoUrl: 'https://example.com/final.mp4' })
    vi.spyOn(provider, 'download').mockResolvedValue('local-upload:///result.mp4')
    const pending = provider.pendingTask('task-existing', buildPiapiBody(data, refs), data)
    await runUnmauNode({ id: 'resume-test', data: { ...data, ...pending, prompt: '@[missing](gone)', taskId: 'task-existing' }, nodes: [], edges: [], provider, readFile: vi.fn(), update: vi.fn(), persist: vi.fn(), fail, complete, isCurrent: () => true, wait: async () => {} })
    expect(prepare).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled(); expect(complete).toHaveBeenCalledOnce()
    expect(JSON.stringify(pending)).not.toContain('test-key')
  })
})
