import { afterEach, describe, expect, it, vi } from 'vitest'
import { PiapiImageProvider, PIAPI_IMAGE_MODEL, seedreamImagePayload, parseSeedreamImageTask } from '../piapiImage'
import { urlToFile } from '../../imageHost'
vi.mock('../../imageHost', () => ({ urlToFile: vi.fn() }))
const params = { model: PIAPI_IMAGE_MODEL, prompt: '画一片森林' }
const remote = 'https://cdn.example.com/output.png'
const completed = { data: { task_id: 'task_image', status: 'Completed', output: { image_url: remote } } }
function setup() {
  const request = vi.fn().mockResolvedValue({ ok: true, data: completed })
  const downloadImage = vi.fn().mockResolvedValue({ ok: true, data: { path: 'C:/images/result.png' } })
  const upload = vi.fn().mockResolvedValue({ ok: true, data: { data: { url: 'https://cdn.example.com/ref.png' } } })
  window.electronAPI = { piapi: { request, downloadImage, upload } } as any
  return { provider: new PiapiImageProvider('test-key'), request, downloadImage, upload }
}
afterEach(() => { delete window.electronAPI; vi.useRealTimers(); vi.resetAllMocks() })
describe('PiAPI Seedream documented parameters', () => {
  it('sends only documented Pro fields', () => {
    expect(seedreamImagePayload({ ...params, seed: 123, negativePrompt: 'bad' })).toEqual({ model: 'seedream', task_type: PIAPI_IMAGE_MODEL, input: { prompt: params.prompt, size: '1K', aspect_ratio: '1:1', output_format: 'jpeg' } })
  })
  it.each(['1:1','16:9','9:16','4:3','3:4','3:2','2:3','4:5','5:4','21:9'])('supports %s ratio with 2K PNG', aspectRatio => {
    expect(seedreamImagePayload({ ...params, aspectRatio, imageSize: '2K', imageOutputFormat: 'png' }).input).toMatchObject({ size: '2K', aspect_ratio: aspectRatio, output_format: 'png' })
  })
  it.each([{ model: 'seedream-5-lite' }, { prompt: ' ' }, { imageSize: '4K' }, { imageSize: '1.5K' }, { imageOutputFormat: 'gif' }, { aspectRatio: 'auto' }, { n: 2 }])('rejects unsupported parameters %j', values => {
    expect(() => seedreamImagePayload({ ...params, ...values } as any)).toThrow()
  })
  it('allows ten references and rejects eleven', () => {
    const refs = Array.from({ length: 11 }, (_, i) => 'https://example.com/' + i + '.png')
    expect(seedreamImagePayload(params, refs.slice(0, 10)).input.image_urls).toHaveLength(10)
    expect(() => seedreamImagePayload(params, refs)).toThrow('10')
  })
  it('parses singular/plural results and preserves upstream failure reasons', () => {
    expect(parseSeedreamImageTask({ data: { ...completed.data, output: { image_url: remote, image_urls: [remote, 'failure text'] } } }).urls).toEqual([remote])
    expect(parseSeedreamImageTask({ data: { status: 'Failed', error: { raw_message: '原始失败原因' } } })).toMatchObject({ failed: true, error: '原始失败原因' })
  })
})
describe('PiAPI Seedream task lifecycle without live billing', () => {
  it('uses account info for authentication without creating a task', async () => {
    const { provider, request } = setup()
    expect(await provider.testAuth('test-key')).toEqual({ success: true })
    expect(request).toHaveBeenCalledExactlyOnceWith({ apiKey: 'test-key', path: '/account/info' })
  })
  it('saves the returned task before downloading synchronous output locally', async () => {
    const { provider, request, downloadImage } = setup(); const onTask = vi.fn()
    expect(await provider.generateImage({ ...params, onTask })).toEqual({ imageUrls: ['local-upload:///C:/images/result.png'] })
    expect(request).toHaveBeenCalledExactlyOnceWith({ apiKey: 'test-key', path: '/api/v1/task', body: seedreamImagePayload(params) })
    expect(onTask).toHaveBeenCalledExactlyOnceWith('task_image')
    expect(onTask.mock.invocationCallOrder[0]).toBeLessThan(downloadImage.mock.invocationCallOrder[0])
  })
  it('uploads a local reference once and keeps public reference order', async () => {
    const { provider, request, upload } = setup()
    vi.mocked(urlToFile).mockResolvedValue(new File(['image'], 'actor.png', { type: 'image/png' }))
    await provider.generateImage({ ...params, imageUrls: ['local-upload:///actor.png', remote] })
    expect(upload).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][0].body.input.image_urls).toEqual(['https://cdn.example.com/ref.png', remote])
  })
  it('validates all local files before uploading or submitting', async () => {
    const { provider, request, upload } = setup()
    vi.mocked(urlToFile).mockResolvedValueOnce(new File(['ok'], 'a.png')).mockResolvedValueOnce({ size: 8 * 1024 * 1024, name: 'b.png' } as File)
    await expect(provider.generateImage({ ...params, imageUrls: ['local-upload:///a.png', 'local-upload:///b.png'] })).rejects.toThrow('10 MB')
    expect(upload).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled()
  })
  it.each(['asset://asset-test', 'http://127.0.0.1/a.png'])('rejects invalid reference %s before submission', async url => {
    const { provider, request } = setup()
    await expect(provider.generateImage({ ...params, imageUrls: [url] })).rejects.toThrow()
    expect(request).not.toHaveBeenCalled()
  })
  it('polls a pending response without repeating POST', async () => {
    vi.useFakeTimers(); const { provider, request } = setup()
    request.mockResolvedValueOnce({ ok: true, data: { data: { task_id: 'task_image', status: 'Pending' } } })
    const running = provider.generateImage(params)
    await vi.advanceTimersByTimeAsync(3001); await running
    expect(request.mock.calls.map(call => call[0].path)).toEqual(['/api/v1/task', '/api/v1/task/task_image'])
    expect(request.mock.calls[1][0].body).toBeUndefined()
  })
  it('resumes using GET even when original local references no longer exist', async () => {
    const { provider, request, upload } = setup()
    await provider.generateImage({ ...params, prompt: '', resumeTaskId: 'task_image', imageUrls: ['local-upload:///deleted.png'] })
    expect(request).toHaveBeenCalledExactlyOnceWith({ apiKey: 'test-key', path: '/api/v1/task/task_image' })
    expect(upload).not.toHaveBeenCalled(); expect(urlToFile).not.toHaveBeenCalled()
  })
  it('retains a task after download failure so retry can GET only', async () => {
    const { provider, downloadImage, request } = setup(); const onTask = vi.fn()
    downloadImage.mockResolvedValueOnce({ ok: false, error: 'network' })
    await expect(provider.generateImage({ ...params, onTask })).rejects.toThrow('原任务已保留')
    expect(onTask).toHaveBeenCalledExactlyOnceWith('task_image')
    await provider.generateImage({ ...params, resumeTaskId: 'task_image', onTask })
    expect(request.mock.calls.filter(call => call[0].body)).toHaveLength(1)
  })
  it('clears confirmed failed tasks and surfaces provider reason', async () => {
    const { provider, request, downloadImage } = setup(); const onTask = vi.fn()
    request.mockResolvedValue({ ok: true, data: { data: { task_id: 'task_image', status: 'Failed', error: { message: '额度不足' } } } })
    await expect(provider.generateImage({ ...params, onTask })).rejects.toThrow('额度不足')
    expect(onTask.mock.calls).toEqual([['task_image'], [undefined]])
    expect(downloadImage).not.toHaveBeenCalled(); expect(request).toHaveBeenCalledTimes(1)
  })
  it('does not retry an ambiguous POST failure', async () => {
    const { provider, request } = setup()
    request.mockResolvedValue({ ok: false, error: '请先核实任务', retryable: false })
    await expect(provider.generateImage(params)).rejects.toThrow('核实')
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('retains a task returned after local cancellation', async () => {
    const { provider, request, downloadImage } = setup(); const controller = new AbortController(), onTask = vi.fn()
    request.mockImplementation(async () => { controller.abort(); return { ok: true, data: completed } })
    await expect(provider.generateImage({ ...params, signal: controller.signal, onTask })).rejects.toMatchObject({ name: 'AbortError' })
    expect(onTask).toHaveBeenCalledExactlyOnceWith('task_image'); expect(downloadImage).not.toHaveBeenCalled()
  })
})
