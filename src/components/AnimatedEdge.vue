<template>
  <g class="edge-interaction">
    <defs>
      <linearGradient :id="`edge-gradient-${id}`" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:#00D9FF;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#B432FF;stop-opacity:1" />
      </linearGradient>
    </defs>
    <!-- 加宽的透明命中区，让悬停和删除不要求精确点中细线 -->
    <path :d="path" class="edge-hit-path" />
    <path
      :id="`edge-path-${id}`"
      :d="path"
      :style="edgeStyle"
      class="vue-flow__edge-path animated-edge"
      :marker-end="markerEnd"
    />

    <!-- 流动粒子 -->
    <circle
      v-for="i in 3"
      :key="i"
      r="3"
      :fill="particleColor"
      class="edge-particle"
    >
      <animateMotion
        :path="path"
        :dur="`${2 + i * 0.3}s`"
        repeatCount="indefinite"
        :begin="`${i * 0.3}s`"
      />
    </circle>

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

const edgeStyle = computed(() => ({
  stroke: '#00D9FF',
  strokeWidth: 3,
  fill: 'none',
  opacity: 0.8,
  filter: 'drop-shadow(0 0 4px #00D9FF)',
}))

const particleColor = computed(() => '#00D9FF')
</script>

<style scoped>
.edge-interaction {
  pointer-events: visiblePainted;
}

.edge-hit-path {
  fill: none;
  stroke: transparent;
  stroke-width: 24;
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
  fill: rgba(22, 25, 36, 0.96);
  stroke: #ff6b8a;
  stroke-width: 1.5;
  filter: drop-shadow(0 0 5px rgba(255, 107, 138, 0.75));
}

.edge-delete-icon {
  fill: #ffb3c2;
  pointer-events: none;
}

.animated-edge {
  animation: edge-glow 2s ease-in-out infinite;
}

@keyframes edge-glow {
  0%, 100% {
    filter: drop-shadow(0 0 4px #00D9FF);
  }
  50% {
    filter: drop-shadow(0 0 8px #B432FF);
  }
}

.edge-particle {
  filter: drop-shadow(0 0 4px currentColor);
}
</style>
