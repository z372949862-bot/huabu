<template>
  <Teleport to="body">
    <div v-if="visible" class="context-menu-overlay" @pointerdown.self="emit('close')" @contextmenu.prevent.self="emit('close')">
      <div ref="menuRef" class="context-menu" role="menu" tabindex="-1" aria-label="画布右键菜单" :style="menuStyle" @contextmenu.prevent @keydown="onKeyDown">
        <template v-for="item in items" :key="item.action">
          <div v-if="item.separatorBefore" class="menu-divider" role="separator" />
          <button type="button" role="menuitem" class="menu-item" :class="{ expanded: openItem?.action === item.action }" :disabled="item.disabled" :aria-haspopup="item.children ? 'menu' : undefined" :aria-expanded="item.children ? openItem?.action === item.action : undefined" @mouseenter="openChild(item, $event)" @focus="openChild(item, $event)" @click="activate(item, $event)">
            <CanvasIcon v-if="item.icon" :name="item.icon" />
            <span class="menu-label">{{ item.label }}</span>
            <span v-if="item.shortcut" class="menu-shortcut">{{ item.shortcut }}</span>
            <span v-if="item.children" class="submenu-arrow">›</span>
          </button>
        </template>
      </div>
      <div v-if="openItem?.children" ref="submenuRef" class="context-menu submenu" role="menu" :aria-label="openItem.label" :style="submenuStyle" @contextmenu.prevent @keydown="onKeyDown">
        <div class="menu-heading">添加节点</div>
        <template v-for="item in openItem.children" :key="item.action">
          <div v-if="item.separatorBefore" class="menu-divider" role="separator" />
          <button type="button" role="menuitem" class="menu-item" :disabled="item.disabled" @click="activate(item, $event)">
            <CanvasIcon v-if="item.icon" :name="item.icon" /><span class="menu-label">{{ item.label }}</span>
          </button>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import CanvasIcon from './CanvasIcon.vue'
import type { CanvasMenuItem } from '@/utils/canvasMenu'
const props = withDefaults(defineProps<{ x: number; y: number; items: CanvasMenuItem[]; visible?: boolean }>(), { visible: true })
const emit = defineEmits<{ select: [action: string]; close: [] }>()
const menuRef = ref<HTMLElement>()
const submenuRef = ref<HTMLElement>()
const openItem = ref<CanvasMenuItem | null>(null)
const trigger = ref<HTMLElement>()
const menuStyle = ref({ left: '0px', top: '0px' })
const submenuStyle = ref({ left: '0px', top: '0px' })
const clamp = (value: number, size: number, max: number) => Math.max(8, Math.min(value, max - size - 8))
const positionMenus = async () => {
  await nextTick()
  if (!menuRef.value) return
  const main = menuRef.value.getBoundingClientRect()
  const left = clamp(props.x, main.width, window.innerWidth)
  menuStyle.value = { left: left + 'px', top: clamp(props.y, main.height, window.innerHeight) + 'px' }
  await nextTick()
  if (!submenuRef.value || !trigger.value) return
  const sub = submenuRef.value.getBoundingClientRect()
  const row = trigger.value.getBoundingClientRect()
  const side = left + main.width + 8 + sub.width <= window.innerWidth - 8 ? left + main.width + 8 : left - sub.width - 8
  submenuStyle.value = { left: clamp(side, sub.width, window.innerWidth) + 'px', top: clamp(row.top - 4, sub.height, window.innerHeight) + 'px' }
}
const openChild = (item: CanvasMenuItem, event: Event) => {
  openItem.value = item.children && !item.disabled ? item : null
  trigger.value = event.currentTarget as HTMLElement
  void positionMenus()
}
const activate = (item: CanvasMenuItem, event: Event) => {
  if (item.disabled) return
  if (item.children) openChild(item, event)
  else emit('select', item.action)
}
const buttons = (panel?: HTMLElement) => Array.from(panel?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])
const onKeyDown = async (event: KeyboardEvent) => {
  const panel = (event.target as HTMLElement).closest('[role=menu]') as HTMLElement
  const entries = buttons(panel)
  const index = entries.indexOf(document.activeElement as HTMLButtonElement)
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault(); event.stopPropagation()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length
    entries[next]?.focus({ preventScroll: true })
  } else if (event.key === 'ArrowRight' && openItem.value) {
    event.preventDefault(); await nextTick(); buttons(submenuRef.value)[0]?.focus({ preventScroll: true })
  } else if (event.key === 'ArrowLeft' && panel === submenuRef.value) {
    event.preventDefault(); trigger.value?.focus({ preventScroll: true }); openItem.value = null
  } else if (event.key === 'Escape' || event.key === 'Tab') {
    event.preventDefault(); event.stopPropagation(); emit('close')
  }
}
watch(() => [props.x, props.y, props.items, props.visible], () => { openItem.value = null; void positionMenus() })
onMounted(async () => { await positionMenus(); menuRef.value?.focus({ preventScroll: true }); window.addEventListener('resize', positionMenus) })
onUnmounted(() => window.removeEventListener('resize', positionMenus))
</script>

<style scoped>
.context-menu-overlay { position: fixed; inset: 0; z-index: 10000; }
.context-menu { position: fixed; box-sizing: border-box; width: min(240px, calc(100vw - 16px)); max-height: calc(100vh - 16px); overflow-y: auto; padding: 4px; border: 0; border-radius: 12px; background: #262626; color: #f5f5f5; box-shadow: 0 8px 56px rgba(0,0,0,.24); outline: none; }
.submenu { width: min(200px, calc(100vw - 16px)); }
.menu-item { display: flex; align-items: center; width: 100%; min-height: 36px; margin: 2px 0; padding: 9px 12px; gap: 8px; border: 0; border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 13px; line-height: 18px; text-align: left; cursor: pointer; outline: none; }
.menu-item:hover:not(:disabled), .menu-item:focus-visible, .menu-item.expanded { background: rgba(255,255,255,.08); }
.menu-item:disabled { color: rgba(255,255,255,.22); cursor: default; }
.menu-item svg { width: 16px; height: 16px; flex-shrink: 0; }
.menu-label { flex: 1; white-space: nowrap; }
.menu-shortcut, .submenu-arrow { color: rgba(255,255,255,.5); white-space: nowrap; }
.submenu-arrow { font-size: 21px; line-height: 16px; }
.menu-divider { height: 1px; margin: 6px 12px; background: rgba(255,255,255,.08); }
.menu-heading { padding: 10px 12px 6px; font-size: 12px; color: rgba(255,255,255,.35); }
</style>
