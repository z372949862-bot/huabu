import { describe, expect, it } from 'vitest'
import {
  UNMAU_MODELS,
  UnmauProvider,
  buildUnmauBody,
  collectReferences,
  mapUnmauTask,
} from '../providers/unmau'
import { YU25_MODELS, adaptYu25CreateBody, buildYu25Body, mapYu25Task } from '../providers/yu25'
import { XINSHUJU_MODELS, adaptXinshujuCreateBody, buildXinshujuBody, mapXinshujuTask } from '../providers/xinshuju'
import { FMGO_MODELS, buildFmgoBody, mapFmgoTask } from '../providers/fmgo'
import { AIMI_MODELS, adaptAimiCreateBody, buildAimiBody, mapAimiTask } from '../providers/aimi'
import { getModelTemplatesByKind } from '../modelTemplates'

describe('AIMI Seedance 2.5 adapter', () => {
  it.each([
    ['seedance-2.5-720p-c5', '720p', 5, '7 元/条'],
    ['H-seedance-2.5-2-720p', '720p', 4, '0.35 元/秒'],
    ['H-seedance-2.5-2-480p', '480p', 4, '0.26 元/秒'],
    ['seedance-2.5-slow', '720p', 4, '0.35 元/秒'],
    ['jing-seedance2.5-V-720p', '720p', 5, '6 元/条'],
    ['jing-seedance2.5-M-480p', '480p', 5, '5 元/条'],
  ] as const)('builds %s with its displayed price and duration limits', (model, resolution, min, price) => {
    const refs = { images: ['https://example.com/a.png'], videos: ['https://example.com/b.mp4'], audios: ['https://example.com/c.mp3'] }
    expect(getModelTemplatesByKind('aimi')).toEqual(AIMI_MODELS)
    const listed = AIMI_MODELS.find(m => m.id === model)
    expect(listed?.name).toContain(price)
    expect(listed?.capabilities).toMatchObject({ resolutions: [resolution], durationRange: { min, max: 30 } })
    const data = { model, prompt: 'scene', resolution, duration: 18 }
    expect(adaptAimiCreateBody(buildAimiBody(data, refs))).toEqual({
      model, prompt: 'scene', seconds: 18, resolution, aspect_ratio: '16:9',
      ...(model.startsWith('jing-') ? { images: refs.images, audios: refs.audios }
        : model === 'seedance-2.5-720p-c5' ? { image_refs: refs.images, reference_audio_urls: refs.audios }
        : { reference_image_urls: refs.images, reference_audio_urls: refs.audios }),
      reference_video_urls: refs.videos,
    })
    for (const seconds of [min, 30]) {
      expect(buildAimiBody({ ...data, duration: seconds }, refs).seconds).toBe(seconds)
    }
    expect(() => buildAimiBody({ ...data, duration: min - 1 }, refs)).toThrow()
    expect(() => buildAimiBody({ ...data, duration: 31 }, refs)).toThrow()
    expect(() => buildAimiBody({ ...data, resolution: '1080p' }, refs)).toThrow()
  })

  it('rejects retired IDs and local Slow reference videos before uploading', () => {
    const refs = { videos: ['local-upload:///clip.mp4'] }
    for (const model of ['JL-seedance-2.5-480p', 'JL-seedance-2.5-720p', 'sd2.5-n-480p', 'sd2.5-n-720p']) {
      expect(() => buildAimiBody({ model, prompt: 'scene' }, refs)).toThrow('型号')
    }
    expect(() => buildAimiBody({ model: 'seedance-2.5-slow', prompt: 'scene' }, refs)).toThrow('公网')
  })

  it('normalizes async task states and result URLs', () => {
    expect(mapAimiTask({ data: { status: 'queued', progress: 0.25 } })).toMatchObject({ status: 'pending', progress: 25 })
    expect(mapAimiTask({ status: 'completed', metadata: { url: 'https://example.com/video.mp4' } })).toMatchObject({ status: 'completed', videoUrl: 'https://example.com/video.mp4' })
    expect(mapAimiTask({ status: 'failed', error: { message: 'rejected' } })).toMatchObject({ status: 'failed', error: 'rejected' })
  })
})

