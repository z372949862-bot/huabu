<template>
  <Teleport to="body">
    <div class="inpaint-overlay" @click="$emit('close')">
      <div class="inpaint-content" @click.stop>
        <div class="inpaint-toolbar">
          <span class="inpaint-hint">在图上拖拽矩形选区，输入 prompt 后点「重绘」</span>
          <button class="inpaint-close" @click="$emit('close')">
            <svg viewBox="0 0 16 16" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none">
              <line x1="3" y1="3" x2="13" y2="13"/>
              <line x1="13" y1="3" x2="3" y2="13"/>
            </svg>
          </button>
        </div>
        <div class="inpaint-canvas-wrap">
          <img
            ref="imgRef"
            :src="src"
            class="inpaint-img"
            draggable="false"
            @load="onImgLoad"
          />
          <div
            class="inpaint-hit"
            @mousedown="onDown"
            @mousemove="onMove"
            @mouseup="onUp"
            @mouseleave="onUp"
          >
            <div v-if="rect" class="inpaint-rect" :style="rectStyle"></div>
          </div>
        </div>
        <div class="inpaint-bottom">
          <input
            v-model="prompt"
            placeholder="描述选区内要重绘的内容（例如：换成蓝色机械义眼）"
            class="inpaint-prompt"
            @keydown.enter="run"
          />
          <button
            class="inpaint-go"
            :disabled="!canRun"
            @click="run"
          >{{ running ? '重绘中…' : '✨ 重绘选区' }}</button>
        </div>
        <div v-if="errorMsg" class="inpaint-error">{{ errorMsg }}</div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, type CSSProperties } from 'vue'
import { runInpaint } from '@/services/inpaintingService'

const props = defineProps<{ src: string }>()
const emit = defineEmits<{
  close: []
  done: [composed: string]
}>()

const imgRef = ref<HTMLImageElement>()
const rect = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const dragStart = ref<{ x: number; y: number } | null>(null)
const prompt = ref('')
const running = ref(false)
const errorMsg = ref('')

const canRun = computed(() =>
  !!rect.value &&
  rect.value.w >= 8 &&
  rect.value.h >= 8 &&
  prompt.value.trim().length > 0 &&
  !running.value,
)

function onImgLoad() {
  // 只是确保 img 已加载；真正的尺寸映射在 runInpaint 内做
}

function localPoint(e: MouseEvent): { x: number; y: number } {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function onDown(e: MouseEvent) {
  const p = localPoint(e)
  dragStart.value = p
  rect.value = { x: p.x, y: p.y, w: 0, h: 0 }
}
function onMove(e: MouseEvent) {
  if (!dragStart.value) return
  const p = localPoint(e)
  rect.value = {
    x: Math.min(dragStart.value.x, p.x),
    y: Math.min(dragStart.value.y, p.y),
    w: Math.abs(p.x - dragStart.value.x),
    h: Math.abs(p.y - dragStart.value.y),
  }
}
function onUp() {
  dragStart.value = null
}

const rectStyle = computed<CSSProperties>(() => {
  if (!rect.value) return {}
  return {
    left: rect.value.x + 'px',
    top: rect.value.y + 'px',
    width: rect.value.w + 'px',
    height: rect.value.h + 'px',
  }
})

async function run() {
  if (!canRun.value || !rect.value || !imgRef.value) return
  running.value = true
  errorMsg.value = ''
  try {
    const composed = await runInpaint(props.src, imgRef.value, rect.value, prompt.value.trim())
    emit('done', composed)
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '重绘失败'
  } finally {
    running.value = false
  }
}
</script>

<style scoped>
.inpaint-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
}
.inpaint-content {
  background: #0a0e1a;
  border: 1px solid rgba(110, 231, 255, 0.3);
  border-radius: 8px;
  padding: 16px;
  max-width: 92vw;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), 0 0 30px rgba(110, 231, 255, 0.15);
}
.inpaint-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #6ee7ff;
  font-size: 13px;
}
.inpaint-close {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
}
.inpaint-close:hover { color: #fff; }
.inpaint-canvas-wrap {
  position: relative;
  max-height: 70vh;
  overflow: hidden;
  border-radius: 4px;
  background: #050810;
}
.inpaint-img {
  display: block;
  max-width: 86vw;
  max-height: 70vh;
  user-select: none;
  pointer-events: none;
}
.inpaint-hit {
  position: absolute;
  inset: 0;
  cursor: crosshair;
}
.inpaint-rect {
  position: absolute;
  border: 2px dashed #6ee7ff;
  background: rgba(110, 231, 255, 0.12);
  pointer-events: none;
  box-shadow: 0 0 20px rgba(110, 231, 255, 0.3);
}
.inpaint-bottom {
  display: flex;
  gap: 8px;
}
.inpaint-prompt {
  flex: 1;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(110, 231, 255, 0.3);
  color: #fff;
  padding: 8px 12px;
  border-radius: 4px;
  outline: none;
  font-size: 13px;
}
.inpaint-prompt:focus {
  border-color: #6ee7ff;
}
.inpaint-go {
  background: linear-gradient(90deg, #6ee7ff, #a78bfa);
  border: none;
  color: #0a0e1a;
  padding: 8px 20px;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  white-space: nowrap;
}
.inpaint-go:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  filter: grayscale(0.4);
}
.inpaint-go:hover:not(:disabled) {
  box-shadow: 0 0 20px rgba(110, 231, 255, 0.55);
  transform: translateY(-1px);
}
.inpaint-error {
  color: #ff9d6e;
  font-size: 12px;
  background: rgba(255, 157, 110, 0.1);
  border: 1px solid rgba(255, 157, 110, 0.3);
  padding: 6px 10px;
  border-radius: 4px;
}
</style>
