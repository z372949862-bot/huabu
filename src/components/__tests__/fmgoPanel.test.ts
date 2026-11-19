import { createApp, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import CustomNode from '../CustomNode.vue'
import { useAIStore } from '@/stores/ai'
import { useNodeStore } from '@/stores/node'

vi.mock('@vue-flow/core', async original => ({ ...await original<typeof import('@vue-flow/core')>(),
  Handle: { render: () => null }, useVueFlow: () => ({ viewport: { value: { zoom: 1 } }, updateNodeInternals: vi.fn() }),
}))
afterEach(() => vi.unstubAllGlobals())

it('keeps a legacy video attachment when the user changes model, duration and resolution on the node', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const nodes = useNodeStore(), ai = useAIStore()
  const id = ai.addProvider({ type: 'video', kind: 'fmgo', apiKey: 'fixture' })
  const video = 'https://cdn.example.test/take.mp4'
  nodes.addNode({ id: 'canvas', type: 'ai-video', position: { x: 0, y: 0 }, data: { label: '视频', status: 'idle', providerId: id,
    model: 'feimiao-v2.5-720p-30s', prompt: '参考动作', duration: 30, resolution: '720p', inputVideo: video } })
  nodes.selectNode('canvas')
  const request = vi.fn(async (_args: { path: string; body: any }) => ({ ok: false, error: 'offline fixture' }))
  vi.stubGlobal('electronAPI', { fmgo: { request } })
  const host = document.createElement('div'); document.body.append(host)
  const app = createApp({ render: () => h(CustomNode, { id: 'canvas', type: 'ai-video', data: nodes.nodes[0].data as any }) }).use(pinia)
  const click = async (selector: string, text?: string) => {
    const button = [...host.querySelectorAll<HTMLButtonElement>(selector)].find(b => !text || b.textContent?.includes(text))
    expect(button).toBeDefined(); button!.click(); await nextTick()
  }
  try {
    app.mount(host); await nextTick()
    expect(host.querySelector('.mode-trigger')?.getAttribute('aria-label')).toContain('全能参考')
    await click('.model-btn'); await click('.model-option', 'Pro')
    await click('.duration-trigger')
    const slider = host.querySelector<HTMLInputElement>('.duration-slider')!
    expect([slider.min, slider.max]).toEqual(['4','30'])
    slider.value = '17'; slider.dispatchEvent(new Event('input')); await nextTick()
    await click('.size-trigger'); await click('.resolution-option', '480p')
    await click('.generate-btn'); await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    expect(request.mock.calls[0][0].body).toMatchObject({ model: 's2.5-pro', resolution: '480p', seconds: '17', reference_videos: [video] })
    await click('.model-btn'); await click('.model-option', 'Max')
    const fixed = host.querySelector<HTMLButtonElement>('.duration-trigger')!
    expect(fixed.disabled).toBe(true); expect(fixed.textContent).toContain('30')
    await click('.size-trigger'); await click('.resolution-option', '1080p')
    await click('.generate-btn'); await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    expect(request.mock.calls[1][0].body).toMatchObject({ model: 's2.5-max-1080p', resolution: '1080p', seconds: '30', reference_videos: [video] })
  } finally { app.unmount(); host.remove() }
})