describe('FMGO Feimiao 2.5 adapter', () => {
  it('offers Pro and Max without removing the original model', () => {
    expect(FMGO_MODELS.map(model => model.id)).toEqual(['feimiao-v2.5-720p-30s', 's2.5-pro', 's2.5-max'])
    expect(FMGO_MODELS[0].capabilities.maxImages).toBe(30)
    expect(getModelTemplatesByKind('fmgo')).toEqual(FMGO_MODELS)
  })

  it('builds the documented request shape and keeps the fixed model duration', () => {
    expect(buildFmgoBody({
      model: 'feimiao-v2.5-720p-30s',
      prompt: '角色 @[阿宿](asset-1) 向前走',
      ratio: '9:16',
      duration: 5,
      resolution: '480p',
      generateAudio: true,
    }, {
      images: ['https://example.com/a.png'],
      videos: ['https://example.com/ref.mp4'],
      audios: ['https://example.com/music.mp3'],
    })).toEqual({
      model: 'feimiao-v2.5-720p-30s',
      prompt: '角色 阿宿 向前走',
      aspect_ratio: '9:16',
      resolution: '720p',
      seconds: '30',
      images: ['https://example.com/a.png'],
      reference_videos: ['https://example.com/ref.mp4'],
      reference_audios: ['https://example.com/music.mp3'],
      motion_has_audio: true,
    })
  })

  it('rejects images beyond the 30-image cap and audio without an image or video', () => {
    const base = { model: 'feimiao-v2.5-720p-30s', prompt: '测试' }
    expect(() => buildFmgoBody(base, {
      images: Array.from({ length: 31 }, (_, index) => `https://example.com/${index}.png`), videos: [], audios: [],
    })).toThrow('最多支持 30 张参考图')
    expect(() => buildFmgoBody(base, {
      images: [], videos: [], audios: ['https://example.com/music.mp3'],
    })).toThrow('不能只传参考音频')
  })

  it.each(['s2.5-pro', 's2.5-max'])('enforces all three reference limits without silently truncating %s', model => {
    const list = (n: number, ext: string) => Array.from({ length: n }, (_, i) => `https://cdn.example.test/${i}.${ext}`)
    const refs = { images: list(30, 'png'), videos: list(10, 'mp4'), audios: list(10, 'wav') }
    const build = (refs: any) => buildFmgoBody({ model, prompt: '镜头', duration: 30, resolution: '720p' }, refs)
    expect(build(refs)).toMatchObject({ images: refs.images, reference_videos: refs.videos, reference_audios: refs.audios })
    for (const field of ['images', 'videos', 'audios'] as const) {
      expect(() => build({ ...refs, [field]: [...refs[field], 'https://cdn.example.test/extra'] })).toThrow(field === 'images' ? /30/ : /10/)
    }
  })
  it('sends the selected whole seconds and resolution for Pro, rejects out-of-range choices', () => {
    const build = (duration: number, resolution: string) => buildFmgoBody({ model: 's2.5-pro', prompt: '场景', duration, resolution }, {})
    expect(build(4, '720p')).toMatchObject({ model: 's2.5-pro', seconds: '4', resolution: '720p' })
    expect(build(30, '480p')).toMatchObject({ model: 's2.5-pro', seconds: '30', resolution: '480p' })
    for (const n of [3, 30.5, 31]) expect(() => build(n, '720p')).toThrow(/秒/)
    expect(() => build(12, '1080p')).toThrow(/480p.*720p/)
  })

  it('maps task IDs and completion URLs from the documented response envelope', () => {
    expect(mapFmgoTask({ data: { status: 'completed', result_url: 'https://static.fmgo.top/video.mp4', progress: 100 } })).toMatchObject({
      status: 'completed', videoUrl: 'https://static.fmgo.top/video.mp4', progress: 100,
    })
    expect(mapFmgoTask({ status: 'queued' }).status).toBe('pending')
  })
})

describe('New API Seedance 2.5 adapter', () => {
  it('publishes the complete 12-model catalog and builds a valid request', () => {
    expect(UNMAU_MODELS).toHaveLength(12)
    expect(new Set(UNMAU_MODELS.map((model) => model.id)).size).toBe(12)

    expect(buildUnmauBody({
      model: 'td-seedance-2.5-720p',
      prompt: '角色 @[阿宿](asset-1) 向右跑',
      duration: 15,
      ratio: '16:9',
      resolution: '720p',
    }, { images: ['https://example.com/a.png'], videos: [], audios: [] })).toEqual({
      model: 'td-seedance-2.5-720p',
      prompt: '角色 阿宿 向右跑',
      duration: 15,
      aspect_ratio: '16:9',
      resolution: '720p',
      images: ['https://example.com/a.png'],
    })
  })

  it('collects connected assets once and normalizes task state', () => {
    const refs = collectReferences(
      { inputImages: ['https://example.com/a.png'] },
      [{ id: 'asset', type: 'asset-ref', data: { assetType: 'image', assetUrl: 'https://example.com/a.png' } }],
      [{ source: 'asset', target: 'video' }],
      'video',
    )
    expect(refs.images).toEqual(['https://example.com/a.png'])
    expect(new UnmauProvider('key').canResumeTask).toBe(true)
    expect(mapUnmauTask({ data: { status: 'in_progress', progress: '35%' } })).toEqual({
      status: 'processing',
      progress: 35,
      error: undefined,
    })
  })
})

