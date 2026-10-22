import { afterEach, describe, expect, it, vi } from 'vitest'
import { findImageTemplate, getImageTemplatesByKind } from '../../imageModelTemplates'
import { LuociImageProvider } from '../luoci'

afterEach(() => vi.unstubAllGlobals())

describe('Luoci Seedream 5 Pro image API', () => {
  it('exposes the documented model capabilities', () => {
    const template = findImageTemplate('seedream-5-pro', 'luoci')!
    expect(template.capabilities.ratios).toEqual(['1:1', '9:16', '16:9', '3:4', '4:3', '2:3', '3:2', '21:9'])
    expect(template.capabilities.resolutions).toEqual(['1K', '1.5K', '2K'])
    expect(template.supportsReferenceImage).toBe(true)
    expect(getImageTemplatesByKind('luoci')).toContain(template)
  })

  it('quotes, submits, polls the task, and downloads the image with authorization', async () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ estimatedPoints: 0.045 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'task-1' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task: { status: 'succeeded', settled: true, chargedPoints: 0.045, images: [{ url: '/api/v1/tasks/task-1/images/0' }] } }), { status: 200 }))
      .mockResolvedValueOnce({ ok: true, status: 200, blob: async () => png })
    vi.stubGlobal('fetch', fetch)
    const provider = new LuociImageProvider('sk-test', 'https://luocisheng.cn/api')
    const promise = provider.generateImage({ model: 'seedream-5-pro', prompt: '猫', aspectRatio: '1:1', imageSize: '1.5K', imageUrls: ['data:image/png;base64,AA=='] })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    await new Promise(resolve => setTimeout(resolve, 4100))
    const result = await promise

    expect(fetch.mock.calls[0][0]).toBe('https://luocisheng.cn/api/v1/images/quote')
    const expectedBody = { modelId: 'seedream-5-pro', prompt: '猫', numImages: 1, aspectRatio: '1:1', imageSize: '1.5K', image: 'data:image/png;base64,AA==' }
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(expectedBody)
    expect(fetch.mock.calls[1][0]).toBe('https://luocisheng.cn/api/v1/images/generations')
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual(expectedBody)
    expect(fetch.mock.calls[1][1].headers['Idempotency-Key']).toMatch(/^seedream-/)
    expect(fetch.mock.calls[2][0]).toBe('https://luocisheng.cn/api/v1/tasks/task-1')
    expect(fetch.mock.calls[3][0]).toBe('https://luocisheng.cn/api/v1/tasks/task-1/images/0')
    expect(fetch.mock.calls[3][1].headers.Authorization).toBe('Bearer sk-test')
    expect(result.imageUrls[0]).toMatch(/^data:image\/png;base64,/)
  }, 10000)

  it('reports insufficient API balance clearly', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: 'not enough points', code: 'INSUFFICIENT_POINTS' }), { status: 402 }))
    vi.stubGlobal('fetch', fetch)
    const provider = new LuociImageProvider('sk-test')
    await expect(provider.generateImage({ model: 'seedream-5-pro', prompt: '猫' })).rejects.toThrow('积分不足')
  })
})
