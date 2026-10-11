<template>
  <div
    ref="canvasRef"
    class="node-editor"
    @contextmenu="handleContextMenu"
    @dragover.prevent="onCanvasDragOver"
    @drop.prevent="onCanvasDrop"
  >
    <VueFlow
      v-model:nodes="nodes"
      v-model:edges="edges"
      :default-viewport="savedViewport || { zoom: 1, x: 0, y: 0 }"
      :min-zoom="0.1"
      :max-zoom="4"
      :snap-to-grid="true"
      :snap-grid="[15, 15]"
      :nodes-draggable="true"
      :elements-selectable="true"
      :is-valid-connection="isValidConnection"
      :default-edge-options="{ type: 'animated' }"
      :selection-key-code="ctrlPressed || selectionMode"
      :multi-selection-key-code="'Control'"
      :pan-on-drag="ctrlPressed || selectionMode ? [1, 2] : true"
      @pane-context-menu="onPaneContextMenu"
      @node-context-menu="onNodeContextMenu"
      @node-click="onNodeClick"
      @pane-click="nodeStore.selectNode(null)"
      @node-drag="onNodeDrag"
      @node-drag-stop="onNodeDragStop"
      class="vue-flow-container"
      :class="{ 'edges-hidden': !showEdges }"
    >
      <template #connection-line="connectionLineProps">
        <ConnectionPreview v-bind="connectionLineProps" />
      </template>
      <Background pattern-color="#333943" :gap="24" :size="1" />
      <MiniMap v-if="showMiniMap" position="bottom-left" :pannable="true" :zoomable="true" mask-color="rgba(0, 0, 0, 0.35)" node-color="#626975" />
    </VueFlow>

    <CanvasToolbar
      :zoom="viewport.zoom"
      :selection-mode="selectionMode"
      :show-mini-map="showMiniMap"
      :show-edges="showEdges"
      :nodes="nodes"
      @create="addFromToolbar"
      @upload="uploadFromToolbar"
      @navigate="router.push($event)"
      @toggle-selection="selectionMode = !selectionMode"
      @toggle-mini-map="showMiniMap = !showMiniMap"
      @toggle-edges="showEdges = !showEdges"
      @zoom="zoomTo($event, { duration: 180 })"
      @fit="fitCanvas"
      @focus-node="focusCanvasNode"
    />

    <!-- 空画布引导 -->
    <div v-if="nodes.length === 0" class="canvas-hint">
      <div class="canvas-hint-text">从左侧添加节点，开始创作</div>
      <div class="canvas-hint-keys">
        <kbd>Delete</kbd> 删除节点 &nbsp;·&nbsp;
        <kbd>滚轮</kbd> 缩放 &nbsp;·&nbsp;
        <kbd>拖拽</kbd> 平移 &nbsp;·&nbsp;
        <kbd>Ctrl + 拖拽</kbd> 框选
      </div>
    </div>

    <!-- 对齐辅助线（跟随 vue-flow viewport 一起 transform） -->
    <div class="alignment-overlay" :style="overlayStyle">
      <div
        v-for="line in alignmentLines"
        :key="line.id"
        class="alignment-line"
        :class="line.type"
        :style="{
          left: line.type === 'vertical' ? line.position + 'px' : '-100000px',
          top: line.type === 'horizontal' ? line.position + 'px' : '-100000px',
        }"
      ></div>
    </div>

    <!-- 右键菜单 -->
    <ContextMenu
      v-if="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenu.items"
      @select="onContextMenuSelect"
      @close="contextMenu.visible = false"
    />

    <!-- 属性面板已移除 - 所有编辑都在节点底部的生成卡片中 -->
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, markRaw, onMounted, watch, onUnmounted, computed, nextTick, provide } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import type { Node, Edge } from '@vue-flow/core'
import { useRoute, useRouter } from 'vue-router'
import ContextMenu from '@/components/ContextMenu.vue'
import type { CanvasMenuItem } from '@/utils/canvasMenu'
import CustomNode from '@/components/CustomNode.vue'
import AnimatedEdge from '@/components/AnimatedEdge.vue'
import ConnectionPreview from '@/components/ConnectionPreview.vue'
import CanvasToolbar from '@/components/CanvasToolbar.vue'
import { useNodeStore } from '@/stores/node'
import { useMaterialStore } from '@/stores/material'
import { receivingNodeKey, receivingOffsetKey, receivingSurfaceKey, connectionPointerKey, connectionFrameOffset, connectionDropNode, canConnectNodes, normalizeCanvasEdges, trackConnectionPointer } from '@/utils/canvasConnection'
import type { ConnectionSurface } from '@/utils/canvasConnection'
import { imageConnectionKey, videoConnectionKey, handleMagnetKey, magneticHandleOffset, isImageNode } from '@/utils/canvasConnection'
import type { HandleMagnet } from '@/utils/canvasConnection'
import { appearingNodesKey } from '@/utils/nodeAppearance'
import { compatibleConnection, isVideoNode } from '@/utils/canvasConnection'

const nodeStore = useNodeStore()
const materialStore = useMaterialStore()

