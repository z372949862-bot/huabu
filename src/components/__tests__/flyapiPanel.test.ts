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

it('sends the chosen duration, resolution and audio asset from the actual video panel', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const ai = useAIStore(), canvas = useNodeStore(), id = ai.addProvider({ type: 'video', kind: 'flyapi', apiKey: 'fixture' })
  canvas.addNode({ id: 'out', type: 'ai-video', position: { x: 0, y: 0 }, data: { status: 'idle', label: '视频', model: 'seedance2.5', providerId: id, prompt: '用这段音乐作参考', duration: 4, resolution: '480p' } })
  canvas.selectNode('out')
  const request = vi.fn(async ({ path }: { path: string; body?: unknown }) => path.endsWith('assetDetail')
    ? { ok: true, data: { assetId: 'asset_music', assetType: 'Audio', status: 'ACTIVE' } } : { ok: false, status: 422, error: 'offline fixture' })
  vi.stubGlobal('electronAPI', { flyapi: { request } })
  const host = document.createElement('div'); document.body.append(host)
  const app = createApp({ render: () => h(CustomNode, { id: 'out', type: 'ai-video', data: canvas.nodes[0].data as any }) }).use(pinia)
  const click = async (selector: string, text?: string) => {
    const button = [...host.querySelectorAll<HTMLButtonElement>(selector)].find(b => !text || b.textContent?.includes(text))
    expect(button?.disabled).toBe(false); button!.click(); await nextTick()
  }
  try {
    app.mount(host); await nextTick()
    await click('.duration-trigger'); const slider = host.querySelector<HTMLInputElement>('.duration-slider')!
    expect([slider.min, slider.max]).toEqual(['4', '30']); slider.value = '27'; slider.dispatchEvent(new Event('input')); await nextTick()
    await click('.size-trigger'); expect([...host.querySelectorAll('.resolution-option')].map(b => b.textContent?.trim().toLowerCase())).toEqual(['480p','720p','1080p']); await click('.resolution-option', '1080p')
    const kind = host.querySelector<HTMLSelectElement>('[aria-label="参考素材类型"]')!, link = host.querySelector<HTMLInputElement>('[aria-label="参考素材链接"]')!
    kind.value = 'audio'; kind.dispatchEvent(new Event('change')); link.value = 'asset_music'; link.dispatchEvent(new Event('input')); await nextTick(); await click('.link-row button')
    expect(host.querySelector('.assets-preview')?.textContent).toContain('已登记音频')
    expect(host.querySelector('.mode-trigger')?.getAttribute('aria-label')).toContain('全能参考')
    await click('.generate-btn'); await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    expect(request.mock.calls[1][0]).toMatchObject({ path: '/v1/videos', body: { model: 'seedance2.5-D', duration: 27, resolution: '1080p', reference_audios: ['assetId://asset_music'] } })
  } finally { app.unmount(); host.remove() }
})
