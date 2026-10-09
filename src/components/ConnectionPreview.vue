<template>
  <g class="connection-preview">
    <path :d="path" class="vue-flow__connection-path" :class="connectionStatus || ''" />
  </g>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { getBezierPath, useVueFlow } from '@vue-flow/core'
import type { ConnectionLineProps } from '@vue-flow/core'
import { connectionPointerKey, receivingOffsetKey, receivingSurfaceKey, connectionInteriorPoint } from '@/utils/canvasConnection'

const props = defineProps<ConnectionLineProps>()
const { vueFlowRef, viewport } = useVueFlow()
const pointer = inject(connectionPointerKey, ref<{ x: number; y: number } | null>(null))
const receivingOffset = inject(receivingOffsetKey, ref({ x: 0, y: 0 }))
const receivingSurface = inject(receivingSurfaceKey, ref<{ left: number; top: number; width: number; height: number } | null>(null))

const targetPoint = computed(() => {
  if (!pointer.value) {
    return { x: props.targetX, y: props.targetY, position: props.targetPosition }
  }
  // Convert client coordinates to this canvas's flow coordinates exactly once.
  const flow = vueFlowRef.value?.getBoundingClientRect()
  if (!flow) return { x: props.targetX, y: props.targetY, position: props.targetPosition }
  const point = receivingSurface.value
    ? connectionInteriorPoint(pointer.value, receivingSurface.value, receivingOffset.value, viewport.value.zoom)
    : pointer.value
  return {
    x: (point.x - flow.left - viewport.value.x) / viewport.value.zoom,
    y: (point.y - flow.top - viewport.value.y) / viewport.value.zoom,
    position: props.targetPosition,
  }
})

const path = computed(() => getBezierPath({
  sourceX: props.sourceX,
  sourceY: props.sourceY,
  sourcePosition: props.sourcePosition,
  targetX: targetPoint.value.x,
  targetY: targetPoint.value.y,
  targetPosition: targetPoint.value.position,
})[0])
</script>

<style scoped>
.connection-preview {
  pointer-events: none;
}
.connection-preview path {
  stroke: #58c8ff;
  stroke-width: 1.5px;
  fill: none;
  opacity: 0.86;
  filter: drop-shadow(0 0 3px rgba(88, 200, 255, 0.65));
}
</style>
