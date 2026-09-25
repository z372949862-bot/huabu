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
