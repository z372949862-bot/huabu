/**
 * 视频剪辑器状态仓库。
 *
 * VideoEditor 是路由组件，切到别的节点/页面就会卸载，组件内的 ref 会被清空。
 * 把时间轴状态放到这里（Pinia store 在路由切换间一直存活），切回来原样还在。
 *
 * 持久化到 electron-store：只存「时间轴 + UI 状态」这些轻量数据，
 * **不存缩略图 base64**（体积大，会把存储撑爆）——重启后重进剪辑器时按需重抽。
 */

import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'

export interface Clip {
  id: string
  url: string
  label: string
  duration: number
  trimStart: number
  trimEnd: number
  /** 单片段音量 0~1（默认 1），导出/剪映草稿都会带上 */
  volume?: number
}

const STORE_KEY = 'videoEditorState'

export const useEditorStore = defineStore('editor', () => {
  const timeline = ref<Clip[]>([])
  const selectedIndex = ref(-1)
  const pxPerSec = ref(40)          // 时间轴缩放：每秒占多少像素
  const previewHeight = ref(260)    // 预览区高度
  // 缩略图缓存（base64 帧）：体积大，只放内存、不持久化；重启后按需重抽。
  const clipFrames = reactive<Record<string, string[]>>({})
  const initialized = ref(false)

  // ---------- 持久化 ----------

  let persistDebounce: number | null = null
  function persist() {
    if (persistDebounce) clearTimeout(persistDebounce)
    persistDebounce = window.setTimeout(async () => {
      const electronStore = window.electronAPI?.store
      if (!electronStore) return
      try {
        await electronStore.set(
          STORE_KEY,
          JSON.stringify({
            timeline: timeline.value,
            selectedIndex: selectedIndex.value,
            pxPerSec: pxPerSec.value,
            previewHeight: previewHeight.value,
          })
        )
      } catch (err) {
        console.warn('persist editor failed:', err)
      }
    }, 300)
  }

  async function init() {
    if (initialized.value) return
    initialized.value = true
    const electronStore = window.electronAPI?.store
    if (!electronStore) return
    try {
      const raw = await electronStore.get(STORE_KEY)
      if (raw) {
        const p = JSON.parse(raw)
        if (Array.isArray(p?.timeline)) {
          timeline.value = p.timeline.filter(
            (c: any) => c && typeof c.id === 'string' && typeof c.url === 'string'
          )
        }
        if (typeof p?.selectedIndex === 'number') selectedIndex.value = p.selectedIndex
        if (typeof p?.pxPerSec === 'number') pxPerSec.value = p.pxPerSec
        if (typeof p?.previewHeight === 'number') previewHeight.value = p.previewHeight
        // 防御：选中索引越界（数据被改过）则收敛到合法范围
        if (selectedIndex.value >= timeline.value.length) {
          selectedIndex.value = timeline.value.length > 0 ? timeline.value.length - 1 : -1
        }
      }
    } catch (err) {
      console.warn('load editor failed:', err)
    }
    // 恢复完再开始监听，避免加载过程触发冗余写盘
    watch([timeline, selectedIndex, pxPerSec, previewHeight], persist, { deep: true })
  }

  // ---------- 撤销 / 重做 ----------
  // 记录 timeline + selectedIndex 的快照栈。破坏性操作（剪开/删除/排序/清空）前调 snapshot()。

  interface Snapshot { timeline: Clip[]; selectedIndex: number }
  const undoStack = ref<Snapshot[]>([])
  const redoStack = ref<Snapshot[]>([])
  const MAX_HISTORY = 50

  function cloneState(): Snapshot {
    return {
      timeline: JSON.parse(JSON.stringify(timeline.value)),
      selectedIndex: selectedIndex.value,
    }
  }

  /** 在执行破坏性操作前调用，把当前状态压入撤销栈 */
  function snapshot() {
    undoStack.value.push(cloneState())
    if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
    redoStack.value = [] // 新操作后清空重做栈
  }

  function undo() {
    if (!undoStack.value.length) return
    redoStack.value.push(cloneState())
    const s = undoStack.value.pop()!
    timeline.value = s.timeline
    selectedIndex.value = s.selectedIndex
  }

  function redo() {
    if (!redoStack.value.length) return
    undoStack.value.push(cloneState())
    const s = redoStack.value.pop()!
    timeline.value = s.timeline
    selectedIndex.value = s.selectedIndex
  }

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  return {
    timeline, selectedIndex, pxPerSec, previewHeight, clipFrames,
    init, persist,
    snapshot, undo, redo, canUndo, canRedo,
  }
})
