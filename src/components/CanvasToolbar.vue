<template>
  <div ref="toolbarRef" class="canvas-chrome" @contextmenu.stop.prevent>
    <div class="creation-rail" role="toolbar" aria-label="画布创作工具">
      <button v-for="tool in creationTools" :key="tool.type" class="rail-button" :aria-label="tool.label" :data-tooltip="tool.label" @click="emit('create', tool.type)">
        <CanvasIcon :name="tool.icon" />
      </button>
      <span class="rail-divider"></span>
      <button class="rail-button" aria-label="素材库" data-tooltip="素材库" @click="emit('navigate', '/assets')"><CanvasIcon name="assets" /></button>
      <button class="rail-button" aria-label="上传素材" data-tooltip="上传图片、视频或音频" @click="emit('upload')"><CanvasIcon name="upload" /></button>
    </div>

    <div class="viewport-dock" role="toolbar" aria-label="画布视图工具">
      <button :class="['view-button', { active: selectionMode }]" :aria-pressed="selectionMode" aria-label="框选工具" title="框选工具 · Ctrl + 拖拽也可框选" @click="emit('toggleSelection')"><CanvasIcon name="cursor" /></button>
      <button :class="['view-button', { active: showMiniMap }]" :aria-pressed="showMiniMap" aria-label="小地图" title="小地图" @click="emit('toggleMiniMap')"><CanvasIcon name="minimap" /></button>
      <button :class="['view-button', { active: showEdges }]" :aria-pressed="showEdges" aria-label="显示连线" title="显示连线" @click="emit('toggleEdges')"><CanvasIcon name="edges" /></button>
      <button class="zoom-button" :aria-expanded="zoomMenuOpen" aria-label="缩放选项" @click="zoomMenuOpen = !zoomMenuOpen">{{ Math.round(zoom * 100) }}%<CanvasIcon name="chevron" /></button>
      <div v-if="zoomMenuOpen" class="zoom-menu">
        <button @click="emit('fit'); zoomMenuOpen = false"><CanvasIcon name="fit" />适应全部节点</button>
        <button v-for="scale in [0.25, 0.5, 0.75, 1, 1.5, 2]" :key="scale" :class="{ chosen: Math.abs(zoom - scale) < 0.01 }" @click="emit('zoom', scale); zoomMenuOpen = false">{{ scale * 100 }}%</button>
        <div class="zoom-step"><button aria-label="缩小画布" @click="emit('zoom', Math.max(0.1, zoom / 1.2))">−</button><button aria-label="放大画布" @click="emit('zoom', Math.min(4, zoom * 1.2))">+</button></div>
      </div>
    </div>

    <div v-if="searchOpen" class="node-search" role="dialog" aria-label="搜索画布节点">
      <div class="search-input-row"><CanvasIcon name="search" /><input ref="searchInput" v-model="searchQuery" placeholder="搜索节点名称或提示词" aria-label="搜索节点名称或提示词" @keydown.escape.stop="searchOpen = false" /><button class="view-button" aria-label="关闭节点搜索" @click="searchOpen = false"><CanvasIcon name="close" /></button></div>
      <div class="search-results">
        <button v-for="node in searchResults" :key="node.id" @click="emit('focusNode', node.id); searchOpen = false"><CanvasIcon :name="node.type === 'ai-video' ? 'video' : node.type === 'ai-text' ? 'text' : node.data.assetType === 'audio' ? 'audio' : 'image'" /><span>{{ node.data.label || '未命名节点' }}</span></button>
        <p v-if="!searchResults.length">{{ nodes.length ? '没有匹配的节点' : '画布中还没有节点' }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { Node } from '@vue-flow/core'
import CanvasIcon from './CanvasIcon.vue'

const props = defineProps<{ zoom: number; selectionMode: boolean; showMiniMap: boolean; showEdges: boolean; nodes: Node[] }>()
const emit = defineEmits<{
  create: [type: string]
  upload: [type?: 'audio']
  navigate: [path: string]
  toggleSelection: []
  toggleMiniMap: []
  toggleEdges: []
  zoom: [scale: number]
  fit: []
  focusNode: [id: string]
}>()
const creationTools = [
  { type: 'ai-image', icon: 'image', label: '图片节点' },
  { type: 'ai-video', icon: 'video', label: '视频节点' },
]
const toolbarRef = ref<HTMLElement>()
const searchInput = ref<HTMLInputElement>()
const searchOpen = ref(false)
const searchQuery = ref('')
const zoomMenuOpen = ref(false)
const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  return props.nodes.filter(node => `${node.data.label || ''} ${node.data.prompt || ''}`.toLocaleLowerCase().includes(query))
})
const toggleSearch = async () => {
  searchOpen.value = !searchOpen.value
  zoomMenuOpen.value = false
  if (searchOpen.value) {
    await nextTick()
    searchInput.value?.focus()
  }
}
const closeOnOutsideClick = (event: PointerEvent) => {
  const target = event.target as HTMLElement
  if (toolbarRef.value?.contains(target) || target.closest('[data-canvas-search]')) return
  searchOpen.value = false
  zoomMenuOpen.value = false
}
const closeOnEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    searchOpen.value = false
    zoomMenuOpen.value = false
  }
}
onMounted(() => {
  window.addEventListener('canvas-search', toggleSearch)
  window.addEventListener('pointerdown', closeOnOutsideClick)
  window.addEventListener('keydown', closeOnEscape)
})
onUnmounted(() => {
  window.removeEventListener('canvas-search', toggleSearch)
  window.removeEventListener('pointerdown', closeOnOutsideClick)
  window.removeEventListener('keydown', closeOnEscape)
})
</script>