// 将旧版本画布中已经存在的素材引用节点补登记到独立素材库。
const syncCanvasMaterials = (canvasNodes: Node[]) => {
  for (const node of canvasNodes) {
    if (node.type !== 'asset-ref' || !node.data?.assetUrl || !node.data?.assetName) continue
    const assetUrl = String(node.data.assetUrl)
    const localPath = assetUrl.startsWith('local-upload:///')
      ? assetUrl.slice('local-upload:///'.length).replace(/\//g, '\\')
      : undefined
    materialStore.addMaterial({
      type: node.data.assetType || 'image',
      name: node.data.assetName,
      url: assetUrl,
      localPath,
      width: node.data.assetWidth,
      height: node.data.assetHeight,
    })
  }
}
const router = useRouter()
const canvasRef = ref<HTMLElement>()
const selectionMode = ref(false)
const showMiniMap = ref(false)
const showEdges = ref(true)
const appearingNodes = ref(new Set<string>())
let appearanceReady = false
onMounted(async () => {
  await nextTick()
  appearanceReady = true
})
const appearanceTimers = new Map<string, ReturnType<typeof setTimeout>>()
provide(appearingNodesKey, appearingNodes)
const stopAppearanceTracking = nodeStore.$onAction(({ name, args, after }) => {
  if (!appearanceReady || name !== 'addNode') return
  const id = args[0]?.id
  if (!id) return
  after(() => {
    appearingNodes.value.add(id)
    clearTimeout(appearanceTimers.get(id))
    appearanceTimers.set(id, setTimeout(() => {
      appearingNodes.value.delete(id)
      appearanceTimers.delete(id)
    }, 1200))
  })
})
onUnmounted(() => {
  stopAppearanceTracking()
  appearanceTimers.forEach(timer => clearTimeout(timer))
  appearanceTimers.clear()
  appearingNodes.value.clear()
})

// 对齐辅助线
const alignmentLines = ref<Array<{ id: string; type: 'horizontal' | 'vertical'; position: number }>>([])
const ALIGNMENT_THRESHOLD = 10 // 对齐阈值（像素）
const MAX_ALIGNMENT_DISTANCE = 15 // 最大对齐距离（像素），超过不显示

// 连接验证：只允许从source连接到target
const isValidConnection = (connection: any) => {
  const sourceNode = nodeStore.nodes.find(node => node.id === connection.source)
  const targetNode = nodeStore.nodes.find(node => node.id === connection.target)
  return Boolean(connection.source && connection.target && connection.source !== connection.target &&
    sourceNode && targetNode &&
    compatibleConnection(sourceNode, targetNode))
}

// 节点拖动时检测对齐
const onNodeDrag = ({ node }: { node: Node }) => {
  const lines: Array<{ id: string; type: 'horizontal' | 'vertical'; position: number; distance: number }> = []

  // 获取当前节点的边界（flow 坐标，辅助线 overlay 跟随 viewport transform，
  // 所以 line.position 直接用 flow 坐标即可）
  const currentNode = node
  const currentLeft = currentNode.position.x
  const currentRight = currentNode.position.x + (currentNode.dimensions?.width || 0)
  const currentTop = currentNode.position.y
  const currentBottom = currentNode.position.y + (currentNode.dimensions?.height || 0)
  const currentCenterX = currentLeft + (currentNode.dimensions?.width || 0) / 2
  const currentCenterY = currentTop + (currentNode.dimensions?.height || 0) / 2

  // 遍历其他节点检测对齐
  nodes.value.forEach(otherNode => {
    if (otherNode.id === currentNode.id) return

    const otherLeft = otherNode.position.x
    const otherRight = otherNode.position.x + (otherNode.dimensions?.width || 0)
    const otherTop = otherNode.position.y
    const otherBottom = otherNode.position.y + (otherNode.dimensions?.height || 0)
    const otherCenterX = otherLeft + (otherNode.dimensions?.width || 0) / 2
    const otherCenterY = otherTop + (otherNode.dimensions?.height || 0) / 2

    // 两节点中心欧式距离，超过"最大节点尺寸 × 2"就不再提示对齐
    const dx = currentCenterX - otherCenterX
    const dy = currentCenterY - otherCenterY
    const w1 = currentNode.dimensions?.width || 350
    const h1 = currentNode.dimensions?.height || 350
    const w2 = otherNode.dimensions?.width || 350
    const h2 = otherNode.dimensions?.height || 350
    const nearRadius = Math.max(w1, h1, w2, h2) * 2
    if (Math.sqrt(dx * dx + dy * dy) > nearRadius) return

    // 检测垂直对齐（左边、右边、中心）
    const leftDist = Math.abs(currentLeft - otherLeft)
    if (leftDist < ALIGNMENT_THRESHOLD) {
      lines.push({ id: `v-left-${otherNode.id}`, type: 'vertical', position: otherLeft, distance: leftDist })
    }
    const rightDist = Math.abs(currentRight - otherRight)
    if (rightDist < ALIGNMENT_THRESHOLD) {
      lines.push({ id: `v-right-${otherNode.id}`, type: 'vertical', position: otherRight, distance: rightDist })
    }
    const centerXDist = Math.abs(currentCenterX - otherCenterX)
    if (centerXDist < ALIGNMENT_THRESHOLD) {
      lines.push({ id: `v-center-${otherNode.id}`, type: 'vertical', position: otherCenterX, distance: centerXDist })
    }

    // 检测水平对齐（上边、下边、中心）
    const topDist = Math.abs(currentTop - otherTop)
    if (topDist < ALIGNMENT_THRESHOLD) {
      lines.push({ id: `h-top-${otherNode.id}`, type: 'horizontal', position: otherTop, distance: topDist })
    }
    const bottomDist = Math.abs(currentBottom - otherBottom)
    if (bottomDist < ALIGNMENT_THRESHOLD) {
      lines.push({ id: `h-bottom-${otherNode.id}`, type: 'horizontal', position: otherBottom, distance: bottomDist })
    }
    const centerYDist = Math.abs(currentCenterY - otherCenterY)
    if (centerYDist < ALIGNMENT_THRESHOLD) {
      lines.push({ id: `h-center-${otherNode.id}`, type: 'horizontal', position: otherCenterY, distance: centerYDist })
    }
  })

  // 去重：相同位置的线只保留一条（位置相近认为是同一条线）
  const uniqueLines = new Map<string, typeof lines[0]>()
  lines.forEach(line => {
    const key = `${line.type}-${Math.round(line.position)}`
    const existing = uniqueLines.get(key)
    // 保留距离最近的那条线
    if (!existing || line.distance < existing.distance) {
      uniqueLines.set(key, line)
    }
  })

  // 只显示最近的几条线（横竖各1条），且距离不能超过最大限制
  const horizontalLines = Array.from(uniqueLines.values())
    .filter(l => l.type === 'horizontal' && l.distance <= MAX_ALIGNMENT_DISTANCE)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 1)
  const verticalLines = Array.from(uniqueLines.values())
    .filter(l => l.type === 'vertical' && l.distance <= MAX_ALIGNMENT_DISTANCE)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 1)

  alignmentLines.value = [...horizontalLines, ...verticalLines]
}

