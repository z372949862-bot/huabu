<template>
  <div class="node-editor" @contextmenu="handleContextMenu">
    <VueFlow
      v-model:nodes="nodes"
      v-model:edges="edges"
      :default-viewport="savedViewport || { zoom: 1, x: 0, y: 0 }"
      :min-zoom="0.1"
      :max-zoom="4"
      :snap-to-grid="true"
      :snap-grid="[15, 15]"
      :is-valid-connection="isValidConnection"
      :default-edge-options="{ type: 'animated' }"
      :selection-key="'Shift'"
      :multi-selection-key="'Shift'"
      @pane-context-menu="onPaneContextMenu"
      @node-context-menu="onNodeContextMenu"
      @node-click="onNodeClick"
      @node-drag="onNodeDrag"
      @node-drag-stop="onNodeDragStop"
      class="vue-flow-container"
    >
      <Background pattern-color="#00D9FF" :gap="20" :size="1" />
      <Controls />
      <MiniMap :pannable="true" :zoomable="true" />
    </VueFlow>

    <!-- 空画布引导 -->
    <div v-if="nodes.length === 0" class="canvas-hint">
      <div class="canvas-hint-icon">🎨</div>
      <div class="canvas-hint-text">右键画布添加节点开始创作</div>
      <div class="canvas-hint-keys">
        <kbd>Delete</kbd> 删除节点 &nbsp;·&nbsp;
        <kbd>滚轮</kbd> 缩放 &nbsp;·&nbsp;
        <kbd>拖拽</kbd> 平移
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
import { ref, reactive, markRaw, onMounted, watch, onUnmounted, computed, nextTick } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { Node, Edge } from '@vue-flow/core'
import { useRoute, useRouter } from 'vue-router'
import ContextMenu from '@/components/ContextMenu.vue'
import CustomNode from '@/components/CustomNode.vue'
import AnimatedEdge from '@/components/AnimatedEdge.vue'
import { useNodeStore } from '@/stores/node'

const nodeStore = useNodeStore()

// 对齐辅助线
const alignmentLines = ref<Array<{ id: string; type: 'horizontal' | 'vertical'; position: number }>>([])
const ALIGNMENT_THRESHOLD = 10 // 对齐阈值（像素）
const MAX_ALIGNMENT_DISTANCE = 15 // 最大对齐距离（像素），超过不显示

// 连接验证：只允许从source连接到target
const isValidConnection = (connection: any) => {
  // 不允许连接到自己
  if (connection.source === connection.target) {
    return false
  }

  // sourceHandle应该是null或undefined（默认source handle）
  // targetHandle应该是null或undefined（默认target handle）
  // 这样可以确保从右侧source连接到左侧target
  return true
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

const { project, onConnect, setNodes, setEdges, viewport, getSelectedNodes } = useVueFlow({
  nodeTypes: {
    'ai-image': markRaw(CustomNode),
    'ai-video': markRaw(CustomNode),
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
}, { deep: true, immediate: true })

watch(() => nodeStore.edges, (newEdges) => {
  edges.value = newEdges
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

// 监听连线创建（拖拽手柄）
onConnect((connection) => {
  const edge: Edge = {
    id: `e${connection.source}-${connection.target}`,
    source: connection.source,
    target: connection.target,
    type: 'animated',
  }
  nodeStore.addEdge(edge)
})

// 监听连线开始拖拽（显示节点选择菜单）
const { onConnectStart, onConnectEnd } = useVueFlow()
const connectingFrom = ref<{ nodeId: string; handleType: string } | null>(null)

onConnectStart((params) => {
  if (params.nodeId && params.handleType) {
    connectingFrom.value = {
      nodeId: params.nodeId,
      handleType: params.handleType,
    }
  }
})

onConnectEnd((event) => {
  // 如果没有连接到目标节点，显示创建节点菜单
  if (connectingFrom.value && event instanceof MouseEvent) {
    const targetElement = event.target as HTMLElement
    // 检查是否点击到了空白画布
    if (targetElement.classList.contains('vue-flow__pane') ||
        targetElement.classList.contains('vue-flow__background')) {
      contextMenu.visible = true
      contextMenu.x = event.clientX
      contextMenu.y = event.clientY
      contextMenu.items = [
        { label: '添加AI绘图节点', icon: '🎨', action: 'add-ai-image' },
        { label: '添加AI视频节点', icon: '🎬', action: 'add-ai-video' },
        { label: '添加资产引用节点', icon: '📦', action: 'add-asset-ref' },
        { label: '添加后处理节点', icon: '⚡', action: 'add-post-process' },
      ]
      contextMenu.data = {
        clientX: event.clientX,
        clientY: event.clientY,
        connectFrom: connectingFrom.value,
      }
    }
  }
  connectingFrom.value = null
})

// 键盘删除监听 — 必须在 onMounted 最前面注册，否则 early return 会跳过
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Delete') {
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]') ||
        target.closest('.generator-input')) {
      return
    }
    const sel = getSelectedNodes.value
    if (sel.length > 0) {
      sel.forEach(n => nodeStore.removeNode(n.id))
    } else if (nodeStore.selectedNodeId) {
      nodeStore.removeNode(nodeStore.selectedNodeId)
    }
    event.preventDefault()
  }
}
window.addEventListener('keydown', handleKeyDown)
onUnmounted(() => {
  savedViewport = { x: viewport.value.x, y: viewport.value.y, zoom: viewport.value.zoom }
  window.removeEventListener('keydown', handleKeyDown)
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
  items: Array<{ label: string; icon: string; action: string }>
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
    { label: '添加AI绘图节点', icon: '🎨', action: 'add-ai-image' },
    { label: '添加AI视频节点', icon: '🎬', action: 'add-ai-video' },
    { label: '添加资产引用节点', icon: '📦', action: 'add-asset-ref' },
    { label: '添加后处理节点', icon: '⚡', action: 'add-post-process' },
    { label: '上传素材', icon: '📤', action: 'upload-asset' },
  ]
  contextMenu.data = { clientX: event.clientX, clientY: event.clientY }
}

