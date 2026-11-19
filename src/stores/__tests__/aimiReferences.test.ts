import { File as NodeFile } from 'node:buffer'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { AimiProvider } from '@/services/providers/aimi'
import { useNodeStore } from '../node'

vi.mock('@/stores/ai', () => ({ useAIStore: () => ({
  getProvider: () => new AimiProvider('fixture-only'),
  getProviderConfig: () => ({ id: 'aimi', kind: 'aimi', apiKey: 'fixture-only', name: 'AIMI' }),
}) }))
vi.mock('@/stores/asset', () => ({ useAssetStore: () => ({ addAsset: vi.fn() }) }))
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))

const registerAimi = createRequire(import.meta.url)('../../../electron/aimi.cjs')
const image = { id: 'i', type: 'image', name: '人物.png', url: 'local-upload:///C:/fixtures/person.png' }
const video = { id: 'v', type: 'video', name: '动作.mp4', url: 'local-upload:///C:/fixtures/motion.mp4' }
const imageUrl = 'https://media.example.test/person.png', videoUrl = 'https://media.example.test/motion.mp4'
const model = 'seedance-2.5-720p-c5'
const otherImage = { id: 'i2', type: 'image', name: '白衣.png', url: 'local-upload:///C:/fixtures/second.png' }
const otherImageUrl = 'https://media.example.test/second.png'
const missingImage = 'prompt references an image, but no image material was received; send image/image_url/reference_image/image_refs'