// 拖动结束清除辅助线 + 把拖完的位置同步回 store
// （vue-flow 的 v-model:nodes 不会自动 emit 位置变化，必须在 drag-stop 里手动写回，
// 否则切 tab 重挂载就丢位置）
const onNodeDragStop = ({ nodes: draggedNodes }: { nodes?: Node[] } = {}) => {
  alignmentLines.value = []
  const list = draggedNodes && draggedNodes.length ? draggedNodes : nodes.value
  list.forEach((n) => {
    const storeNode = nodeStore.nodes.find((s) => s.id === n.id)
    if (storeNode) {
      storeNode.position = { x: n.position.x, y: n.position.y }
    }
  })
}

// 保存/恢复画布视角位置（切页面再回来保持原位）
let savedViewport: { x: number; y: number; zoom: number } | null = null

// 使用本地ref来绑定Vue Flow
const nodes = ref<Node[]>([])
const edges = ref<Edge[]>([])

const {
  screenToFlowCoordinate,
  zoomTo,
  fitView,
  setCenter,
  onConnect,
  setNodes,
  setEdges,
  viewport,
  getSelectedNodes,
  addSelectedNodes,
  removeSelectedNodes,
  onSelectionEnd,
} = useVueFlow({
  nodeTypes: {
    'ai-image': markRaw(CustomNode),
    'ai-video': markRaw(CustomNode),
    'ai-text': markRaw(CustomNode),
    'asset-ref': markRaw(CustomNode),
    'post-process': markRaw(CustomNode),
  },
  edgeTypes: {
    'animated': markRaw(AnimatedEdge),
  },
})

// overlay 跟着 vue-flow viewport 一起 transform，让 alignment-line 用 flow 坐标即可
const overlayStyle = computed(() => {
  const vp = viewport.value
  return {
    position: 'absolute' as const,
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none' as const,
    transformOrigin: '0 0',
    transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
    zIndex: 1000,
  }
})

// 同步nodeStore到本地nodes
// 使用 [...newNodes] 创建新数组引用，确保 Vue Flow 的 v-model 检测到变化
// 否则 store 内部修改 node.data 时数组引用不变，VueFlow 不会重渲染 CustomNode
watch(() => nodeStore.nodes, (newNodes) => {
  nodes.value = [...newNodes]
  syncCanvasMaterials(newNodes as Node[])
}, { deep: true, immediate: true })

let edgeSyncVersion = 0
watch(() => nodeStore.edges, async (newEdges) => {
  const version = ++edgeSyncVersion
  const pendingEdges = [...newEdges]

  // 项目加载和初始化时 nodes / edges 会在同一批次写入。Vue Flow 偶尔先处理
  // edge，节点 lookup 尚未建立就会丢弃该边，表现为“数据还在但连线看不见”。
  // 等节点完成一帧注册后再同步边，并用版本号避免快速更新时写回旧快照。
  await nextTick()
  if (version !== edgeSyncVersion) return
  edges.value = normalizeCanvasEdges(pendingEdges, nodes.value)
}, { deep: true, immediate: true })

// 同步本地nodes的位置变化回nodeStore
watch(nodes, (newNodes) => {
  newNodes.forEach(node => {
    const storeNode = nodeStore.nodes.find(n => n.id === node.id)
    if (storeNode && (storeNode.position.x !== node.position.x || storeNode.position.y !== node.position.y)) {
      storeNode.position = { ...node.position }
    }
  })
}, { deep: true })

const copyableNodeTypes = new Set(['ai-image', 'ai-video', 'asset-ref'])

const isCopyableNode = (node: Node) => {
  if (!copyableNodeTypes.has(node.type || '')) return false
  if (node.type !== 'asset-ref') return true
  const assetType = (node.data as any)?.assetType
  return assetType === 'image' || assetType === 'video'
}

// 框选可能暂时包含其他类型节点；结束时只保留图片/视频相关节点。
onSelectionEnd(() => {
  nodes.value.forEach((node) => {
    if (node.selected && !isCopyableNode(node)) node.selected = false
  })
})

interface NodeClipboard {
  nodes: Node[]
  edges: Edge[]
}

let nodeClipboard: NodeClipboard | null = null
let pasteOffset = 0

const cloneData = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const selectedCopyableNodes = () => nodes.value.filter((node) => node.selected && isCopyableNode(node))

const copySelectedNodes = (fallbackNode?: Node) => {
  const selected = selectedCopyableNodes()
  const sourceNodes = selected.length > 0
    ? selected
    : (fallbackNode && isCopyableNode(fallbackNode) ? [fallbackNode] : [])
  if (sourceNodes.length === 0) return false

  const selectedIds = new Set(sourceNodes.map((node) => node.id))
  nodeClipboard = {
    nodes: sourceNodes.map((node) => ({
      ...cloneData(node),
      selected: false,
      position: { ...node.position },
    })),
    edges: nodeStore.edges
      .filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))
      .map((edge) => cloneData(edge)),
  }
  pasteOffset = 0
  return true
}

