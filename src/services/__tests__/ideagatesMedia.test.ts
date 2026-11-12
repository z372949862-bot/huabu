import { expect, it, vi } from 'vitest'
import { prepareIdeaGatesMedia } from '../ideagatesMedia'
const defaults = { model: 'doubao-seedance-2-5-260628', prompt: '参考素材' }
it('converts local image/video/audio into active assets, preserving roles/order and source data', async () => {
  const content = [
    { type: 'text' as const, text: '参考素材' },
    { type: 'image_url' as const, image_url: { url: 'local-upload:///a.png' }, role: 'reference_image' },
    { type: 'video_url' as const, video_url: { url: 'local-upload:///a.mp4' }, role: 'reference_video' },
    { type: 'audio_url' as const, audio_url: { url: 'local-upload:///a.wav' }, role: 'reference_audio' },
  ]
  const bridge = { prepareAsset: vi.fn(async ({ assetType }) => ({ Id: 'asset_' + assetType, Status: 'Processing' })), getAsset: vi.fn(async (Id, AssetType) => ({ Id, AssetType, Status: 'Active' })) }
  const result = await prepareIdeaGatesMedia({ ...defaults, content }, bridge, new AbortController().signal, vi.fn(), { read: vi.fn(async (_url, type) => 'data:' + type), wait: vi.fn(async () => {}) })
  expect(result.content.map(item => item.role)).toEqual(content.map(item => item.role))
  expect(result.content[1].image_url).toEqual({ url: 'asset://asset_Image' })
  expect(result.content[2].video_url).toEqual({ url: 'asset://asset_Video' })
  expect(result.content[3].audio_url).toEqual({ url: 'asset://asset_Audio' })
  expect(content[1].image_url?.url).toBe('local-upload:///a.png')
  expect(bridge.getAsset).toHaveBeenCalledTimes(3)
})
it('checks existing asset IDs by GET action and rejects wrong types or failed assets', async () => {
  const params = { ...defaults, content: [{ type: 'image_url' as const, image_url: { url: 'asset://asset_existing' }, role: 'first_frame' }] }
  const bridge = { prepareAsset: vi.fn(), getAsset: vi.fn().mockResolvedValue({ Id: 'asset_existing', Status: 'Active', AssetType: 'Video' }) }
  await expect(prepareIdeaGatesMedia(params, bridge, new AbortController().signal, vi.fn())).rejects.toThrow('不一致')
  bridge.getAsset.mockResolvedValue({ Id: 'asset_existing', Status: 'Failed', AssetType: 'Image' })
  await expect(prepareIdeaGatesMedia(params, bridge, new AbortController().signal, vi.fn())).rejects.toThrow('登记不可用')
  expect(bridge.prepareAsset).not.toHaveBeenCalled()
})
it('cancels while waiting for activation and never returns ready content', async () => {
  const controller = new AbortController()
  const bridge = { prepareAsset: vi.fn(), getAsset: vi.fn().mockResolvedValue({ Id: 'a', Status: 'Processing', AssetType: 'Image' }) }
  const work = prepareIdeaGatesMedia({ ...defaults, content: [{ type: 'image_url', image_url: { url: 'asset://a' } }] }, bridge, controller.signal, vi.fn(), { wait: async () => { controller.abort() } })
  await expect(work).rejects.toMatchObject({ name: 'AbortError' })
  expect(bridge.getAsset).toHaveBeenCalledTimes(1)
})
it('does not register plain HTTPS references and keeps signature parameters intact', async () => {
  const bridge = { prepareAsset: vi.fn(), getAsset: vi.fn() }
  const params = { ...defaults, content: [{ type: 'image_url' as const, image_url: { url: 'https://example.com/a.png?sig=123&b=4' } }] }
  expect(await prepareIdeaGatesMedia(params, bridge, new AbortController().signal, vi.fn())).toEqual(params)
  expect(bridge.prepareAsset).not.toHaveBeenCalled()
})
