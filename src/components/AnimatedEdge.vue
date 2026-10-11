<template>
  <g class="edge-interaction">
    <!-- 加宽的透明命中区，让悬停和删除不要求精确点中细线 -->
    <path :d="path" class="edge-hit-path" />
    <path
      :id="`edge-path-${id}`"
      :d="path"
      :style="edgeStyle"
      class="vue-flow__edge-path animated-edge"
      :marker-end="markerEnd"
    />

    <!-- 颜色沿弧长分布，竖向和弯曲连线也保持青蓝→暖黄→青蓝的渐变。 -->
    <g v-if="endpointSelected" class="edge-flow-band" aria-hidden="true">
      <path
        v-for="(segment, index) in flowSegments"
        :key="index"
        :d="path"
        pathLength="100"
        class="edge-flow-segment"
        :style="{ stroke: segment.color, opacity: segment.opacity, '--flow-offset': segment.offset }"
      />
    </g>

    <!-- 连线删除按钮：仅在鼠标悬停连线时显示 -->
    <g
      class="edge-delete-control"
      role="button"
      tabindex="0"
      :aria-label="'删除连线'"
      @click.stop="removeConnection"
      @keydown.enter.stop="removeConnection"
      @keydown.space.prevent.stop="removeConnection"
    >
      <circle :cx="labelX" :cy="labelY" r="13" class="edge-delete-bg" />
      <path
        :d="scissorsPath"
        :transform="`translate(${labelX - 8}, ${labelY - 8})`"
        class="edge-delete-icon"
      />
      <title>删除连线</title>
    </g>
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Position, getBezierPath } from '@vue-flow/core'
import type { GraphNode } from '@vue-flow/core'
import { useNodeStore } from '@/stores/node'

interface Props {
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  sourceNode?: GraphNode
  targetNode?: GraphNode
  markerEnd?: string
  selected?: boolean
}

const props = defineProps<Props>()
const nodeStore = useNodeStore()

const edgeGeometry = computed(() => {
  const shared = {
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  }

  // 连线始终使用贝塞尔曲线。之前在节点上下排列、或横向位置接近时切换
  // smooth-step，会生成带直角的“框”路线；即梦的连线在所有方向都保持连续曲线。
  const [pathString, labelX, labelY] = getBezierPath({
    ...shared,
    curvature: 0.28,
  })
  return { path: pathString, labelX, labelY }
})

const path = computed(() => edgeGeometry.value.path)
const labelX = computed(() => edgeGeometry.value.labelX)
const labelY = computed(() => edgeGeometry.value.labelY)

// 根据参考截图近似配色，光带占路径的 36%，两端渐隐，中段局部暖黄。
const flowStops = [
  { at: 0, color: [0, 165, 239], alpha: 0 },
  { at: 0.16, color: [0, 179, 255], alpha: 0.9 },
  { at: 0.49, color: [0, 184, 255], alpha: 1 },
  { at: 0.64, color: [239, 203, 105], alpha: 1 },
  { at: 0.75, color: [24, 190, 246], alpha: 0.95 },
  { at: 1, color: [0, 169, 239], alpha: 0 },
]
const flowSegments = Array.from({ length: 24 }, (_, index) => {
  const progress = (index + 0.5) / 24
  const end = flowStops.findIndex(stop => stop.at >= progress)
  const from = flowStops[end - 1], to = flowStops[end]
  const mix = (progress - from.at) / (to.at - from.at)
  const rgb = from.color.map((value, channel) => Math.round(value + (to.color[channel] - value) * mix))
  return { color: `rgb(${rgb.join(',')})`, opacity: from.alpha + (to.alpha - from.alpha) * mix, offset: `${index * 1.5}px` }
})

// Material-style scissors icon in the 16 x 16 button coordinate space.
const scissorsPath = 'M5.2 4.1a2.1 2.1 0 1 0-1.4 1.9l3.1 2-3.1 2a2.1 2.1 0 1 0 1.4 1.9L8.3 9.7 12.8 13l1.2-1.6-4.4-3.2L14 5 12.8 3.4 8.3 6.7l-3.1-2.6Zm-.5 8a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Zm0-6.2a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Z'

const removeConnection = () => {
  nodeStore.removeEdge(props.id)
}

const endpointSelected = computed(() => props.sourceNode?.selected || props.targetNode?.selected
  || (Boolean(nodeStore.selectedNodeId) && (nodeStore.selectedNodeId === props.sourceNode?.id || nodeStore.selectedNodeId === props.targetNode?.id)))
const active = computed(() => props.selected || endpointSelected.value)

const edgeStyle = computed(() => ({
  stroke: active.value ? '#008EE5' : '#ffffff',
  strokeWidth: 1,
  fill: 'none',
  opacity: active.value ? 1 : 0.16,
}))
</script>

<style scoped>
.edge-interaction {
  pointer-events: visiblePainted;
  color: #8e97a8;
}

.edge-hit-path {
  fill: none;
  stroke: transparent;
  stroke-width: 20;
  pointer-events: stroke;
}

.edge-delete-control {
  opacity: 0;
  pointer-events: none;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.15s ease;
  transform-box: fill-box;
  transform-origin: center;
}

.edge-interaction:hover .edge-delete-control,
.edge-delete-control:focus-visible {
  opacity: 1;
  pointer-events: auto;
}

.edge-delete-control:hover {
  transform: scale(1.08);
}

.edge-delete-bg {
  fill: rgba(25, 27, 32, 0.96);
  stroke: #f08b9d;
  stroke-width: 1.25;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.45));
}

.edge-delete-icon {
  fill: #f4a8b5;
  pointer-events: none;
}

.animated-edge {
  transition: stroke 0.2s ease, opacity 0.2s ease;
}

.edge-flow-band {
  pointer-events: none;
  filter: drop-shadow(0 0 2px rgba(0, 179, 255, 0.55));
}

.edge-flow-segment {
  fill: none;
  stroke-width: 2px;
  stroke-linecap: butt;
  stroke-dasharray: 1.54 98.46;
  pointer-events: none;
  animation: edge-flow 2.8s linear infinite;
}

.edge-interaction:hover .animated-edge {
  stroke: #008EE5 !important;
  opacity: 1 !important;
  stroke-width: 1px !important;
}

@keyframes edge-flow {
  from { stroke-dashoffset: calc(100px - var(--flow-offset)); }
  to { stroke-dashoffset: calc(0px - var(--flow-offset)); }
}

@media (prefers-reduced-motion: reduce) {
  .animated-edge { transition: none; }
  .edge-flow-band { display: none; }
}
</style>
