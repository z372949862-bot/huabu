import { createApp, h, nextTick, ref } from 'vue'
import { afterEach, expect, it } from 'vitest'
import GenerationDurationSelector from '../GenerationDurationSelector.vue'

let cleanup: (() => void) | undefined
afterEach(() => { cleanup?.(); cleanup = undefined })

function mountSelector(props: { options?: number[]; range?: { min: number; max: number } }, initial = 28) {
  const duration = ref(initial)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(GenerationDurationSelector, {
    ...props, modelValue: duration.value,
    'onUpdate:modelValue': (value: number) => { duration.value = value },
  }) })
  app.mount(host)
  cleanup = () => { app.unmount(); host.remove() }
  return { host, duration, trigger: host.querySelector<HTMLButtonElement>('.duration-trigger')! }
}

it.each([10, 30, -1])('opens Luoci options without a range and selects %s seconds', async (value) => {
  const { host, duration, trigger } = mountSelector({ options: [-1, ...Array.from({ length: 27 }, (_, i) => i + 4)] })
  expect(trigger.disabled).toBe(false)
  trigger.click()
  await nextTick()
  const options = [...host.querySelectorAll<HTMLButtonElement>('.duration-option')]
  expect(options).toHaveLength(28)
  const label = value === -1 ? '自动' : `${value} 秒`
  options.find(option => option.textContent === label)!.click()
  await nextTick()
  expect(duration.value).toBe(value)
  expect(trigger.textContent).toContain(label)
})

it.each([
  { options: [5] },
  { options: [5, 5] },
  { range: { min: 5, max: 5 } },
])('keeps fixed durations disabled: %j', async (props) => {
  const { host, trigger } = mountSelector(props, 5)
  expect(trigger.disabled).toBe(true)
  trigger.click()
  await nextTick()
  expect(host.querySelector('.duration-menu')).toBeNull()
})

it('uses selectable options in preference to a fixed range', async () => {
  const { host, duration, trigger } = mountSelector({ options: [5, 10], range: { min: 5, max: 5 } }, 5)
  expect(trigger.disabled).toBe(false)
  trigger.click()
  await nextTick()
  host.querySelectorAll<HTMLButtonElement>('.duration-option')[1].click()
  await nextTick()
  expect(duration.value).toBe(10)
})

it('allows adjusting a variable range with the slider', async () => {
  const { host, duration, trigger } = mountSelector({ range: { min: 4, max: 30 } }, 4)
  expect(trigger.disabled).toBe(false)
  trigger.click()
  await nextTick()
  const slider = host.querySelector<HTMLInputElement>('.duration-slider')!
  slider.value = '12'
  slider.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  expect(duration.value).toBe(12)
  expect(trigger.textContent).toContain('12 秒')
})