describe('YU25 sd2.5 adapter', () => {
  it('exposes standard and high models and converts size and seconds', () => {
    expect(YU25_MODELS.map((model) => model.id)).toEqual(['sd2.5', 'sd2.5 高'])
    expect(buildYu25Body({
      model: 'sd2.5',
      prompt: '迁迁转身',
      duration: 30,
      ratio: '9:16',
      resolution: '720p',
    }, { images: ['https://example.com/qianqian.jpg'], videos: [], audios: [] })).toEqual({
      model: 'sd2.5',
      prompt: '迁迁转身',
      seconds: '30',
      size: '720x1280',
      image_urls: ['https://example.com/qianqian.jpg'],
    })
  })

  it('adapts sd2.5 高 to the chat-completions request contract', () => {
    const base = buildYu25Body({
      model: 'sd2.5 高',
      prompt: '阿宿绕着石头转圈',
      duration: 10,
      ratio: '9:16',
      resolution: '720p',
    }, { images: ['https://example.com/asu.jpg'], videos: [], audios: [] })

    expect(base).toEqual({
      model: 'sd2.5 高',
      prompt: '阿宿绕着石头转圈',
      seconds: '10',
      aspect_ratio: '9:16',
      resolution: '720p',
      images: ['https://example.com/asu.jpg'],
    })
    expect(adaptYu25CreateBody(base)).toEqual({
      ...base,
      stream: false,
      duration: 10,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '阿宿绕着石头转圈' },
          { type: 'image_url', image_url: { url: 'https://example.com/asu.jpg' } },
        ],
      }],
      video_config: {
        duration: 10,
        seconds: '10',
        aspect_ratio: '9:16',
        resolution: 'HD',
        size: '720x1280',
      },
    })
  })

  it('recognizes Submitted as pending instead of an error', () => {
    expect(mapYu25Task({ status: 'Submitted' }).status).toBe('pending')
    expect(mapYu25Task({ data: { status: 'completed', video_url: 'https://example.com/video.mp4' } })).toMatchObject({
      status: 'completed',
      videoUrl: 'https://example.com/video.mp4',
    })
  })
})

describe('心数据 Seedance 2.5 adapter', () => {
  it('publishes the three 30-image models and builds content[] payloads', () => {
    expect(XINSHUJU_MODELS.map(model => model.id)).toEqual([
      '2-seedance-2.5',
      '3-seedance-2.5-720p',
      '4-seedance-2.5-720p',
    ])
    expect(XINSHUJU_MODELS[0].capabilities.resolutions).toEqual(['480p', '720p', '1080p'])
    expect(XINSHUJU_MODELS[1].capabilities.resolutions).toEqual(['720p'])
    const base = buildXinshujuBody({
      model: '3-seedance-2.5-720p',
      prompt: '阿宿向右跑',
      duration: 20,
      ratio: '16:9',
      resolution: '720p',
      generateAudio: true,
    }, {
      images: ['https://example.com/asu.png'],
      videos: [],
      audios: ['https://example.com/music.mp3'],
    })
    expect(adaptXinshujuCreateBody(base)).toEqual({
      model: '3-seedance-2.5-720p',
      content: [
        { type: 'text', text: '阿宿向右跑' },
        { type: 'image_url', image_url: { url: 'https://example.com/asu.png' }, role: 'reference_image' },
        { type: 'audio_url', audio_url: { url: 'https://example.com/music.mp3' }, role: 'reference_audio' },
      ],
      generate_audio: true,
      ratio: '16:9',
      duration: 20,
      watermark: false,
      resolution: '720p',
    })
  })

  it('normalizes task status and rejects reference video', () => {
    expect(mapXinshujuTask({ data: { status: 'completed', video_url: 'https://example.com/out.mp4' } })).toMatchObject({
      status: 'completed',
      videoUrl: 'https://example.com/out.mp4',
    })
    expect(() => buildXinshujuBody({
      model: '2-seedance-2.5', prompt: '测试', duration: 10, ratio: '9:16', resolution: '720p',
    }, { images: [], videos: ['https://example.com/ref.mp4'], audios: [] })).toThrow('不支持参考视频')
  })
})
