import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { routerKey, type Router } from 'vue-router'
import { expect, it } from 'vitest'
import Settings from '../index.vue'
import { useAIStore } from '@/stores/ai'

it('offers the selected video providers and adds the chosen kind', async () => {
  const host = document.createElement('div')
  const pinia = createPinia()
  const app = createApp(Settings).use(pinia).provide(routerKey, {} as Router)
  const store = useAIStore(pinia)
  store.addProvider({ type: 'video', kind: 'yu25', name: '旧配置' })
  app.mount(host)
  try {
    const select = host.querySelector<HTMLSelectElement>('.kind-select')!
    const kinds = ['dmxapi', 'qiling', 'aiide', 'luoci', 'aimi', 'fmgo', 'flyapi', 'flyapi-magi2', 'piapi', 'suanliai', 'ideagates', 'ideagates-overseas']
    expect(Array.from(select.options, option => option.value)).toEqual(kinds)
    expect(select.value).toBe('dmxapi')
    for (const kind of kinds) {
      select.value = kind
      select.dispatchEvent(new Event('change'))
      await nextTick()
      host.querySelector<HTMLButtonElement>('.add-btn')!.click()
      expect(store.videoProviders.at(-1)?.kind).toBe(kind)
    }
  } finally { app.unmount() }
})
