<template>
  <div class="style-preset" @click.stop @mousedown.stop>
    <button
      class="style-preset-btn"
      title="风格预设"
      @click="open = !open"
    >🎭</button>
    <transition name="enhance-menu">
      <div v-if="open" class="style-preset-panel">
        <div class="style-preset-categories">
          <button
            v-for="c in categories"
            :key="c"
            class="cat-tab"
            :class="{ active: activeCat === c }"
            @click="activeCat = c"
          >{{ c }}</button>
        </div>
        <div class="style-preset-grid">
          <div
            v-for="p in visiblePresets"
            :key="p.id"
            class="preset-card"
            :title="p.name"
            @click="onPick(p)"
          >
            <div class="preset-cover">{{ p.cover }}</div>
            <div class="preset-name">{{ p.name }}</div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { STYLE_PRESETS, type StylePreset } from '@/services/stylePresets'

const emit = defineEmits<{ pick: [preset: StylePreset] }>()

const open = ref(false)
const categories = ['科幻', '漫画', '写实', '艺术'] as const
const activeCat = ref<typeof categories[number]>('科幻')
const visiblePresets = computed(() => STYLE_PRESETS.filter((p) => p.category === activeCat.value))

function onPick(p: StylePreset) {
  emit('pick', p)
  open.value = false
}
</script>

<style scoped>
.style-preset {
  position: relative;
}
.style-preset-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(167, 139, 250, 0.15);
  border: 1px solid rgba(167, 139, 250, 0.4);
  color: #c7b6ff;
  border-radius: 50%;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  transition: all 0.18s;
  backdrop-filter: blur(4px);
}
.style-preset-btn:hover {
  background: rgba(167, 139, 250, 0.3);
  box-shadow: 0 0 12px rgba(167, 139, 250, 0.5);
  transform: scale(1.08);
}
.style-preset-panel {
  position: absolute;
  top: 28px;
  right: 0;
  width: 280px;
  max-height: 360px;
  display: flex;
  flex-direction: column;
  background: rgba(10, 14, 26, 0.96);
  border: 1px solid rgba(167, 139, 250, 0.35);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 16px rgba(167, 139, 250, 0.15);
  overflow: hidden;
}
.style-preset-categories {
  display: flex;
  border-bottom: 1px solid rgba(167, 139, 250, 0.2);
}
.cat-tab {
  flex: 1;
  background: transparent;
  border: none;
  color: #aaa;
  padding: 6px 8px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.cat-tab.active {
  background: rgba(167, 139, 250, 0.18);
  color: #c7b6ff;
}
.cat-tab:not(.active):hover {
  background: rgba(255, 255, 255, 0.04);
  color: #e6f7ff;
}
.style-preset-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 8px;
  overflow-y: auto;
  flex: 1;
}
.preset-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 4px;
  background: rgba(167, 139, 250, 0.08);
  border: 1px solid rgba(167, 139, 250, 0.2);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}
.preset-card:hover {
  background: rgba(167, 139, 250, 0.22);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(167, 139, 250, 0.3);
}
.preset-cover {
  font-size: 18px;
  line-height: 1;
}
.preset-name {
  font-size: 10px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.enhance-menu-enter-active,
.enhance-menu-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}
.enhance-menu-enter-from,
.enhance-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