<style scoped>
.canvas-chrome { position: absolute; inset: 0; z-index: 40; pointer-events: none; color: #ececec; font-size: 12px; }
.canvas-chrome button { display: flex; align-items: center; justify-content: center; color: inherit; background: transparent; border: 0; cursor: pointer; font: inherit; transition: background .15s, color .15s; }
.canvas-chrome button:hover { background: #343434; color: #fff; }
.canvas-chrome button:focus-visible { outline: 2px solid #71c7ee; outline-offset: 2px; }
.creation-rail { position: absolute; top: 50%; left: 12px; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: 2px; width: 48px; padding: 4px; box-sizing: border-box; border-radius: 12px; background: #202020; box-shadow: inset 0 0 0 1px #ffffff0a, 0 4px 16px #0002; pointer-events: auto; }
.rail-button { position: relative; width: 40px; height: 40px; flex-shrink: 0; border-radius: 8px; }
.rail-button::after { content: attr(data-tooltip); position: absolute; left: 50px; padding: 7px 10px; border-radius: 6px; background: #303030; white-space: nowrap; box-shadow: 0 3px 14px #0005; opacity: 0; visibility: hidden; pointer-events: none; }
.rail-button:hover::after, .rail-button:focus-visible::after { opacity: 1; visibility: visible; }
.rail-divider { height: 1px; width: 24px; margin: 6px 0; background: #ffffff12; }
.viewport-dock { position: absolute; left: 12px; bottom: 16px; display: flex; align-items: center; gap: 4px; height: 36px; padding: 4px; box-sizing: border-box; border-radius: 8px; background: #131313; box-shadow: inset 0 0 0 1px #ffffff0a; pointer-events: auto; }
.view-button { width: 28px; height: 28px; border-radius: 6px; color: #9c9c9c !important; }
.view-button svg { width: 16px; height: 16px; }
.view-button.active { background: #292929; color: #f0f0f0 !important; }
.zoom-button { min-width: 62px; height: 28px; padding: 0 8px; border-radius: 6px; gap: 4px; font-variant-numeric: tabular-nums; }
.zoom-button svg { width: 12px; height: 12px; }
.zoom-menu { position: absolute; bottom: 44px; left: 0; width: 174px; padding: 6px; border: 1px solid #ffffff14; border-radius: 10px; background: #202020; box-shadow: 0 8px 30px #0006; }
.zoom-menu > button { width: 100%; height: 32px; justify-content: flex-start; padding: 0 10px; border-radius: 5px; gap: 8px; }
.zoom-menu > button.chosen { background: #ffffff10; }
.zoom-step { display: flex; gap: 4px; margin-top: 6px; padding-top: 6px; border-top: 1px solid #ffffff14; }
.zoom-step button { flex: 1; height: 28px; border-radius: 5px; font-size: 20px; }
.node-search { position: absolute; top: 60px; right: 12px; width: min(340px, calc(100% - 88px)); border: 1px solid #ffffff14; border-radius: 12px; background: #202020; box-shadow: 0 8px 30px #0006; overflow: hidden; pointer-events: auto; }
.search-input-row { display: flex; align-items: center; padding: 10px; gap: 8px; border-bottom: 1px solid #ffffff14; }
.search-input-row > svg { color: #a2a2a2; flex-shrink: 0; width: 16px; height: 16px; }
.search-input-row input { width: 100%; min-width: 0; border: 0; outline: 0; padding: 0; background: transparent; color: #eee; font: inherit; }
.search-results { max-height: min(360px, calc(100vh - 160px)); padding: 6px; overflow-y: auto; }
.search-results button { width: 100%; height: 38px; gap: 10px; padding: 0 10px; border-radius: 6px; justify-content: flex-start; text-align: left; }
.search-results svg { flex-shrink: 0; width: 16px; height: 16px; color: #999; }
.search-results span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.search-results p { text-align: center; padding: 18px 0; color: #999; }
@media (max-height: 540px) { .creation-rail { top: 64px; bottom: 68px; transform: none; overflow-y: auto; gap: 0; } .rail-button { height: 34px; } }
@media (max-width: 600px) { .creation-rail { left: 8px; } .viewport-dock { left: 8px; bottom: 10px; } }
</style>