describe('AIMI C5 canvas → Electron generation request', () => {
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

  function setup(data: Record<string, unknown>, options: { rejectVideo?: boolean; rejectImageMaterial?: boolean } = {}) {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    const requests: any[] = [], uploads: string[] = []
    const handlers = new Map<string, Function>()
    // Exercise real serialization, multipart routing and URL extraction; only the transport is fake.
    registerAimi({ app: {}, ipcMain: { handle: (name: string, fn: Function) => handlers.set(name, fn) },
      net: { fetch: async (url: string, init: RequestInit) => {
        const path = new URL(url).pathname
        const ok = (body: unknown) => Response.json(body)
        if (path === '/pg/reference-images' || path === '/v1/reference-videos') {
          const isImage = path === '/pg/reference-images'
          uploads.push(path)
          if (!isImage && options.rejectVideo) return Response.json({ error: '视频上传失败' }, { status: 422 })
          const file = (init.body as FormData).get('file') as File
          expect(file.type).toBe(isImage ? 'image/png' : 'video/mp4')
          const uploadedUrl = isImage ? (new Uint8Array(await file.arrayBuffer())[0] === 4 ? otherImageUrl : imageUrl) : videoUrl
          return ok({ success: true, data: { url: uploadedUrl } })
        }
        if (path === '/v1/videos' && init.method === 'POST') {
          const body = JSON.parse(String(init.body))
          requests.push(body)
          // Only enforce the image fields explicitly named in the observed C5 HTTP 400.
          const hasImage = ['image', 'image_url', 'reference_image', 'image_refs'].some(key => body[key]?.length)
          if (options.rejectImageMaterial || (body.model === model && /@图片\d+/.test(body.prompt) && !hasImage)) {
            return Response.json({ error: { message: missingImage } }, { status: 400 })
          }
          return ok({ task_id: 'fixture-task' })
        }
        if (path === '/v1/videos/fixture-task' && init.method === 'GET') return ok({ status: 'completed' })
        throw new Error('Unexpected route: ' + path)
      } },
    })
    vi.stubGlobal('File', NodeFile)
    vi.stubGlobal('electronAPI', {
      upload: { read: async (path: string) => path === 'C:/fixtures/second.png' ? { data: 'BAUG' }
        : ['C:/fixtures/person.png', 'C:/fixtures/motion.mp4'].includes(path) ? { data: 'AQID' } : null },
      aimi: { upload: (args: unknown) => handlers.get('aimi:upload')!(null, args),
        request: (args: unknown) => handlers.get('aimi:request')!(null, args),
        download: async () => ({ ok: true, data: { path: 'C:/fixtures/output.mp4' } }) },
    })
    const store = useNodeStore()
    store.addNode({ id: 'out', type: 'ai-video', position: { x: 0, y: 0 }, data: {
      label: 'C5', status: 'idle', providerId: 'aimi', model, duration: 7, prompt: '保持人物外观，参考视频动作', ...data,
    } })
    async function generate() {
      const result = store.executeNode('out')
      await vi.advanceTimersByTimeAsync(10001)
      await result
    }
    return { store, requests, uploads, generate }
  }

  it('submits both local character images and the motion video once with their numbered prompt bindings', async () => {
    const run = setup({ _uploads: [video, image, otherImage],
      prompt: '参考 @[动作](v) 的运镜，把黑衣人物替换为 @[黑衣](i)，白衣人物替换为 @[白衣](i2)' })
    await run.generate()
    expect(run.store.nodes[0].data.error).toBeUndefined()
    expect(run.requests).toEqual([{ model, prompt: '参考 @视频1 的运镜，把黑衣人物替换为 @图片1，白衣人物替换为 @图片2',
      seconds: 7, resolution: '720p', aspect_ratio: '16:9', image_refs: [imageUrl, otherImageUrl], reference_video_urls: [videoUrl] }])
    expect(run.store.nodes[0].data.aimiSubmission).toMatchObject({ taskId: 'fixture-task', images: 2, videos: 1 })
  })

  it.each([['@图片2', [image, video]], ['@视频1', [image]], ['@图片1', []]] as const)(
    'blocks an unbound numbered reference (%s) before uploading or posting', async (mention, assets) => {
      const run = setup({ prompt: '跟随 ' + mention, _uploads: assets })
      await run.generate()
      expect(run.store.nodes[0].data.error).toContain(mention)
      expect(run.uploads).toEqual([])
      expect(run.requests).toEqual([])
    })

  it('reports what was sent if C5 still rejects image material, without retrying or exposing URLs', async () => {
    const run = setup({ _uploads: [image, otherImage, video], prompt: '参考 @图片1 @图片2 @视频1' }, { rejectImageMaterial: true })
    await run.generate()
    const result = run.store.nodes[0].data
    expect(run.requests).toHaveLength(1)
    expect(result.error).toMatch(/HTTP 400.*未识别.*2 张图片.*1 段视频/)
    expect(result.error).not.toMatch(/https?:\/\/|fixture-only/)
    expect(result.taskId).toBeUndefined()
  })

  it.each([
    ['right-click Execute with saved attachments', { _uploads: [image, video] }],
    ['node button with synchronized inputs', { _uploads: [image, video], inputImage: image.url, inputImages: [image.url], inputVideo: video.url, inputVideos: [video.url] }],
    ['an older project with only input fields', { inputImage: image.url, inputVideo: video.url }],
  ] as const)('sends both reference URLs once: %s', async (_, data) => {
    const run = setup(data)
    await run.generate()
    expect(run.requests).toEqual([{
      model, prompt: '保持人物外观，参考视频动作', seconds: 7, resolution: '720p', aspect_ratio: '16:9',
      image_refs: [imageUrl], reference_video_urls: [videoUrl],
    }])
    expect(run.uploads).toEqual(['/pg/reference-images', '/v1/reference-videos'])
    expect(run.store.nodes[0].data.aimiSubmission).toEqual({ taskId: 'fixture-task', providerId: 'aimi', model, images: 1, videos: 1, audios: 0 })
  })

  it('uses current connections and attachments in panel order, and binds prompt mentions to them', async () => {
    const connected = 'https://media.example.test/scene.png'
    const run = setup({ _uploads: [image, video], inputImages: ['https://media.example.test/removed.png'],
      prompt: '用 @[人物.png](i) 在 @[场景](node_scene) 中跟随 @[动作.mp4](v)' })
    run.store.addNode({ id: 'scene', type: 'asset-ref', position: { x: 0, y: 0 }, data: { assetType: 'image', assetUrl: connected } })
    run.store.addEdge({ id: 'edge', source: 'scene', target: 'out' })
    await run.generate()
    expect(run.requests).toMatchObject([{ image_refs: [connected, imageUrl], reference_video_urls: [videoUrl], prompt: '用 @图片2 在 @图片1 中跟随 @视频1' }])
  })

  it('does not resurrect removed references and still allows text-only generation', async () => {
    const run = setup({ _uploads: [], inputImage: image.url, inputVideos: [video.url] })
    await run.generate()
    expect(run.requests).toHaveLength(1)
    expect(run.requests[0]).toEqual({ model, prompt: '保持人物外观，参考视频动作', seconds: 7, resolution: '720p', aspect_ratio: '16:9' })
    expect(run.uploads).toEqual([])
  })

  it('preserves a video-only reference without inventing an image attachment', async () => {
    const run = setup({ _uploads: [video], prompt: '跟随 @视频1 的动作' })
    await run.generate()
    expect(run.requests).toEqual([{ model, prompt: '跟随 @视频1 的动作', seconds: 7, resolution: '720p', aspect_ratio: '16:9',
      reference_video_urls: [videoUrl] }])
    expect(run.store.nodes[0].data.aimiSubmission).toMatchObject({ images: 0, videos: 1 })
  })

  it('can retrieve an already accepted job even if its references were later removed', async () => {
    const run = setup({ taskId: 'fixture-task', _uploads: [], prompt: '参考 @[已删除](i)' })
    await run.generate()
    expect(run.requests).toEqual([])
    expect(run.uploads).toEqual([])
    expect(run.store.nodes[0].data.status).toBe('completed')
  })

  it.each(['missing URL', 'failed upload', 'removed mention'])('does not create a paid job with an unusable selection: %s', async problem => {
    const run = setup({ _uploads: [image, problem === 'missing URL' ? { ...video, url: '' } : video],
      ...(problem === 'removed mention' ? { prompt: '使用 @[已删除](gone)' } : {}) }, { rejectVideo: problem === 'failed upload' })
    await run.generate()
    expect(run.requests).toEqual([])
    expect(run.store.nodes[0].data).toMatchObject({ status: 'error', error: expect.stringMatching(/素材|上传|参考/) })
  })
})
