import { describe, expect, it } from 'vitest'
import { ChuhaiyingVideoProvider } from '../chuhaiyingVideo'
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
    await expect(provider.createTask({ model, prompt: '镜头向前推进', ...extra })).resolves.toEqual({ taskId: 'task_qiling_1' })
    return requestBody
  } finally {
    globalThis.fetch = originalFetch
  }
}

describe('Qiling Seedance 2.5 models', () => {
  it('exposes only the current Qiling Seedance 2.5 catalog', () => {
    const ids = QILING_VIDEO_MODEL_TEMPLATES.map((model) => model.id)
    expect(ids).toContain('SD2.5-满血-CB-720P')
    expect(ids).toContain('SD2.5-满血-HN-720P')
    expect(ids).not.toContain('SD2.5-满血-CB-720P-备用')
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
    const body = await captureCreate('SD2.5-满血-CB-720P', { duration: 8 })
    expect(body.duration).toBe(30)
  })

  it('uses the HN seconds field and supported duration values', async () => {
    const body = await captureCreate('SD2.5-满血-HN-720P', {
      duration: 20,
      generate_audio: true,
      content: [
        { type: 'image_url', image_url: { url: 'https://example.com/ref.png' } },
        { type: 'video_url', video_url: { url: 'https://example.com/source.mp4' } },
        { type: 'audio_url', audio_url: { url: 'https://example.com/music.mp3' } },
      ],
    })

    expect(body).toMatchObject({
      model: 'SD2.5-满血-HN-720P',
      seconds: '20',
      images: ['https://example.com/ref.png'],
      videos: ['https://example.com/source.mp4'],
      audios: ['https://example.com/music.mp3'],
    })
    expect(body.duration).toBeUndefined()
    expect(body.generate_audio).toBeUndefined()
  })

  it('forces the JL route to 30 seconds', async () => {
    const body = await captureCreate('SD2.5-满血-JL-720P', { duration: 4 })
    expect(body.duration).toBe(30)
  })
})
