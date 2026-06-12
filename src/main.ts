import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import router from './router'
import App from './App.vue'
import { useAIStore } from './stores/ai'
import { useAssetStore } from './stores/asset'
import { useNodeStore } from './stores/node'
import { useEditorStore } from './stores/editor'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(ElementPlus)

useAIStore().init().catch((err) => {
  console.warn('failed to init AI providers at startup:', err)
})
useAssetStore().init().catch((err) => {
  console.warn('failed to init asset store at startup:', err)
})
useNodeStore().init().catch((err) => {
  console.warn('failed to init node store at startup:', err)
})
useEditorStore().init().catch((err) => {
  console.warn('failed to init editor store at startup:', err)
})

app.mount('#app')
