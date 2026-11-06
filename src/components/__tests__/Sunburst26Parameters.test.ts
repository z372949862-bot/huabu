import { createApp, h, nextTick, ref } from 'vue'
import { afterEach, expect, it } from 'vitest'
import Sunburst26Parameters from '../Sunburst26Parameters.vue'
import type { Sunburst26Options } from '@/services/geeknowSunburst26'

let cleanup: (() => void) | undefined
afterEach(() => cleanup?.())
it('shows actual pixels, persists custom size and GIF settings, and restores static controls', async () => {
  const options = ref<Sunburst26Options>({})
  const host = document.createElement('div'); document.body.appendChild(host)
  const app = createApp({ render: () => h(Sunburst26Parameters, { modelValue: options.value, ratio: '16:9', resolution: '2K', 'onUpdate:modelValue': (value: Sunburst26Options) => { options.value = value } }) })
  app.mount(host); cleanup = () => { app.unmount(); host.remove() }
  expect(host.textContent).toContain('2048x1152')
  const custom = host.querySelector<HTMLInputElement>('input[type=checkbox]')!
  custom.checked = true; custom.dispatchEvent(new Event('change')); await nextTick()
  expect(options.value).toMatchObject({ customSize: true, width: 2048, height: 1152 })
  const width = host.querySelector<HTMLInputElement>('input[type=number]')!
  width.value = '1728'; width.dispatchEvent(new Event('input')); await nextTick()
  expect(host.textContent).toContain('1728x1152')
  const format = host.querySelector('select')!
  format.value = 'gif'; format.dispatchEvent(new Event('change')); await nextTick()
  expect(host.textContent).toContain('自动尺寸')
  expect(host.textContent).not.toContain('宽度（px）')
  const frames = host.querySelector<HTMLInputElement>('input[type=number]')!
  frames.value = '16'; frames.dispatchEvent(new Event('input')); await nextTick()
  expect(options.value.frameCount).toBe(16)
  format.value = 'png'; format.dispatchEvent(new Event('change')); await nextTick()
  expect(host.textContent).toContain('1728x1152')
  expect(host.textContent).not.toContain('动画帧数')
})
