import { File as NodeFile } from 'node:buffer'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, h } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import CustomNode from '../CustomNode.vue'
import { useAIStore } from '@/stores/ai'
import { useNodeStore } from '@/stores/node'

vi.mock('@vue-flow/core', async orig => ({ ...await orig<typeof import('@vue-flow/core')>(),
  Handle: { render: () => null }, useVueFlow: () => ({ viewport: { value: { zoom: 1 } }, updateNodeInternals: vi.fn() }),
}))
let cleanup: (() => void) | undefined
afterEach(() => { cleanup?.(); vi.unstubAllGlobals() })

function mountNode(data: Record<string, unknown> = {}) {
  const pinia = createPinia(); setActivePinia(pinia)
  const store = useNodeStore(), ai = useAIStore()
  const providerId = ai.addProvider({ name: 'AIMI', kind: 'aimi', apiKey: 'fixture-only' })
  store.addNode({ id: 'node', type: 'ai-video', position: { x: 0, y: 0 }, data: { label: '视频', status: 'idle',
    model: 'seedance-2.5-720p-c5', prompt: '参考人物和动作', providerId, duration: 5, ...data } })
  store.selectNode('node')
  const host = document.createElement('div'); document.body.append(host)
  const app = createApp({ render: () => h(CustomNode, { id: 'node', type: 'ai-video', data: store.nodes[0].data as any }) })
  app.use(pinia); app.mount(host); cleanup = () => { app.unmount(); host.remove() }
  return { store, host, providerId }
}

it.each(['node button', 'context menu'])('cannot submit while a selected local file is still being read: %s', async entry => {
  const pending: (() => void)[] = []
  vi.stubGlobal('File', NodeFile)
  vi.stubGlobal('FileReader', class {
    result = ''; onload?: () => void
    readAsDataURL(file: File) { pending.push(() => { this.result = `data:${file.type};base64,AQID`; this.onload?.() }) }
  })
  const request = vi.fn(async (_args: { path: string; body: unknown }) => ({ ok: false, error: 'offline: stopped after inspecting the request' }))
  vi.stubGlobal('electronAPI', { upload: { save: async (_: string, name: string) => 'C:/fixtures/' + name, read: async () => ({ data: 'AQID' }) }, aimi: {
    upload: async ({ kind }: { kind: string }) => ({ ok: true, data: { url: `https://media.example.test/${kind}` } }), request,
  } })
  const { store, host } = mountNode()
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!
  Object.defineProperty(input, 'files', { value: [new File(['a'], 'ref.png', { type: 'image/png' }), new File(['v'], 'ref.mp4', { type: 'video/mp4' })] })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  const generate = () => host.querySelector<HTMLButtonElement>('.generate-btn')!.click()
  // Complete only the first of two selected files. A one-image generation would also be a broken request.
  pending.shift()!(); await vi.waitFor(() => expect(pending).toHaveLength(1))
  if (entry === 'node button') generate(); else await store.executeNode('node')
  await new Promise(r => setTimeout(r, 0))
  expect(request).not.toHaveBeenCalled()
  pending.shift()!(); await vi.waitFor(() => expect(store.nodes[0].data._uploads?.filter((a: { url: string }) => a.url)).toHaveLength(2))
  expect(request).not.toHaveBeenCalled()
  generate()
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  expect(request.mock.calls[0][0]).toMatchObject({ path: '/v1/videos', body: {
    image_refs: ['https://media.example.test/image'], reference_video_urls: ['https://media.example.test/video'],
  } })
})

it('shows full reference mode immediately on a reopened C5 node with saved media', () => {
  const { host } = mountNode({ _uploads: [{ id: 'video', name: '动作', type: 'video', url: 'https://media.example.test/ref.mp4' }] })
  expect(host.querySelector('.mode-trigger')?.getAttribute('aria-label')).toBe('生成模式：全能参考')
})
