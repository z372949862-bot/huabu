import { File as NodeFile } from 'node:buffer'
import { createRequire } from 'node:module'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FmgoProvider } from '@/services/providers/fmgo'
import { useNodeStore } from '../node'

vi.mock('@/stores/ai', () => ({ useAIStore: () => ({
  getProvider: () => new FmgoProvider('fixture-key'),
  getProviderConfig: () => ({ id: 'fm', kind: 'fmgo', apiKey: 'fixture-key', name: '飞喵' }),
}) }))
vi.mock('@/stores/asset', () => ({ useAssetStore: () => ({ addAsset: vi.fn() }) }))
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))
const register = createRequire(import.meta.url)('../../../electron/fmgo.cjs')
const png = 'iVBORw0KGgo=', mp4 = 'AAAAFGZ0eXBpc29t', mp3 = 'SUQzAwA='
const person = { id: 'one', name: '人物.png', type: 'image', url: 'local-upload:///C:/fixtures/person.png' }
const secondJpeg = '/9j/4AAQSkZJRg=='
const replacement = { id: 'second', name: '白衣.jpg', type: 'image', url: 'file:///C:/fixtures/%E7%99%BD%E8%A1%A3.jpg' }
const other = { id: 'two', name: '背景.png', type: 'image', url: 'https://cdn.example.test/scene.png' }
const motion = { id: 'motion', name: '动作.mp4', type: 'video', url: 'local-upload:///C:/fixtures/motion.mp4' }
const music = { id: 'music', name: '音乐.mp3', type: 'audio', url: 'local-upload:///C:/fixtures/music.mp3' }
const videoUrl = 'https://cdn.example.test/motion.mp4', audioUrl = 'https://cdn.example.test/music.mp3'

