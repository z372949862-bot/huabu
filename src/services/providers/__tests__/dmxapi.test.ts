import { describe, expect, it } from 'vitest'
import { DmxApiProvider, mapDmxApiTask } from '../dmxapi'

describe('DmxApiProvider', () => {
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
