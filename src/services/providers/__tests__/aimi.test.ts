import { describe, expect, it } from 'vitest'
import { mapAimiTask } from '../aimi'

describe('AIMI task response mapping', () => {
  const reason = '参考图片宽高比不符合该模型要求，请按模型支持的画幅裁切后重试。本次扣除的额度已退回。'
  const failed = { status: 'FAILURE', progress: '100%', fail_reason: reason, result_url: reason, data: null }

  it('preserves the actual failure and refund message without treating it as video', () => {
    expect(mapAimiTask(failed)).toEqual({ status: 'failed', progress: 100, error: reason })
  })

  it.each(['data', 'task', 'data.task'])('reads failures inside %s', envelope => {
    const raw = envelope.split('.').reverse().reduce((value, key) => ({ [key]: value }), failed as any)
    expect(mapAimiTask(raw)).toEqual({ status: 'failed', progress: 100, error: reason })
  })

  it('falls back to a textual result_url when no separate reason is supplied', () => {
    expect(mapAimiTask({ status: 'failed', result_url: reason })).toEqual({ status: 'failed', error: reason })
  })

  it('does not return a stale media URL on a failed task', () => {
    expect(mapAimiTask({ ...failed, result_url: 'https://example.com/old.mp4' }).videoUrl).toBeUndefined()
  })

  it('keeps completed videos and skips invalid URL fields', () => {
    expect(mapAimiTask({ status: ' SUCCESS ', progress: '100%', metadata: { url: 'not a video URL' }, result_url: 'https://example.com/final.mp4' }))
      .toEqual({ status: 'completed', progress: 100, videoUrl: 'https://example.com/final.mp4' })
  })

  it('supports a same-origin relative content endpoint', () => {
    expect(mapAimiTask({ status: 'completed', result_url: '/v1/videos/test/content' }).videoUrl).toBe('/v1/videos/test/content')
  })

  it.each(['plain error text', 'javascript:alert(1)', 'https://user:secret@example.com/video.mp4', '//example.com/video.mp4'])('does not accept %s as video', result_url => {
    expect(mapAimiTask({ status: 'completed', result_url }).videoUrl).toBeUndefined()
  })

  it('does not treat 100 percent as success without a successful status', () => {
    expect(mapAimiTask({ status: 'processing', progress: '100%' }).status).toBe('processing')
  })
})
