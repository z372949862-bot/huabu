import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AIIDE_BASE,
  AIIDE_SEEDANCE_25_MODEL,
  AiideSeedanceProvider,
  buildAiideSeedanceBody,
  mapAiideTaskResponse,
} from '../aiide'
import { AIIDE_VIDEO_MODEL_TEMPLATES } from '../../modelTemplates'

const apiKey = 'aiide-test-token'

describe('Aiide Seedance 2.5 HC', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('advertises only the supported 480p and 720p options', () => {
    expect(AIIDE_VIDEO_MODEL_TEMPLATES[0].capabilities.resolutions).toEqual(['480p', '720p'])
  })

  it('builds the documented multimodal request with the selected resolution', () => {
    const body = buildAiideSeedanceBody({
      model: AIIDE_SEEDANCE_25_MODEL,
      prompt: '按参考视频的节奏生成，保留图片中的人物。',
      ratio: '9:16',
      duration: 10,
      resolution: '480p',
      generate_audio: true,
      content: [
        { type: 'text', text: '请求内单独的 prompt 字段承载文本' },
        { type: 'video_url', video_url: { url: 'https://example.com/source.mp4' }, role: 'source_video' },
        { type: 'image_url', image_url: 'https://example.com/reference.png' },
        { type: 'audio_url', audio_url: { url: 'https://example.com/music.mp3' } },
      ],
    })

    expect(body).toEqual({
      model: AIIDE_SEEDANCE_25_MODEL,
      prompt: '按参考视频的节奏生成，保留图片中的人物。',
      metadata: {
        content: [
          { type: 'video_url', video_url: { url: 'https://example.com/source.mp4' }, role: 'reference_video' },
          { type: 'image_url', image_url: { url: 'https://example.com/reference.png' }, role: 'reference_image' },
          { type: 'audio_url', audio_url: { url: 'https://example.com/music.mp3' }, role: 'reference_audio' },
        ],
        generate_audio: true,
        ratio: '9:16',
        resolution: '480p',
        duration: 10,
        watermark: false,
      },
    })
  })

  it.each(['480p', '720p'])('includes the supported %s resolution', resolution => {
    const body = buildAiideSeedanceBody({
      model: AIIDE_SEEDANCE_25_MODEL,
      prompt: '测试分辨率',
      resolution,
    })

    expect(body.metadata).toMatchObject({ resolution })
  })

  it('defaults to 720p and rejects unsupported resolutions', () => {
    expect(buildAiideSeedanceBody({
      model: AIIDE_SEEDANCE_25_MODEL,
      prompt: '默认清晰度',
    }).metadata).toMatchObject({ resolution: '720p' })

    expect(() => buildAiideSeedanceBody({
      model: AIIDE_SEEDANCE_25_MODEL,
      prompt: '不支持的清晰度',
      resolution: '1080p',
    })).toThrow('仅支持 480p 或 720p')
  })

  it('enables native audio by default while allowing an explicit opt-out', () => {
    expect(buildAiideSeedanceBody({
      model: AIIDE_SEEDANCE_25_MODEL,
      prompt: '默认带音频',
    }).metadata).toMatchObject({ generate_audio: true })

    expect(buildAiideSeedanceBody({
      model: AIIDE_SEEDANCE_25_MODEL,
      prompt: '关闭音频',
      generate_audio: false,
    }).metadata).toMatchObject({ generate_audio: false })
  })

  it.each([4, 30])('accepts the confirmed %s-second duration boundary', duration => {
    const body = buildAiideSeedanceBody({
      model: AIIDE_SEEDANCE_25_MODEL,
      prompt: '测试时长',
      duration,
    })

    expect(body.metadata).toMatchObject({ duration })
  })

  it.each([3, 31, 4.5])('rejects unsupported duration %s before creating a task', duration => {
    expect(() => buildAiideSeedanceBody({
      model: AIIDE_SEEDANCE_25_MODEL,
      prompt: '测试时长',
      duration,
    })).toThrow('视频时长须为 4–30 秒的整数')
  })

  it('makes video-edit and video-extend selections explicit in the prompt without undocumented request fields', () => {
    const edit = buildAiideSeedanceBody({
      model: AIIDE_SEEDANCE_25_MODEL,
      mode: 'edit',
      prompt: '把背景改成夜景',
      content: [{ type: 'video_url', video_url: 'https://example.com/source.mp4', role: 'source_video' }],
    })
    const extend = buildAiideSeedanceBody({
      model: AIIDE_SEEDANCE_25_MODEL,
      mode: 'extend',
      prompt: '接着前面的动作继续',
      content: [{ type: 'video_url', video_url: 'https://example.com/source.mp4', role: 'source_video' }],
    })

    expect(edit.prompt).toBe('请按照以下要求编辑输入视频：\n把背景改成夜景')
    expect(extend.prompt).toBe('从输入视频的最后一帧开始无缝延长。\n接着前面的动作继续')
    expect(edit).not.toHaveProperty('mode')
    expect(extend).not.toHaveProperty('mode')
  })

  it('submits to the configured endpoint with bearer auth and returns the documented task id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      task_id: 'task-aiide-123', status: 'SUBMITTED',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AiideSeedanceProvider(apiKey)
    await expect(provider.createTask({
      model: AIIDE_SEEDANCE_25_MODEL,
      prompt: '轻轻转身',
      duration: 8,
      resolution: '720p',
    })).resolves.toEqual({ taskId: 'task-aiide-123' })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${AIIDE_BASE}/v1/video/generations`)
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${apiKey}`)
    expect(JSON.parse(init.body)).toMatchObject({
      model: AIIDE_SEEDANCE_25_MODEL,
      prompt: '轻轻转身',
      metadata: { resolution: '720p' },
    })
  })

  it('reads the documented nested task status and output video URL', () => {
    expect(mapAiideTaskResponse({
      code: 'success',
      data: {
        status: 'SUCCESS',
        progress: '100%',
        data: { output: { task_status: 'SUCCEEDED', video_url: 'https://example.com/result' } },
      },
    })).toEqual({
      status: 'completed',
      progress: 100,
      videoUrl: 'https://example.com/result',
      error: undefined,
    })
  })

  it('does not treat a reserved output URL as completion while generation is running', () => {
    expect(mapAiideTaskResponse({
      data: {
        status: 'IN_PROGRESS',
        data: { output: { task_status: 'RUNNING', video_url: 'https://example.com/reserved' } },
      },
    })).toMatchObject({ status: 'processing', videoUrl: undefined })
  })

  it('lets a nested upstream task status override a successful gateway envelope', () => {
    expect(mapAiideTaskResponse({
      data: { status: 'SUCCESS', data: { output: { task_status: 'PENDING' } } },
    })).toMatchObject({ status: 'pending' })
  })

  it('reports an upstream failure reason even when the gateway envelope succeeded', () => {
    expect(mapAiideTaskResponse({
      data: {
        status: 'SUCCESS',
        fail_reason: '',
        data: { output: { task_status: 'FAILED' } },
      },
      message: 'task failed',
    })).toMatchObject({ status: 'failed', error: 'task failed' })
    expect(mapAiideTaskResponse({
      data: { status: 'FAILURE', fail_reason: '参考视频读取失败' },
    })).toMatchObject({ status: 'failed', error: '参考视频读取失败' })
  })

  it('queries the documented task endpoint with URL-encoded identifiers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { status: 'QUEUED', data: { output: { task_status: 'PENDING' } } },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const status = await new AiideSeedanceProvider(apiKey).getTaskStatus('task/a b')
    expect(status.status).toBe('pending')
    expect(fetchMock.mock.calls[0][0]).toBe(`${AIIDE_BASE}/v1/video/generations/task%2Fa%20b`)
    expect(fetchMock.mock.calls[0][1].method).toBe('GET')
  })
})