// 处理原生右键事件（备用）
const handleContextMenu = (event: MouseEvent) => {
  const target = event.target as HTMLElement
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

  contextMenu.visible = true
  contextMenu.x = event.event.clientX
  contextMenu.y = event.event.clientY
  contextMenu.items = [
    { label: '执行生成', icon: '▶️', action: 'execute' },
    { label: '编辑参数', icon: '📝', action: 'edit' },
    { label: '复制', icon: '📋', action: 'copy' },
    { label: '删除', icon: '🗑️', action: 'delete' },
  ]
  contextMenu.data = event.node
}

// 菜单选择处理
const onContextMenuSelect = (action: string) => {
  if (action === 'upload-asset') {
    handleUploadAsset()
  } else if (action.startsWith('add-')) {
    addNodeByType(action.replace('add-', ''))
  } else {
    handleNodeAction(action)
  }
  contextMenu.visible = false
}

// 处理上传素材（通过右键菜单）
const handleUploadAsset = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*,video/*,audio/*'
  input.multiple = true

  input.onchange = async (e: Event) => {
    const files = (e.target as HTMLInputElement).files
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      // 判断文件类型
      let type: 'image' | 'video' | 'audio' = 'image'
      if (file.type.startsWith('video/')) type = 'video'
      else if (file.type.startsWith('audio/')) type = 'audio'

      // 先读成 data URL 确保即时显示，同时落盘持久化
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })

      let assetUrl: string = dataUrl
      // 落盘：data URL → 磁盘文件 → local-upload:/// URL，重启不丢
      const base64 = dataUrl.includes('base64,') ? dataUrl.split('base64,')[1] : dataUrl
      if (window.electronAPI?.upload?.save) {
        try {
          const savedPath = await window.electronAPI.upload.save(base64, file.name)
          if (savedPath) {
            // C:\...\file.png → local-upload:///C:/.../file.png
            assetUrl = 'local-upload:///' + savedPath.replace(/\\/g, '/')
          }
        } catch { /* 落盘失败回退 data URL */ }
      }

      const position = project({
        x: contextMenu.data?.clientX || window.innerWidth / 2,
        y: contextMenu.data?.clientY || window.innerHeight / 2,
      })

      const node: Node = {
        id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'asset-ref',
        position,
        data: {
          label: file.name,
          assetType: type,
          assetUrl,
          assetName: file.name,
        },
      }

      nodeStore.addNode(node)
    }
  }

  input.click()
}

// 添加节点
const addNodeByType = (type: string) => {
  const { clientX, clientY, connectFrom } = contextMenu.data
  const position = project({ x: clientX, y: clientY })

  const nodeId = `node_${Date.now()}`
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
    nodeStore.addEdge(edge)
  }
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
      // TODO: 实现复制功能
      console.log('复制节点:', node)
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
  background: #020308;
  position: relative;
}

.vue-flow-container {
  width: 100%;
  height: 100%;
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
  border-top: 1px dashed rgba(0, 217, 255, 0.8);
}

.alignment-line.vertical {
  width: 0;
  height: 200000px;
  top: -100000px;
  border-left: 1px dashed rgba(0, 217, 255, 0.8);
}

:deep(.vue-flow__background) {
  background-color: #020308;
}

:deep(.vue-flow__minimap) {
  background-color: rgba(2, 3, 8, 0.9);
  border: 1px solid #00D9FF;
}

:deep(.vue-flow__controls) {
  border: 1px solid #00D9FF;
  background: rgba(2, 3, 8, 0.9);
}

:deep(.vue-flow__controls button) {
  background: rgba(0, 217, 255, 0.1);
  border-bottom: 1px solid #00D9FF;
  color: #00D9FF;
}

:deep(.vue-flow__controls button:hover) {
  background: rgba(0, 217, 255, 0.2);
}

/* 框选矩形 */
:deep(.vue-flow__selection) {
  background: rgba(0, 217, 255, 0.08);
  border: 1px solid rgba(0, 217, 255, 0.5);
}

/* 被选中的节点高亮 */
:deep(.vue-flow__node.selected) > .custom-node .node-main {
  border-color: #00D9FF !important;
  box-shadow: 0 0 12px rgba(0, 217, 255, 0.4), inset 0 0 0 2px #00D9FF !important;
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
  border: 1px solid rgba(0,217,255,0.3);
  border-radius: 3px;
  color: #00D9FF;
  background: rgba(0,217,255,0.08);
  font-family: inherit;
}
</style>
