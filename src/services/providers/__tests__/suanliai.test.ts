import { describe, expect, it } from 'vitest'
import {
  SUANLIAI_MODELS,
  buildSuanliaiBody,
  mapSuanliaiTask,
} from '../suanliai'
import { getModelTemplatesByKind } from '../../modelTemplates'

describe('算力 AI 008 系列 Seedance 2.5 adapter', () => {
  it('registers the two documented models and keeps their resolution limits', () => {
    expect(SUANLIAI_MODELS.map(model => model.id)).toEqual([
      '008系列/sd2.5(30-10-10/5-30秒/480P)',
      '008系列/sd2.5(30-10-10/5-30秒/720P)',
    ])
    expect(getModelTemplatesByKind('suanliai')).toEqual(SUANLIAI_MODELS)
    expect(SUANLIAI_MODELS[0].capabilities).toMatchObject({
      resolutions: ['480p'],
      durationRange: { min: 5, max: 30 },
      maxImages: 30,
      maxVideos: 10,
      maxAudios: 10,
    })
    expect(SUANLIAI_MODELS[1].capabilities.resolutions).toEqual(['720p'])
  })

  it('builds the documented request fields and strips canvas asset labels', () => {
    expect(buildSuanliaiBody({
      model: SUANLIAI_MODELS[1].id,
      prompt: '角色 @[阿宿](asset-1) 向前跑',
      duration: 18,
      ratio: '9:16',
      resolution: '720p',
    }, {
      images: ['https://example.com/a.png'],
      videos: ['https://example.com/ref.mp4'],
      audios: ['https://example.com/music.mp3'],
    })).toEqual({
      model: SUANLIAI_MODELS[1].id,
      prompt: '角色 阿宿 向前跑',
      seconds: 18,
      resolution: '720p',
      aspect_ratio: '9:16',
      images: ['https://example.com/a.png'],
      videos: ['https://example.com/ref.mp4'],
      audios: ['https://example.com/music.mp3'],
    })
  })

  it('enforces the 5–30 second range, resolution and reference caps', () => {
    const base = { model: SUANLIAI_MODELS[0].id, prompt: '测试' }
    expect(buildSuanliaiBody({ ...base, duration: 5 }, {}).seconds).toBe(5)
    expect(buildSuanliaiBody({ ...base, duration: 30 }, {}).seconds).toBe(30)
    expect(() => buildSuanliaiBody({ ...base, duration: 4 }, {})).toThrow('5–30')
    expect(() => buildSuanliaiBody({ ...base, duration: 31 }, {})).toThrow('5–30')
    expect(() => buildSuanliaiBody({ ...base, resolution: '720p' }, {})).toThrow('仅支持 480p')
    expect(() => buildSuanliaiBody({
      ...base,
    }, { images: Array.from({ length: 31 }, (_, index) => `https://example.com/${index}.png`) })).toThrow('最多支持 30 个参考图')
    expect(() => buildSuanliaiBody({
      ...base,
    }, { videos: Array.from({ length: 11 }, (_, index) => `https://example.com/${index}.mp4`) })).toThrow('最多支持 10 个参考视频')
    expect(() => buildSuanliaiBody({
      ...base,
    }, { audios: Array.from({ length: 11 }, (_, index) => `https://example.com/${index}.mp3`) })).toThrow('最多支持 10 个参考音频')
  })

  it('normalizes task states and result URLs from the documented envelopes', () => {
    expect(mapSuanliaiTask({ data: { status: 'queued', progress: 25 } })).toMatchObject({ status: 'pending', progress: 25 })
    expect(mapSuanliaiTask({ status: 'in_progress', progress: 0.5 })).toMatchObject({ status: 'processing', progress: 0.5 })
    expect(mapSuanliaiTask({ status: 'completed', result_url: 'https://example.com/video.mp4' })).toMatchObject({ status: 'completed', videoUrl: 'https://example.com/video.mp4' })
    expect(mapSuanliaiTask({ status: 'failed', error: { message: 'rejected' } })).toMatchObject({ status: 'failed', error: 'rejected' })
  })
})