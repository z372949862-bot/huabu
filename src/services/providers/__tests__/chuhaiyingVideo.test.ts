import { describe, expect, it } from 'vitest'
import { ChuhaiyingVideoProvider, mapVideoTaskResponse } from '../chuhaiyingVideo'
import { QILING_VIDEO_MODEL_TEMPLATES } from '../../modelTemplates'

const apiKey = 'sk-' + 'x'.repeat(24)

async function captureCreate(model: string, extra: Record<string, unknown> = {}) {
  const originalFetch = globalThis.fetch
  let requestBody: any
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body || '{}'))
    return new Response(JSON.stringify({ data: { id: 'task_qiling_1' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const provider = new ChuhaiyingVideoProvider(apiKey, 'https://api.qilingze.com')
    const result = await provider.createTask({ model, prompt: '镜头向前推进', ...extra })
    expect(result).toEqual({ taskId: 'task_qiling_1' })
    return requestBody
  } finally {
    globalThis.fetch = originalFetch
  }
}

describe('Qiling Seedance 2.5 models', () => {
  it('keeps generated videos accessible while flagging reference error feedback', () => {
    const result = mapVideoTaskResponse({ status: 'SUCCESS', data: {
      status: 'completed', video_url: 'https://example.com/video.mp4',
      images: ['生成失败：请重新提交任务。请检查上传的素材和引用的格式符合标准。'],
    } }, true)
    expect(result.status).toBe('completed')
    expect(result.videoUrl).toBe('https://example.com/video.mp4')
    expect(result.warning).toContain('无法确认素材是否被正常使用')
  })

  it('does not let outer success hide an explicit upstream failure', () => {
    const result = mapVideoTaskResponse({ status: 'SUCCESS', data: {
      status: 'failed', error: { message: '参考素材加载失败' },
    } }, true)
    expect(result.status).toBe('failed')
    expect(result.error).toBe('参考素材加载失败')
  })

  it('does not flag valid references or missing echo fields', () => {
    expect(mapVideoTaskResponse({ status: 'completed', images: ['https://example.com/image.png'] }, true).warning).toBeUndefined()
    expect(mapVideoTaskResponse({ status: 'completed' }, true).warning).toBeUndefined()
  })

  it('exposes only the current Qiling Seedance 2.5 catalog', () => {
    const ids = QILING_VIDEO_MODEL_TEMPLATES.map((model) => model.id)
    expect(ids).toContain('SD2.5-满血-CB-720P')
    expect(ids).toContain('SD2.5-满血-HN-720P')
    expect(ids).toContain('SD2.5-满血-CB-720P-备用')
    expect(ids.some((id) => /^(?:sd2-|SD2\.0-)/i.test(id))).toBe(false)
  })

  it('sends images, videos and audios to the XG model', async () => {
    const body = await captureCreate('SD2.5-满血-XG-720P', {
      ratio: '16:9',
      duration: 12,
      generate_audio: true,
      content: [
        { type: 'image_url', image_url: { url: 'https://example.com/ref.png' } },
        { type: 'video_url', video_url: { url: 'https://example.com/source.mp4' } },
        { type: 'audio_url', audio_url: { url: 'https://example.com/music.mp3' } },
      ],
    })

    expect(body).toMatchObject({
      model: 'SD2.5-满血-XG-720P',
      prompt: '镜头向前推进',
      aspect_ratio: '16:9',
      duration: 12,
      images: ['https://example.com/ref.png'],
      videos: ['https://example.com/source.mp4'],
      audios: ['https://example.com/music.mp3'],
      generate_audio: true,
    })
    expect(body.metadata).toBeUndefined()
    expect(body.resolution).toBeUndefined()
  })

  it('forces the CB route to 30 seconds', async () => {
    const body = await captureCreate('SD2.5-满血-CB-720P', { duration: 8, generate_audio: true, image_urls: ['https://example.com/person.png'] })
    expect(body).toEqual({ model: 'SD2.5-满血-CB-720P', prompt: '镜头向前推进', duration: 30, aspect_ratio: '16:9', images: ['https://example.com/person.png'] })
  })

  it.each([5, 10, 15, 30])('submits CB backup at %s seconds with the bound prompt and clean image payload', async duration => {
    const body = await captureCreate('SD2.5-满血-CB-720P-备用', {
      duration, ratio: '9:16', prompt: '角色：@图片1是沈知意。\n内容：端起茶杯。',
      generate_audio: true, resolution: '720p', image_urls: ['https://example.com/person.png'],
    })
    expect(body).toEqual({ model: 'SD2.5-满血-CB-720P-备用', prompt: '角色：@图片1是沈知意。\n内容：端起茶杯。', duration, aspect_ratio: '9:16', images: ['https://example.com/person.png'] })
  })

  it('defaults unsupported CB backup durations to 30 seconds and rejects unsupported ratios', async () => {
    expect((await captureCreate('SD2.5-满血-CB-720P-备用', { duration: 20 })).duration).toBe(30)
    await expect(captureCreate('SD2.5-满血-CB-720P-备用', { ratio: '21:9' })).rejects.toThrow('只支持 16:9')
  })

  it('uses the HN seconds field and supported duration values', async () => {
    const body = await captureCreate('SD2.5-满血-HN-720P', {
      duration: 20,
      generate_audio: true,
      content: [
        { type: 'image_url', image_url: { url: 'https://example.com/ref.png' } },
      ],
    })

    expect(body).toMatchObject({
      model: 'SD2.5-满血-HN-720P',
      seconds: '20',
      images: ['https://example.com/ref.png'],
    })
    expect(body.duration).toBeUndefined()
    expect(body.generate_audio).toBeUndefined()
  })

  it('forces the JL route to 30 seconds', async () => {
    const body = await captureCreate('SD2.5-满血-JL-720P', { duration: 4 })
    expect(body.duration).toBe(30)
  })

  it.each(['SD2.5-满血-CB-720P', 'SD2.5-满血-CB-720P-备用', 'SD2.5-满血-HN-720P'])('rejects unsupported video/audio references for %s before submitting', async model => {
    await expect(captureCreate(model, { content: [{ type: 'video_url', video_url: 'https://example.com/source.mp4' }] })).rejects.toThrow('多媒体参考请使用 XG')
  })

  it.each(['SD2.5-满血-CB-720P', 'SD2.5-满血-CB-720P-备用'])('rejects too many images and unsafe URLs for %s instead of dropping media silently', async model => {
    await expect(captureCreate(model, { image_urls: Array.from({ length: 10 }, (_, i) => `https://example.com/${i}.png`) })).rejects.toThrow('最多支持 9')
    await expect(captureCreate(model, { image_urls: ['http://example.com/image.png'] })).rejects.toThrow('公网 HTTPS')
    await expect(captureCreate(model, { prompt: '字'.repeat(12001) })).rejects.toThrow('12000')
  })
})
