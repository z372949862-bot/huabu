import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildIdeaGatesBody, IdeaGatesProvider, mapIdeaGatesTask, validateIdeaGatesMedia } from '../ideagates'
const params = { model: 'doubao-seedance-2-5-260628', prompt: '海浪缓慢向岸边移动', duration: 5, ratio: '16:9', resolution: '720p' }
afterEach(() => vi.unstubAllGlobals())
describe('IDEA Gates native video protocol', () => {
  it('preserves explicit false, native content roles and signed media URL', () => {
    const content = [{ type: 'text' as const, text: '沿用参考视频' }, { type: 'video_url' as const, video_url: { url: 'https://example.com/ref.mp4?a=1&sig=abc' }, role: 'reference_video' }]
    const body = buildIdeaGatesBody({ ...params, content, generate_audio: false, returnLastFrame: false }, 'ideagates')
    expect(body).toMatchObject({ content, generate_audio: false, return_last_frame: false, omni_reference_task_type: 'reference' })
  })
  it('uses the overseas model only with the overseas group', () => {
    expect(buildIdeaGatesBody({ ...params, model: 'dreamina-seedance-2-5' }, 'ideagates-overseas').model).toBe('dreamina-seedance-2-5')
    expect(() => buildIdeaGatesBody(params, 'ideagates-overseas')).toThrow('分组')
    expect(() => buildIdeaGatesBody({ ...params, resolution: '1080p' }, 'ideagates')).toThrow('720p')
  })
  it('sends edit duration -1 and extend total duration with adaptive ratio', () => {
    const content = [{ type: 'video_url' as const, video_url: { url: 'asset://asset_source' }, role: 'reference_video' }]
    expect(buildIdeaGatesBody({ ...params, mode: 'edit', content }, 'ideagates')).toMatchObject({ duration: -1, ratio: 'adaptive', omni_reference_task_type: 'edit' })
    expect(buildIdeaGatesBody({ ...params, mode: 'extend', duration: 12, content }, 'ideagates')).toMatchObject({ duration: 12, ratio: 'adaptive', omni_reference_task_type: 'extend' })
    expect(() => buildIdeaGatesBody({ ...params, mode: 'edit' }, 'ideagates')).toThrow('参考视频')
  })
  it.each([3, 31, 4.5, -1])('rejects invalid generation duration %s', duration => expect(() => buildIdeaGatesBody({ ...params, duration }, 'ideagates')).toThrow('时长'))
  it('keeps first/last frames separate from omni references', () => {
    const first = { type: 'image_url' as const, image_url: { url: 'https://example.com/a.png' }, role: 'first_frame' }
    const last = { ...first, role: 'last_frame' }
    expect(buildIdeaGatesBody({ ...params, content: [first, last] }, 'ideagates').content).toContainEqual(last)
    expect(() => buildIdeaGatesBody({ ...params, content: [last] }, 'ideagates')).toThrow('首尾帧')
    expect(() => buildIdeaGatesBody({ ...params, content: [first, { ...first, role: 'reference_image' }] }, 'ideagates')).toThrow('混用')
  })
  it.each(['http://example.com/a.png', 'local-upload:///C:/a.png', 'https://127.0.0.1/a', 'data:image/png;base64,abc'])('rejects unsupported reference %s', url => expect(() => validateIdeaGatesMedia(url)).toThrow())
  it.each(['doubao-id', 'cgt_id'])('retains the entire response and %s trace ID', field => {
    const raw = { status: 'succeeded', [field]: 'cgt-original', content: { video_url: 'https://example.com/video.mp4?sig=x', last_frame_url: 'https://example.com/frame.png' }, usage: { total_tokens: 123 }, extension: false }
    expect(mapIdeaGatesTask(raw)).toMatchObject({ status: 'completed', raw, traceId: 'cgt-original', videoUrl: raw.content.video_url })
  })
  it.each(['failed', 'cancelled', 'expired'])('treats %s as a terminal failure', status => expect(mapIdeaGatesTask({ status }).status).toBe('failed'))
  it('checks models without generating, then checks current capability before exactly one POST', async () => {
    const request = vi.fn(async args => ({ ok: true, data: { raw: args.path === '/models' ? { data: [{ id: params.model, video: { resolutions: ['720p'], max_images: 9 } }] } : { id: 'task_saved' }, keyFingerprint: 'fingerprint' } }))
    vi.stubGlobal('electronAPI', { ideagates: { request } })
    const provider = new IdeaGatesProvider('sk-test')
    expect(await provider.testAuth('sk-test')).toEqual({ success: true })
    expect(request.mock.calls.every(([args]) => args.path === '/models')).toBe(true)
    expect(await provider.createTask(params)).toMatchObject({ taskId: 'task_saved', keyFingerprint: 'fingerprint' })
    expect(request.mock.calls.filter(([args]) => args.body)).toHaveLength(1)
  })
  it('does not create when the key lacks the required model/720p capability', async () => {
    const request = vi.fn(async () => ({ ok: true, data: { raw: { data: [{ id: params.model, video: { resolutions: ['1080p'] } }] } } }))
    vi.stubGlobal('electronAPI', { ideagates: { request } })
    await expect(new IdeaGatesProvider('sk-test').createTask(params)).rejects.toThrow('权限')
    expect(request).toHaveBeenCalledTimes(1)
  })
})
