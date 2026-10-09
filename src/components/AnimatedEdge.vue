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

    <!-- 独立流光层：底线保持低亮，短亮段沿同一路径移动 -->
    <path
      :d="path"
      pathLength="100"
      class="edge-flow-path"
    />

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
import { Position, getBezierPath, getSmoothStepPath } from '@vue-flow/core'
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

  // 右侧 source 连到左侧 target 时，如果目标位于源节点左边或两节点横向
  // 重叠，普通贝塞尔曲线会从两个节点背后穿过，画面上只剩两端短弯钩。
  // 此时根据真实节点边界选择较近的上方/下方通道，让整条线绕开节点。
  if (props.targetX <= props.sourceX + 80) {
    const sourceTop = props.sourceNode?.computedPosition?.y ?? props.sourceY - 175
    const targetTop = props.targetNode?.computedPosition?.y ?? props.targetY - 175
    const sourceBottom = sourceTop + (props.sourceNode?.dimensions?.height || 350)
    const targetBottom = targetTop + (props.targetNode?.dimensions?.height || 350)
    const clearance = 48
    const topRoute = Math.min(sourceTop, targetTop) - clearance
    const bottomRoute = Math.max(sourceBottom, targetBottom) + clearance
    const topCost = Math.abs(props.sourceY - topRoute) + Math.abs(props.targetY - topRoute)
    const bottomCost = Math.abs(props.sourceY - bottomRoute) + Math.abs(props.targetY - bottomRoute)
    const routeY = topCost <= bottomCost ? topRoute : bottomRoute
    const [pathString, labelX, labelY] = getSmoothStepPath({
      ...shared,
      centerY: routeY,
      offset: 42,
      borderRadius: 14,
    })
    return { path: pathString, labelX, labelY }
  }

  const [pathString, labelX, labelY] = getBezierPath(shared)
  return { path: pathString, labelX, labelY }
})

const path = computed(() => edgeGeometry.value.path)
const labelX = computed(() => edgeGeometry.value.labelX)
const labelY = computed(() => edgeGeometry.value.labelY)

// Material-style scissors icon in the 16 x 16 button coordinate space.
const scissorsPath = 'M5.2 4.1a2.1 2.1 0 1 0-1.4 1.9l3.1 2-3.1 2a2.1 2.1 0 1 0 1.4 1.9L8.3 9.7 12.8 13l1.2-1.6-4.4-3.2L14 5 12.8 3.4 8.3 6.7l-3.1-2.6Zm-.5 8a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Zm0-6.2a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Z'

const removeConnection = () => {
  nodeStore.removeEdge(props.id)
}

const active = computed(() => props.selected || props.sourceNode?.selected || props.targetNode?.selected
  || (Boolean(nodeStore.selectedNodeId) && (nodeStore.selectedNodeId === props.sourceNode?.id || nodeStore.selectedNodeId === props.targetNode?.id)))

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

.edge-flow-path {
  fill: none;
  stroke: #58c8ff;
  stroke-width: 2.5px;
  stroke-linecap: round;
  stroke-dasharray: 10 90;
  stroke-dashoffset: 100;
  opacity: 0.42;
  pointer-events: none;
  filter: drop-shadow(0 0 3px rgba(88, 200, 255, 0.72));
  animation: edge-flow 2.4s linear infinite;
}

.edge-interaction:hover .animated-edge {
  stroke: #008EE5 !important;
  opacity: 1 !important;
  stroke-width: 1px !important;
}

.edge-interaction:hover .edge-flow-path {
  opacity: 0.95;
  stroke-width: 3px;
}

@keyframes edge-flow {
  to { stroke-dashoffset: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .animated-edge { transition: none; }
  .edge-flow-path { animation: none; opacity: 0.2; }
}
</style>