const pasteCopiedNodes = (at?: { clientX: number; clientY: number }) => {
  if (!nodeClipboard || nodeClipboard.nodes.length === 0) return false

  const idMap = new Map<string, string>()
  const stamp = Date.now()
  const offset = 45 + (pasteOffset % 6) * 15
  const anchor = at ? screenToFlowCoordinate({ x: at.clientX, y: at.clientY }) : null
  const offsetX = anchor ? anchor.x - Math.min(...nodeClipboard.nodes.map(node => node.position.x)) : offset
  const offsetY = anchor ? anchor.y - Math.min(...nodeClipboard.nodes.map(node => node.position.y)) : offset
  pasteOffset += 1
  const pastedNodes = nodeClipboard.nodes.map((node, index) => {
    const newId = `${node.id}-copy-${stamp}-${index}`
    idMap.set(node.id, newId)
    return {
      ...cloneData(node),
      id: newId,
      draggable: true,
      selectable: true,
      selected: true,
      position: { x: node.position.x + offsetX, y: node.position.y + offsetY },
    } as Node
  })
  const pastedEdges = nodeClipboard.edges
    .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
    .map((edge, index) => ({
      ...cloneData(edge),
      id: `e${stamp}-${index}-${idMap.get(edge.source)}-${idMap.get(edge.target)}`,
      source: idMap.get(edge.source)!,
      target: idMap.get(edge.target)!,
    }))

  // 粘贴后让新组成为当前选择，旧节点取消选中。
  nodes.value.forEach((node) => { node.selected = false })
  pastedNodes.forEach((node) => nodeStore.addNode(node))
  pastedEdges.forEach((edge) => nodeStore.addEdge(edge))
  nextTick(() => {
    const pastedIds = new Set(pastedNodes.map((node) => node.id))
    nodes.value.forEach((node) => {
      node.selected = pastedIds.has(node.id)
      if (pastedIds.has(node.id)) node.draggable = true
    })
    // 同步 Vue Flow 内部的选择集合，确保拖动一组粘贴节点时能移动整组。
    removeSelectedNodes(nodes.value)
    addSelectedNodes(nodes.value.filter((node) => pastedIds.has(node.id)))
    nodeStore.selectNode(pastedNodes[0]?.id || null)
  })
  return true
}

// 监听连线创建（拖拽手柄）
onConnect((connection) => {
  if (connectionCancelled) return
  addCanvasEdge(connection.source, connection.target)
})

/**
 * Add a canvas connection once. Vue Flow normally calls this from a target
 * handle, while the body-drop fallback below uses the same path so both
 * connection gestures persist identical edges.
 */
const addCanvasEdge = (source: string, target: string) => {
  if (!canConnectNodes(source, target, nodeStore.nodes, nodeStore.edges)) return

  const edge: Edge = {
    id: `e${source}-${target}`,
    source,
    target,
    type: 'animated',
  }
  nodeStore.addEdge(edge)
}

// 监听连线开始拖拽（显示节点选择菜单）
const { onConnectStart, onConnectEnd, endConnection } = useVueFlow()
const connectingFrom = ref<{ nodeId: string; handleType: string } | null>(null)
const imageConnection = computed(() => {
  if (connectingFrom.value?.handleType !== 'source') return false
  const source = nodeStore.nodes.find(n => n.id === connectingFrom.value?.nodeId)
  return isImageNode(source)
})
provide(imageConnectionKey, imageConnection)
const videoConnection = computed(() => {
  if (connectingFrom.value?.handleType !== 'source') return false
  const source = nodeStore.nodes.find(n => n.id === connectingFrom.value?.nodeId)
  return isVideoNode(source)
})
provide(videoConnectionKey, videoConnection)
const handleMagnet = ref<HandleMagnet | null>(null)
provide(handleMagnetKey, handleMagnet)
const resetHandleMagnet = () => { handleMagnet.value = null }
const updateHandleMagnet = (event: MouseEvent) => {
  if (connectingFrom.value || event.buttons) { resetHandleMagnet(); return }
  const flow = (event.target as Element | null)?.closest?.('.vue-flow')
  if (!flow) { resetHandleMagnet(); return }
  let nearest: HandleMagnet | null = null
  let nearestDistance = 48
  flow.querySelectorAll<HTMLElement>('.custom-handle').forEach(handle => {
    const rect = handle.getBoundingClientRect()
    const side = handle.classList.contains('source') ? 'source' : 'target'
    const dx = event.clientX - (rect.left + rect.width / 2 + (side === 'source' ? 22 : -22))
    const dy = event.clientY - (rect.top + rect.height / 2)
    const distance = Math.hypot(dx, dy)
    const offset = magneticHandleOffset(dx, dy)
    const nodeId = handle.closest('.vue-flow__node')?.getAttribute('data-id')
    if (offset && nodeId && distance < nearestDistance) {
      nearestDistance = distance
      nearest = { nodeId, side, ...offset }
    }
  })
  handleMagnet.value = nearest
}
const stopHandleMagnetTracking = trackConnectionPointer(updateHandleMagnet)
document.documentElement.addEventListener('pointerleave', resetHandleMagnet)
watch(viewport, resetHandleMagnet, { deep: true })
let connectionCancelled = false
const receivingNodeId = ref<string | null>(null)
const receivingOffset = ref({ x: 0, y: 0 })
const receivingSurface = ref<ConnectionSurface | null>(null)
provide(receivingSurfaceKey, receivingSurface)
const connectionPointer = ref<{ x: number; y: number } | null>(null)
provide(connectionPointerKey, connectionPointer)
provide(receivingNodeKey, receivingNodeId)
provide(receivingOffsetKey, receivingOffset)
const clearConnectionFeedback = () => {
  receivingSurface.value = null
  connectionPointer.value = null
  receivingNodeId.value = null
  receivingOffset.value = { x: 0, y: 0 }
  connectingFrom.value = null
}
const dropCandidateAt = (x: number, y: number) => {
  const from = connectingFrom.value
  if (!from || from.handleType !== 'source') return null
  const target = connectionDropNode(document.elementFromPoint(x, y))
  const targetNode = target ? nodeStore.nodes.find(node => node.id === target) : null
  if (videoConnection.value && isImageNode(targetNode)) return null
  return target && canConnectNodes(from.nodeId, target, nodeStore.nodes, nodeStore.edges) ? target : null
}
const updateConnectionFeedback = (event: MouseEvent) => {
  if (!connectingFrom.value) return
  connectionPointer.value = { x: event.clientX, y: event.clientY }
  const candidate = dropCandidateAt(event.clientX, event.clientY)
  receivingNodeId.value = candidate
  if (!candidate) {
    receivingSurface.value = null
    receivingOffset.value = { x: 0, y: 0 }
    return
  }
  const nodeElement = document.querySelector<HTMLElement>(`.vue-flow__node[data-id="${CSS.escape(candidate)}"]`)
  const rect = nodeElement?.querySelector('.node-surface')?.getBoundingClientRect()
  if (!rect) {
    receivingSurface.value = null
    return
  }
  receivingSurface.value = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  receivingOffset.value = connectionFrameOffset(event.clientX, event.clientY, rect, viewport.value.zoom)
}
const cancelCanvasConnection = () => {
  if (!connectingFrom.value) return
  connectionCancelled = true
  clearConnectionFeedback()
  endConnection()
}
const stopConnectionPointerTracking = trackConnectionPointer(updateConnectionFeedback)
window.addEventListener('pointercancel', cancelCanvasConnection)

