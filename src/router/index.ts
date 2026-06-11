import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
import HomePage from '@/views/HomePage/index.vue'
import NodeEditor from '@/views/NodeEditor/index.vue'
import AssetLibrary from '@/views/AssetLibrary/index.vue'

// Electron 打包后用 file:// 协议加载 dist/index.html，HTML5 history 模式刷新/跳转
// 会直接 404 / 白屏。Hash 模式（#/home 这种）任何协议都能跑，所以打包用 hash、dev 用 web。
const isElectronPackaged =
  typeof window !== 'undefined' && window.location.protocol === 'file:'
const history = isElectronPackaged ? createWebHashHistory() : createWebHistory()

const router = createRouter({
  history,
  routes: [
    {
      path: '/',
      redirect: '/home'
    },
    {
      path: '/home',
      name: 'Home',
      component: HomePage
    },
    {
      path: '/nodes',
      name: 'NodeEditor',
      component: NodeEditor
    },
    {
      path: '/assets',
      name: 'AssetLibrary',
      component: AssetLibrary
    },
    {
      path: '/chat',
      name: 'ChatView',
      component: () => import('@/views/ChatView/index.vue')
    },
    {
      path: '/editor',
      name: 'VideoEditor',
      component: () => import('@/views/VideoEditor/index.vue')
    },
    {
      path: '/settings',
      name: 'Settings',
      component: () => import('@/views/Settings/index.vue')
    }
  ]
})

export default router