function setup(data: Record<string, any>, issue?: 'stage' | 'create' | 'missing') {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  const posts: any[] = [], polls: string[] = [], files: Array<[string, string]> = []
  const handlers = new Map<string, Function>()
  register({ ipcMain: { handle: (k: string, fn: Function) => handlers.set(k, fn) },
    stagingFetch: async (url: string, init: RequestInit) => {
      expect(url).toBe('https://imageproxy.zhongzhuan.chat/api/upload')
      expect(new Headers(init.headers).has('Authorization')).toBe(false)
      const file = (init.body as FormData).get('file') as File
      files.push([file.type, Buffer.from(await file.arrayBuffer()).toString('base64')])
      if (issue === 'stage') return new Response(null, { status: 422 })
      return Response.json({ url: file.type === 'video/mp4' ? videoUrl : audioUrl })
    }, net: { fetch: async (url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer fixture-key')
      if (init.method === 'POST') {
        expect(url).toBe('https://api.feimiaoapi.com/v1/videos')
        posts.push(JSON.parse(String(init.body)))
        if (issue === 'create') return Response.json({ error: { message: 'reference video unsupported' } }, { status: 422 })
        return Response.json({ id: 'sample-job' })
      }
      polls.push(url)
      return Response.json({ status: 'completed', video_url: 'https://cdn.example.test/result.mp4' })
    } } })
  vi.stubGlobal('File', NodeFile)
  vi.stubGlobal('electronAPI', {
    upload: { read: async (path: string) => path.endsWith('白衣.jpg') ? { data: secondJpeg } : path.endsWith('person.png') ? { data: png } : path.endsWith('music.mp3') ? { data: mp3 } : path.endsWith('motion.mp4') && issue !== 'missing' ? { data: mp4 } : null },
    fmgo: { request: (args: unknown) => handlers.get('fmgo:request')!(null, args), upload: (args: unknown) => handlers.get('fmgo:upload')!(null, args), download: async () => ({ ok: true, data: { path: 'C:/fixtures/result.mp4' } }) },
  })
  const store = useNodeStore()
  store.addNode({ id: 'out', type: 'ai-video', position: { x: 0, y: 0 }, data: { providerId: 'fm', model: 's2.5-pro', duration: 13, resolution: '480p', ratio: '9:16', status: 'idle', prompt: '按参考动作拍摄', ...data } })
  const generate = async () => { const run = store.executeNode('out'); await vi.advanceTimersByTimeAsync(10001); await run }
  return { store, posts, files, polls, generate }
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('飞喵：从画布到实际序列化的 HTTP 请求', () => {
  it('sends the local motion clip and both pictures to Pro in the order shown on the canvas', async () => {
    const r = setup({ _uploads: [motion, person], prompt: '跟随 @[动作](motion)，用 @[人物](one) 替换 @[背景](node_back)' })
    r.store.addNode({ id: 'back', type: 'asset-ref', position: { x: 0, y: 0 }, data: { assetType: 'image', assetUrl: other.url } })
    r.store.addEdge({ id: 'edge', source: 'back', target: 'out' })
    await r.generate()
    expect(r.store.nodes[0].data.error).toBeUndefined()
    expect(r.files).toEqual([['video/mp4', mp4]])
    expect(r.posts).toEqual([expect.objectContaining({ model: 's2.5-pro', resolution: '480p', seconds: '13', aspect_ratio: '9:16',
      prompt: '跟随 @视频1，用 @图片2 替换 @图片1', images: [other.url, 'data:image/png;base64,' + png], reference_videos: [videoUrl] })])
    expect(r.store.nodes[0].data.fmgoSubmission).toMatchObject({ taskId: 'sample-job', images: 2, videos: 1, audios: 0 })
  })
  it('sends two distinct local character files and the motion clip together from direct attachments', async () => {
    const r = setup({ _uploads: [motion, person, replacement], prompt: '参考 @[动作](motion)，角色分别使用 @[人物](one)、@[白衣](second)' })
    await r.generate()
    expect(r.files).toEqual([['video/mp4', mp4]])
    expect(r.posts).toEqual([expect.objectContaining({ prompt: '参考 @视频1，角色分别使用 @图片1、@图片2',
      images: ['data:image/png;base64,' + png, 'data:image/jpeg;base64,' + secondJpeg], reference_videos: [videoUrl] })])
  })
  it.each(['720p','1080p'])('sends a video by itself to Max at %s, including from a saved project', async resolution => {
    const r = setup({ model: 's2.5-max', resolution, duration: 30, inputVideo: 'C:\\fixtures\\motion.mp4' })
    await r.generate()
    expect(r.files).toEqual([['video/mp4', mp4]])
    expect(r.posts).toEqual([expect.objectContaining({ model: `s2.5-max-${resolution}`, resolution, seconds: '30', reference_videos: [videoUrl] })])
    expect(r.posts[0]).not.toHaveProperty('images')
  })
  it('prepares a local video even for the previously supported FMGO model', async () => {
    const r = setup({ model: 'feimiao-v2.5-720p-30s', _uploads: [motion], inputVideo: motion.url })
    await r.generate()
    expect(r.posts).toEqual([expect.objectContaining({ reference_videos: [videoUrl] })])
  })
  it('keeps a public video URL and stages audio separately with the right bytes', async () => {
    const r = setup({ _uploads: [{ ...motion, url: videoUrl }, music] })
    await r.generate()
    expect(r.files).toEqual([['audio/mpeg', mp3]])
    expect(r.posts).toEqual([expect.objectContaining({ reference_audios: [audioUrl], reference_videos: [videoUrl] })])
  })
  it('does not reattach deleted materials and polls an accepted task without preparing files again', async () => {
    const r = setup({ _uploads: [], inputVideo: motion.url })
    await r.generate()
    expect(r.posts).toHaveLength(1); expect(r.posts[0]).not.toHaveProperty('reference_videos')
    r.store.updateNodeData('out', { taskId: 'sample-job', prompt: '使用 @[已删除](gone)' })
    await r.generate()
    expect(r.posts).toHaveLength(1); expect(r.files).toEqual([]); expect(r.polls).toHaveLength(2)
  })
  it.each(['pending', 'missing', 'stage', 'unbound', 'empty upstream'] as const)('submits zero generation requests on %s', async issue => {
    const r = setup({ _uploads: [issue === 'pending' ? { ...motion, url: '' } : motion], ...(issue === 'unbound' ? { prompt: '参考 @[已删除](gone)' } : {}) }, issue === 'missing' || issue === 'stage' ? issue : undefined)
    if (issue === 'empty upstream') { r.store.addNode({ id: 'up', type: 'ai-video', position: { x: 0, y: 0 }, data: { label: '上游视频' } }); r.store.addEdge({ id: 'edge', source: 'up', target: 'out' }) }
    await r.generate()
    expect(r.posts).toEqual([]); expect(r.store.nodes[0].data).toMatchObject({ status: 'error', error: expect.stringMatching(/参考|素材|失效|读取/) })
  })
  it('shows an upstream reference error and never resends a text-only request', async () => {
    const r = setup({ _uploads: [{ ...motion, url: videoUrl }] }, 'create')
    await r.generate()
    expect(r.posts).toHaveLength(1); expect(r.posts[0].reference_videos).toEqual([videoUrl])
    expect(r.store.nodes[0].data.error).toMatch(/422.*reference video unsupported/)
  })
})
