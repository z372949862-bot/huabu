import { afterEach, describe, expect, it, vi } from 'vitest'
import { DmxApiProvider, mapDmxApiTask } from '../dmxapi'

describe('DmxApiProvider', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps the gateway task identity and status ahead of an upstream task', async () => {
    const raw = { id: 'task_gateway', status: 'processing', data: {
      id: 'task_upstream', status: 'succeeded', video_url: 'https://example.com/result.mp4',
    } }
    expect(mapDmxApiTask(raw)).toMatchObject({ status: 'processing', videoUrl: undefined })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(raw))))
    await expect(new DmxApiProvider('sk-test').createTask({ model: 'doubao-seedance-2-5-260628', prompt: '测试' }))
      .resolves.toMatchObject({ taskId: 'task_gateway', videoUrl: undefined })
  })

  it.each([0, 1, 2, 3, 31, 4.5])('rejects invalid duration %s before a paid submission', async duration => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(new DmxApiProvider('sk-test').createTask({ model: 'doubao-seedance-2-5-260628', prompt: '测试', duration }))
      .rejects.toThrow('4–30')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads each embedded task JSON instead of the completed response envelope', () => {
    expect(mapDmxApiTask({ object: 'response', status: 'completed', output: [
      { type: 'message', status: 'completed', content: [
        { type: 'output_text', text: JSON.stringify({ status: 'failed', error: { message: '素材解析失败' } }) },
      ] },
    ] })).toMatchObject({ status: 'failed', error: '素材解析失败', videoUrl: undefined })
  })

  it('does not finish a processing task just because a result URL is reserved', () => {
    expect(mapDmxApiTask({ status: 'processing', video_url: 'https://example.com/reserved.mp4' }))
      .toMatchObject({ status: 'processing', videoUrl: undefined })
  })

  it('accepts extensionless URLs only in explicit video result fields', () => {
    expect(mapDmxApiTask({ status: 'succeeded', content: { video_url: 'https://example.com/video/content?sig=abc' } }))
      .toMatchObject({ status: 'completed', videoUrl: 'https://example.com/video/content?sig=abc' })
    expect(mapDmxApiTask({ status: 'processing', input: [{ video_url: { url: 'https://example.com/source.mp4' } }] }))
      .toMatchObject({ status: 'processing', videoUrl: undefined })
    expect(mapDmxApiTask({ output: [{ type: 'image_url', image_url: { url: 'https://example.com/ref.png' } }] }).videoUrl).toBeUndefined()
  })

  it('prefers the actual task ID in output text over a message or response ID', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'resp_transport', object: 'response', output: [
        { id: 'msg_envelope', type: 'message', content: [{ type: 'output_text', text: 'Task ID: task_actual' }] },
      ],
    }))))
    await expect(new DmxApiProvider('sk-test').createTask({ model: 'doubao-seedance-2-5-260628', prompt: '走路' }))
      .resolves.toMatchObject({ taskId: 'task_actual' })
  })

  it('preserves a labeled task ID exactly without inventing a prefix', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Task ID: abc123' }] }],
    }))))
    await expect(new DmxApiProvider('sk-test').createTask({ model: 'doubao-seedance-2-5-260628', prompt: '走路' }))
      .resolves.toMatchObject({ taskId: 'abc123' })
  })

  it('keeps media roles but strips unsupported name and conflicting payload fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'task_created' })))
    vi.stubGlobal('fetch', fetchMock)
    await new DmxApiProvider('sk-test').createTask({ model: 'doubao-seedance-2-5-260628', prompt: '看向@图像1', content: [
      { type: 'text', text: '看向@图像1' },
      { type: 'image_url', image_url: { url: 'https://example.com/a.png' }, text: 'extra', role: 'reference_image', name: '1' },
    ] })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.input[1]).toEqual({ type: 'image_url', image_url: { url: 'https://example.com/a.png' }, role: 'reference_image' })
  })
  it('maps a Seedance 2.5 query response with a direct video URL', () => {
    const result = mapDmxApiTask({
      status: 'succeeded',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'https://example.com/result.mp4' }] }],
    })
    expect(result).toEqual({ status: 'completed', progress: undefined, videoUrl: 'https://example.com/result.mp4', error: undefined })
  })

  it('extracts a task id from the DMXAPI task text response', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Task ID: task_abc123' }] }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch
    try {
      const provider = new DmxApiProvider('sk-' + 'x'.repeat(24))
      const result = await provider.createTask({ model: 'doubao-seedance-2-5-260628', prompt: '继续向前走', content: [{ type: 'text', text: '继续向前走' }], omniReferenceTaskType: 'extend', ratio: 'adaptive', duration: 5 })
      expect(result.taskId).toBe('task_abc123')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('accepts nested and numeric task ids', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response(JSON.stringify({ data: { task_id: 123456 } }), { status: 200 })) as typeof fetch
    try {
      const provider = new DmxApiProvider('sk-' + 'x'.repeat(24))
      await expect(provider.createTask({ model: 'doubao-seedance-2-5-260628', prompt: '测试' })).resolves.toMatchObject({ taskId: '123456' })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('extracts a task id from JSON embedded in output text', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: '{"data":{"id":"task_nested"}}' }] }],
    }), { status: 200 })) as typeof fetch
    try {
      const provider = new DmxApiProvider('sk-' + 'x'.repeat(24))
      await expect(provider.createTask({ model: 'doubao-seedance-2-5-260628', prompt: '测试' })).resolves.toMatchObject({ taskId: 'task_nested' })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('maps nested status and progress values', () => {
    expect(mapDmxApiTask({ data: { state: 'running', progress: '42%' } })).toMatchObject({ status: 'processing', progress: 42 })
  })
})