onConnectStart((params) => {
  resetHandleMagnet()
  receivingSurface.value = null
  connectionPointer.value = params.event instanceof MouseEvent
    ? { x: params.event.clientX, y: params.event.clientY } : null
  connectionCancelled = false
  receivingNodeId.value = null
  receivingOffset.value = { x: 0, y: 0 }
  if (params.nodeId && params.handleType) {
    connectingFrom.value = {
      nodeId: params.nodeId,
      handleType: params.handleType,
    }
  }
})

onConnectEnd((event) => {
  // 放到节点主体上也视为连接到该节点，不再要求精确命中左侧 target 手柄。
  // 真正的 handle 命中会先触发 onConnect，这里跳过以免重复创建边。
  if (connectingFrom.value && event instanceof MouseEvent) {
    const targetElement = event.target as HTMLElement
    const droppedNodeId = dropCandidateAt(event.clientX, event.clientY)
    if (droppedNodeId) {
      addCanvasEdge(connectingFrom.value.nodeId, droppedNodeId)
      clearConnectionFeedback()
      return
    }

    // 如果没有连接到目标节点，显示创建节点菜单
    // 检查是否点击到了空白画布
    if (targetElement.classList.contains('vue-flow__pane') ||
        targetElement.classList.contains('vue-flow__background')) {
      contextMenu.visible = true
      contextMenu.x = event.clientX
      contextMenu.y = event.clientY
      contextMenu.items = [
        { label: '图片', icon: 'image', action: 'add-ai-image' },
        { label: '视频', icon: 'video', action: 'add-ai-video' },
        { label: '文本', icon: 'text', action: 'add-ai-text' },
        { label: '素材引用', icon: 'assets', action: 'add-asset-ref' },
        { label: '后处理', icon: 'effects', action: 'add-post-process' },
      ]
      contextMenu.data = {
        clientX: event.clientX,
        clientY: event.clientY,
        connectFrom: connectingFrom.value,
      }
    }
  }
  clearConnectionFeedback()
})

const isTextEditingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null
  if (!element) return false
  return element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.isContentEditable ||
    Boolean(element.closest('[contenteditable="true"]')) ||
    Boolean(element.closest('.generator-input'))
}

// Vue Flow 1.33 对字符串 selectionKeyCode 的运行时声明有误，会把
// "Control" 当成非法 prop。直接追踪 Ctrl 状态：按住时关闭平移并启用框选，
// 松开后恢复左键平移，行为仍然是 Ctrl + 鼠标左键拖拽框选。
const ctrlPressed = ref(false)

// 键盘删除、复制、粘贴监听 — 必须在 onMounted 最前面注册，否则 early return 会跳过
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && connectingFrom.value) {
    cancelCanvasConnection()
    return
  }
  if (event.key === 'Control') ctrlPressed.value = true
  if (isTextEditingTarget(event.target)) return
  if (event.key === 'Escape' && contextMenu.visible) {
    contextMenu.visible = false
    return
  }

  const modifier = event.ctrlKey || event.metaKey
  if (modifier && event.key.toLowerCase() === 'd') {
    if (copySelectedNodes()) { event.preventDefault(); pasteCopiedNodes() }
    return
  }
  if (modifier && event.key.toLowerCase() === 'c') {
    if (copySelectedNodes()) event.preventDefault()
    return
  }
  if (modifier && event.key.toLowerCase() === 'v') {
    if (pasteCopiedNodes()) event.preventDefault()
    return
  }

  if (event.key === 'Delete') {
    const sel = getSelectedNodes.value
    if (sel.length > 0) {
      sel.forEach(n => nodeStore.removeNode(n.id))
    } else if (nodeStore.selectedNodeId) {
      nodeStore.removeNode(nodeStore.selectedNodeId)
    }
    event.preventDefault()
  }
}
const handleKeyUp = (event: KeyboardEvent) => {
  if (event.key === 'Control') ctrlPressed.value = false
}
const handleWindowBlur = () => {
  resetHandleMagnet()
  cancelCanvasConnection()
  ctrlPressed.value = false
}
window.addEventListener('keydown', handleKeyDown)
window.addEventListener('keyup', handleKeyUp)
window.addEventListener('blur', handleWindowBlur)
onUnmounted(() => {
  stopHandleMagnetTracking()
  document.documentElement.removeEventListener('pointerleave', resetHandleMagnet)
  clearConnectionFeedback()
  stopConnectionPointerTracking()
  window.removeEventListener('pointercancel', cancelCanvasConnection)
  savedViewport = { x: viewport.value.x, y: viewport.value.y, zoom: viewport.value.zoom }
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('blur', handleWindowBlur)
})

