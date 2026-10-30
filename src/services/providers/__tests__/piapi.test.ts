import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPiapiBody, mapPiapiTask, piapiPayload, PiapiProvider, PIAPI_MODEL, publicMediaUrl, validateLocalFile, validateMediaDuration } from '../piapi'
import { runUnmauNode } from '../unmau'
const defaults = { model: PIAPI_MODEL, prompt: '镜头缓慢推进' }
const empty = { images: [], videos: [], audios: [] }
const url = 'https://media.example.com/source.mp4'
afterEach(() => { delete window.electronAPI; vi.restoreAllMocks() })

describe('PiAPI documented payload', () => {
  it('maps catalog ID to seedance task_type with documented defaults', () => {
    expect(piapiPayload(buildPiapiBody(defaults, empty))).toEqual({ model: 'seedance', task_type: PIAPI_MODEL, input: { prompt: defaults.prompt, duration: 5, aspect_ratio: '16:9', resolution: '720p', omni_reference_task_type: 'reference', auto_upload_assets: false, mode: 'text_to_video' } })
  })
  it.each([4, 5, 15, 30])('supports %s seconds', duration => expect(buildPiapiBody({ ...defaults, duration }, empty).duration).toBe(duration))
  it.each([-1, 0, 3, 31, 4.5, NaN])('rejects invalid duration %s before submission', duration => expect(() => buildPiapiBody({ ...defaults, duration }, empty)).toThrow('4–30'))
  it.each(['480p', '720p', '1080p'])('supports %s', resolution => expect(buildPiapiBody({ ...defaults, resolution }, empty).resolution).toBe(resolution))
  it('rejects 4K, empty and long prompts', () => {
    expect(() => buildPiapiBody({ ...defaults, resolution: '4K' }, empty)).toThrow('1080p')
    expect(() => buildPiapiBody({ ...defaults, prompt: ' ' }, empty)).toThrow('提示词')
    expect(() => buildPiapiBody({ ...defaults, prompt: '字'.repeat(4001) }, empty)).toThrow('4000')
  })
  it('supports audio-only references without inventing generation audio fields', () => {
    const payload = piapiPayload(buildPiapiBody({ ...defaults, prompt: '参考 @audio1' }, { ...empty, audios: ['https://media.example.com/a.mp3'] }))
    expect(payload.input.mode).toBe('omni_reference')
    expect(payload.input.audio_urls).toHaveLength(1)
    expect(payload.input).not.toHaveProperty('generate_audio')
  })
  it('forces edit adaptive ratio, duration -1 and raw readable source', () => {
    const body = buildPiapiBody({ ...defaults, videoMode: 'edit', ratio: '16:9', duration: 10 }, { ...empty, videos: [url] })
    expect(piapiPayload(body).input).toMatchObject({ duration: -1, aspect_ratio: 'adaptive', omni_reference_task_type: 'edit', auto_upload_assets: false, video_urls: [url] })
  })
  it('preserves total target duration for extension', () => {
    expect(buildPiapiBody({ ...defaults, videoMode: 'extend', duration: 20 }, { ...empty, videos: [url] })).toMatchObject({ duration: 20, aspect_ratio: 'adaptive' })
    expect(() => buildPiapiBody({ ...defaults, videoMode: 'extend' }, empty)).toThrow('至少一段')
  })
  it.each([['images', 31], ['videos', 11], ['audios', 11]])('checks %s count', (field, count) => {
    expect(() => buildPiapiBody(defaults, { ...empty, [field]: Array.from({ length: Number(count) }, (_, i) => 'https://example.com/' + i) })).toThrow('最多')
  })
  it('keeps mention identities aligned with connected and uploaded references', () => {
    const data = { ...defaults, prompt: '@[B](node_b) 与 @[A](node_a) 和 @[音乐](music)', _uploads: [{ id: 'music', type: 'audio', url: 'https://example.com/a.mp3' }], inputImages: ['https://example.com/b.png', 'https://example.com/a.png'] }
    const nodes = [{ id: 'a', type: 'asset-ref', data: { assetType: 'image', assetUrl: 'https://example.com/a.png' } }, { id: 'b', type: 'asset-ref', data: { assetType: 'image', assetUrl: 'https://example.com/b.png' } }]
    const refs = new PiapiProvider().prepareReferences(data, nodes, [{ source: 'a', target: 'out' }, { source: 'b', target: 'out' }], 'out')
    expect(refs.images).toEqual(['https://example.com/a.png', 'https://example.com/b.png'])
    expect(buildPiapiBody(data, refs).prompt).toBe('@图片2 与 @图片1 和 @音频1')
  })
  it('rejects missing numeric references and stale canvas mentions', () => {
    expect(() => buildPiapiBody({ ...defaults, prompt: '@image2' }, { ...empty, images: ['https://example.com/a.png'] })).toThrow('没有对应素材')
    expect(() => new PiapiProvider().prepareReferences({ ...defaults, prompt: '@[已删除](node_missing)' }, [], [], 'out')).toThrow('已失效')
  })
})
describe('PiAPI media rules and task mapping', () => {
  it.each(['staged', 'pending', 'processing', 'completed', 'failed'])('maps %s status', status => {
    const mapped = mapPiapiTask({ data: { status, output: { video: url }, error: { message: '平台失败原因' } } })
    expect(mapped.status).toBe(status === 'staged' ? 'pending' : status)
    if (status === 'failed') { expect(mapped.error).toBe('平台失败原因'); expect(mapped.videoUrl).toBeUndefined() }
    if (status === 'completed') expect(mapped.videoUrl).toBe(url)
  })
  it('does not guess success from progress or accept error text as video', () => {
    expect(() => mapPiapiTask({ data: { progress: '100%' } })).toThrow('任务状态')
    expect(mapPiapiTask({ data: { status: 'completed', output: { video: 'not a URL' } } }).videoUrl).toBeUndefined()
    expect(publicMediaUrl('https://user:secret@example.com/a.mp4')).toBe(false)
  })
  it('validates edit duration and upload limits', () => {
    expect(() => validateMediaDuration('videos', 3, 'edit')).toThrow('4–30')
    expect(() => validateMediaDuration('videos', 3, 'reference')).not.toThrow()
    expect(() => validateMediaDuration('audios', 31, 'reference')).toThrow('2–30')
    expect(() => validateLocalFile({ size: 8 * 1024 * 1024, name: 'a.png' }, 'images')).toThrow('10 MB')
    expect(() => validateLocalFile({ size: 10, name: 'a.mov' }, 'videos')).toThrow('MOV')
    expect(() => validateLocalFile({ size: 10, name: 'a.jpg' }, 'images')).not.toThrow()
  })
})
describe('PiAPI lifecycle without live billing', () => {
  it('tests credentials through account info only', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, data: {} })
    window.electronAPI = { piapi: { request } } as any
    expect(await new PiapiProvider().testAuth('test-key')).toEqual({ success: true })
    expect(request).toHaveBeenCalledExactlyOnceWith({ apiKey: 'test-key', path: '/account/info' })
  })
  it('does not resubmit a POST after an ambiguous network failure', async () => {
    const request = vi.fn().mockResolvedValue({ ok: false, error: '请到平台确认', retryable: false })
    window.electronAPI = { piapi: { request } } as any
    const fail = vi.fn()
    await runUnmauNode({ id: 'out', data: defaults, nodes: [], edges: [], provider: new PiapiProvider('test-key'), readFile: vi.fn(), update: vi.fn(), complete: vi.fn(), fail, isCurrent: () => true, persist: vi.fn(), wait: async () => {} })
    expect(request).toHaveBeenCalledTimes(1)
    expect(fail).toHaveBeenCalledWith('请到平台确认')
  })
  it('resumes the original task and downloads output.video without re-upload or POST', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, data: { data: { status: 'completed', output: { video: url } } } })
    const upload = vi.fn(), download = vi.fn().mockResolvedValue({ ok: true, data: { path: 'C:/cache/output.mp4' } })
    window.electronAPI = { piapi: { request, upload, download } } as any
    const complete = vi.fn(), fail = vi.fn()
    await runUnmauNode({ id: 'out', data: { ...defaults, taskId: 'task_existing' }, nodes: [], edges: [], provider: new PiapiProvider('test-key'), readFile: vi.fn(), update: vi.fn(), complete, fail, isCurrent: () => true, persist: vi.fn(), wait: async () => {} })
    expect(request).toHaveBeenCalledExactlyOnceWith({ apiKey: 'test-key', path: '/api/v1/task/task_existing' })
    expect(upload).not.toHaveBeenCalled()
    expect(fail).not.toHaveBeenCalled()
    expect(complete.mock.calls[0][0]).toBe('local-upload:///C:/cache/output.mp4')
  })
})