// 初始化示例节点
onMounted(async () => {
  // 检查是否有新建项目请求 / 打开项目请求
  const route = useRoute()
  const router = useRouter()

  if (route.query.newProject === 'true') {
    // 新建项目：必须带 projectId，否则用一个默认 ID 兜底
    const projectId =
      (typeof route.query.projectId === 'string' && route.query.projectId)
      || `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    await nodeStore.createProject(projectId)
    nodes.value = []
    edges.value = []
    setNodes([])
    setEdges([])

    // 设置项目名称
    if (route.query.name) {
      const projectName = decodeURIComponent(route.query.name as string)
      ;(window as any).__projectName = projectName
      window.dispatchEvent(new CustomEvent('project-name-change', { detail: projectName }))
    }

    // 清除URL参数避免刷新重复
    router.replace({ path: '/nodes' })
    return
  }

  if (typeof route.query.project === 'string' && route.query.project) {
    // 打开已有项目：从盘上加载该项目的画布
    await nodeStore.loadProject(route.query.project)
    router.replace({ path: '/nodes' })
    return
  }

  // 默认初始化示例节点（仅当当前项目完全空时）
  if (nodeStore.nodes.length === 0) {
    const node1: Node = {
      id: '1',
      type: 'ai-image',
      position: { x: 100, y: 100 },
      data: {
        label: 'AI绘图示例',
        status: 'idle',
        prompt: '宇宙飞船在星空中飞行',
        size: '1024x1024',
        style: 'realistic',
      },
    }

    const node2: Node = {
      id: '2',
      type: 'ai-video',
      position: { x: 400, y: 100 },
      data: {
        label: 'AI视频示例',
        status: 'idle',
        mode: 'image-to-video',
        prompt: '飞船起飞动画',
        duration: 5,
        fps: 24,
      },
    }

    nodeStore.addNode(node1)
    nodeStore.addNode(node2)

    const edge: Edge = {
      id: 'e1-2',
      source: '1',
      target: '2',
      type: 'animated',
    }
    nodeStore.addEdge(edge)
  }

  // 视角位置已通过 :default-viewport 恢复，无需额外操作
})

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  items: CanvasMenuItem[]
  data?: any
}

const contextMenu = reactive<ContextMenuState>({
  visible: false,
  x: 0,
  y: 0,
  items: [],
  data: null,
})

// 画布右键菜单
const onPaneContextMenu = (event: MouseEvent) => {
  event.preventDefault()

  contextMenu.visible = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.items = [
    { label: '新建节点', action: 'create-menu', children: [
      { label: '图片', icon: 'image', action: 'add-ai-image' },
      { label: '视频', icon: 'video', action: 'add-ai-video' },
      { label: '素材引用', icon: 'assets', action: 'add-asset-ref' },
      { label: '素材库', icon: 'assets', action: 'assets', separatorBefore: true },
      { label: '本地上传', icon: 'upload', action: 'upload-asset' },
    ] },
    { label: '粘贴', action: 'paste', shortcut: 'Ctrl+V', separatorBefore: true, disabled: !nodeClipboard?.nodes.length },
  ]
  contextMenu.data = { clientX: event.clientX, clientY: event.clientY }
}

// 处理原生右键事件（备用）
const handleContextMenu = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (target.closest('.vue-flow__node')) return
  // 只处理画布背景的右键，不处理节点
  if (target.classList.contains('vue-flow__pane') ||
      target.classList.contains('vue-flow__background') ||
      target.closest('.vue-flow__pane') ||
      target.closest('.vue-flow__background')) {
    onPaneContextMenu(event)
  }
}

// 节点右键菜单
const onNodeContextMenu = (event: { event: MouseEvent; node: Node }) => {
  event.event.preventDefault()
  event.event.stopPropagation()
  if (!nodes.value.find(node => node.id === event.node.id)?.selected) {
    removeSelectedNodes(getSelectedNodes.value)
    addSelectedNodes([event.node.id])
  }
  nodeStore.selectNode(event.node.id)

  contextMenu.visible = true
  contextMenu.x = event.event.clientX
  contextMenu.y = event.event.clientY
  contextMenu.items = [
    { label: '复制', action: 'copy', shortcut: 'Ctrl+C', disabled: !isCopyableNode(event.node) },
    { label: '复制副本', action: 'duplicate', shortcut: 'Ctrl+D', disabled: !isCopyableNode(event.node) },
    { label: '粘贴', action: 'paste', shortcut: 'Ctrl+V', disabled: !nodeClipboard?.nodes.length },
    { label: '编辑参数', action: 'edit', separatorBefore: true, disabled: event.node.type === 'asset-ref' },
    { label: '执行生成', action: 'execute', disabled: event.node.type === 'asset-ref' || event.node.data?.status === 'running' },
    { label: '删除', action: 'delete', shortcut: 'Delete', separatorBefore: true },
  ]
  contextMenu.data = event.node
}

// 菜单选择处理
const onContextMenuSelect = (action: string) => {
  if (action === 'upload-asset') {
    handleUploadAsset()
  } else if (action === 'upload-audio') {
    handleUploadAsset('audio')
  } else if (action === 'timeline' || action === 'assets') {
    router.push(action === 'timeline' ? '/editor' : '/assets')
  } else if (action === 'paste') {
    pasteCopiedNodes({ clientX: contextMenu.x, clientY: contextMenu.y })
  } else if (action.startsWith('add-')) {
    addNodeByType(action.replace('add-', ''))
  } else {
    handleNodeAction(action)
  }
  contextMenu.visible = false
}

type CanvasAssetType = 'image' | 'video' | 'audio'

const inferCanvasAssetType = (file: File): CanvasAssetType | null => {
  const mime = file.type.toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'

  const extension = file.name.toLowerCase().split('.').pop() || ''
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'tif', 'tiff'].includes(extension)) return 'image'
  if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(extension)) return 'video'
  if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus'].includes(extension)) return 'audio'
  return null
}

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result as string)
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(file)
})

/** Read dimensions from the original file before it is persisted under local-upload://. */
const readMediaDimensions = (url: string, type: CanvasAssetType) => new Promise<{ width: number; height: number } | undefined>((resolve) => {
  if (type === 'audio') return resolve(undefined)

  let settled = false
  let timer: number | undefined
  let cleanup = () => {}
  const finish = (dimensions?: { width: number; height: number }) => {
    if (settled) return
    settled = true
    if (timer !== undefined) window.clearTimeout(timer)
    cleanup()
    resolve(dimensions)
  }
  timer = window.setTimeout(() => finish(), 8000)

  if (type === 'image') {
    const image = new Image()
    cleanup = () => {
      image.onload = null
      image.onerror = null
      image.removeAttribute('src')
    }
    image.onload = () => finish(image.naturalWidth && image.naturalHeight
      ? { width: image.naturalWidth, height: image.naturalHeight } : undefined)
    image.onerror = () => finish()
    image.src = url
    return
  }

  const video = document.createElement('video')
  cleanup = () => {
    video.onloadedmetadata = null
    video.onerror = null
    video.removeAttribute('src')
    video.load()
  }
  video.preload = 'metadata'
  video.onloadedmetadata = () => finish(video.videoWidth && video.videoHeight
    ? { width: video.videoWidth, height: video.videoHeight } : undefined)
  video.onerror = () => finish()
  video.src = url
  video.load()
})

const addFilesToCanvas = async (files: File[], clientX: number, clientY: number) => {
  const supportedFiles = files.filter((file) => inferCanvasAssetType(file))
  if (supportedFiles.length === 0) return

  const basePosition = screenToFlowCoordinate({
    x: clientX || window.innerWidth / 2,
    y: clientY || window.innerHeight / 2,
  })

  for (const [index, file] of supportedFiles.entries()) {
    const type = inferCanvasAssetType(file)
    if (!type) continue

    try {
      const dataUrl = await readFileAsDataUrl(file)
      const dimensions = await readMediaDimensions(dataUrl, type)
      let assetUrl = dataUrl
      let localPath: string | undefined
      const base64 = dataUrl.includes('base64,') ? dataUrl.split('base64,')[1] : dataUrl

      // 本地文件落盘后用自定义协议引用，重启软件后素材仍然可用。
      if (window.electronAPI?.upload?.save) {
        try {
          const savedPath = await window.electronAPI.upload.save(base64, file.name)
          if (savedPath) {
            localPath = savedPath
            assetUrl = 'local-upload:///' + savedPath.replace(/\\/g, '/')
          }
        } catch { /* 落盘失败时保留 data URL，保证本次拖入仍可用 */ }
      }

      // 用户导入的素材进入独立素材库；生成结果仍由 assetStore 负责。
      materialStore.addMaterial({
        type,
        name: file.name,
        url: assetUrl,
        localPath,
        width: dimensions?.width,
        height: dimensions?.height,
      })

      const column = index % 4
      const row = Math.floor(index / 4)
      nodeStore.addNode({
        id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'asset-ref',
        position: {
          x: basePosition.x + column * 45,
          y: basePosition.y + row * 45,
        },
        data: {
          label: file.name,
          assetType: type,
          assetUrl,
          assetName: file.name,
          assetWidth: dimensions?.width,
          assetHeight: dimensions?.height,
        },
      })
    } catch (error) {
      console.warn('[canvas-drop] failed to import file:', file.name, error)
    }
  }
}

const onCanvasDragOver = (event: DragEvent) => {
  if (event.dataTransfer?.types.includes('Files')) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

const onCanvasDrop = (event: DragEvent) => {
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  contextMenu.visible = false
  void addFilesToCanvas(Array.from(files), event.clientX, event.clientY)
}

// 处理上传素材（通过右键菜单）
const handleUploadAsset = (type?: 'audio', position = contextMenu.data) => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = type === 'audio' ? 'audio/*' : 'image/*,video/*,audio/*'
  input.multiple = true

  input.onchange = async (e: Event) => {
    const files = (e.target as HTMLInputElement).files
    if (!files || files.length === 0) return
    await addFilesToCanvas(
      Array.from(files),
      position?.clientX ?? window.innerWidth / 2,
      position?.clientY ?? window.innerHeight / 2,
    )
  }

  input.click()
}

// 添加节点
const addNodeByType = (type: string, placement = contextMenu.data) => {
  const { clientX, clientY, connectFrom } = placement
  const position = screenToFlowCoordinate({ x: clientX, y: clientY })

  const nodeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const newNode: Node = {
    id: nodeId,
    type: type,
    position,
    data: {
      label: getNodeLabel(type),
      status: 'idle',
      prompt: '',
      size: '1024x1024',
      style: 'realistic',
      mode: 'text-to-video',
      duration: 5,
      fps: 24,
    },
  }

  // 添加节点到store
  nodeStore.addNode(newNode)

  // 如果是从连接点拖拽创建的，自动创建连线
  if (connectFrom) {
    const edge: Edge = {
      id: `e${connectFrom.nodeId}-${nodeId}`,
      source: connectFrom.handleType === 'source' ? connectFrom.nodeId : nodeId,
      target: connectFrom.handleType === 'source' ? nodeId : connectFrom.nodeId,
      type: 'animated',
    }
    addCanvasEdge(edge.source, edge.target)
  }
  return nodeId
}

// 工具栏的新节点放在当前可视区域，独立于上一次右键菜单的坐标。
const toolbarPlacement = () => {
  const rect = canvasRef.value!.getBoundingClientRect()
  const clientX = rect.left + rect.width / 2 - 175 * viewport.value.zoom
  const clientY = rect.top + rect.height / 2 - 100 * viewport.value.zoom
  const candidate = screenToFlowCoordinate({ x: clientX, y: clientY })
  let offset = 0
  while (nodes.value.some(node => Math.abs(node.position.x - candidate.x - offset) < 30 && Math.abs(node.position.y - candidate.y - offset) < 30) && offset < 225) offset += 45
  return { clientX: clientX + offset * viewport.value.zoom, clientY: clientY + offset * viewport.value.zoom }
}
const addFromToolbar = async (type: string) => {
  const id = addNodeByType(type, toolbarPlacement())
  await nextTick()
  removeSelectedNodes(getSelectedNodes.value)
  addSelectedNodes([id])
  nodeStore.selectNode(id)
}
const uploadFromToolbar = (type?: 'audio') => handleUploadAsset(type, toolbarPlacement())
const fitCanvas = () => {
  if (nodes.value.length) void fitView({ padding: { left: '90px', right: '40px', top: '80px', bottom: '80px' }, maxZoom: 1, duration: 220 })
}
const focusCanvasNode = (id: string) => {
  const node = nodes.value.find(node => node.id === id)
  if (!node) return
  removeSelectedNodes(getSelectedNodes.value)
  addSelectedNodes([id])
  nodeStore.selectNode(id)
  void setCenter(node.position.x + (node.dimensions?.width || 350) / 2, node.position.y + (node.dimensions?.height || 220) / 2, { zoom: Math.max(viewport.value.zoom, 0.75), duration: 220 })
}

// 节点点击
const onNodeClick = (event: { event: MouseEvent; node: Node }) => {
  nodeStore.selectNode(event.node.id)
}

// 节点操作
const handleNodeAction = (action: string) => {
  const node = contextMenu.data as Node

  switch (action) {
    case 'execute':
      nodeStore.executeNode(node.id)
      break
    case 'edit':
      nodeStore.selectNode(node.id)
      // 展开节点底部的生成卡片
      break
    case 'copy':
      copySelectedNodes(node)
      break
    case 'duplicate':
      if (copySelectedNodes(node)) pasteCopiedNodes()
      break
    case 'delete':
      nodeStore.removeNode(node.id)
      break
  }
}

const getNodeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    'ai-image': 'AI绘图',
    'ai-video': 'AI视频',
    'ai-text': 'AI文本',
    'asset-ref': '资产引用',
    'post-process': '后处理',
  }
  return labels[type] || type
}
</script>

<style scoped>
.node-editor {
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 52% 42%, rgba(44, 53, 68, 0.16), transparent 42%), linear-gradient(180deg, #111214 0%, #0d0e10 100%);
  position: relative;
}

.vue-flow-container {
  width: 100%;
  height: 100%;
}

/* Keep the pointer-following line under opaque node surfaces, including their
   temporary 3D transform. Its interior segment must never paint on the card. */
:deep(.vue-flow__connectionline) {
  z-index: 1;
  pointer-events: none;
}

:deep(.vue-flow__nodes) {
  z-index: 2;
}

/* 对齐辅助线 overlay：跟随 vue-flow viewport 一起 transform */
.alignment-overlay {
  /* 内联 style 已设 position/transform/zIndex，这里只兜底 */
}

/* 对齐辅助线 */
.alignment-line {
  position: absolute;
  pointer-events: none;
}

.alignment-line.horizontal {
  width: 200000px;
  height: 0;
  left: -100000px;
  border-top: 1px dashed rgba(214, 220, 228, 0.46);
}

.alignment-line.vertical {
  width: 0;
  height: 200000px;
  top: -100000px;
  border-left: 1px dashed rgba(214, 220, 228, 0.46);
}

:deep(.vue-flow__background) {
  background-color: #0d0e10;
  opacity: 0.88;
}

:deep(.vue-flow__minimap) {
  left: 12px;
  bottom: 60px;
  margin: 0;
  background-color: rgba(25, 27, 31, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
}

.edges-hidden :deep(.vue-flow__edges), .edges-hidden :deep(.vue-flow__edge-labels) {
  visibility: hidden;
  pointer-events: none;
}

:deep(.vue-flow__controls) {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(25, 27, 31, 0.94);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
}

:deep(.vue-flow__controls button) {
  background: transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.64);
  transition: background 0.15s ease, color 0.15s ease;
}

:deep(.vue-flow__controls button:hover) {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

:deep(.vue-flow__controls button svg) {
  fill: currentColor;
}

/* 框选矩形 */
:deep(.vue-flow__selection),
:deep(.vue-flow__nodesselection-rect) {
  background: rgba(214, 220, 228, 0.08);
  border: 1px solid rgba(214, 220, 228, 0.42);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  border-radius: 2px;
}

/* 空画布引导 */
.canvas-hint {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  pointer-events: none;
  z-index: 5;
}
.canvas-hint-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.6; }
.canvas-hint-text { font-size: 16px; color: rgba(255,255,255,0.5); margin-bottom: 10px; }
.canvas-hint-keys { font-size: 12px; color: rgba(255,255,255,0.3); }
.canvas-hint kbd {
  display: inline-block;
  padding: 1px 6px;
  font-size: 11px;
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 3px;
  color: rgba(255,255,255,0.72);
  background: rgba(255,255,255,0.06);
  font-family: inherit;
}
</style>
