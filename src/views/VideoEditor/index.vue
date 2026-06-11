<template>
  <div class="editor-view">
    <div class="editor-main">
      <!-- 左侧：素材面板 -->
      <div class="editor-sidebar">
        <h4>视频素材</h4>
        <div v-if="videoAssets.length === 0" class="sidebar-empty">暂无视频，先生成视频再剪辑</div>
        <div v-else class="sidebar-list">
          <div v-for="v in videoAssets" :key="v.id" class="sidebar-item" @click="addToTimeline(v)">
            <video :src="v.url" class="sidebar-thumb" muted preload="metadata" />
            <div class="sidebar-info">
              <div class="sidebar-name">{{ v.prompt?.slice(0, 30) || '未命名' }}</div>
              <div class="sidebar-meta">{{ v.model }}</div>
            </div>
            <span class="sidebar-add">+</span>
          </div>
        </div>
      </div>

      <!-- 右侧主区域 -->
      <div class="editor-right">
        <!-- 预览 -->
        <div class="editor-preview">
          <video v-if="previewUrl" :src="previewUrl" controls class="preview-player" />
          <div v-else class="preview-empty">点击时间线中的视频预览</div>
        </div>

        <!-- 时间线 -->
        <div class="editor-timeline">
          <div class="timeline-header">
            <span>时间线 ({{ timeline.length }} 个片段)</span>
            <button v-if="timeline.length > 0" class="btn-clear" @click="timeline = []">清空</button>
          </div>
          <div v-if="timeline.length === 0" class="timeline-empty">从左侧素材库点击 + 添加视频</div>
          <div v-else class="timeline-track" ref="trackRef">
            <div
              v-for="(clip, i) in timeline"
              :key="clip.id"
              class="timeline-clip"
              :class="{ active: selectedIndex === i }"
              draggable="true"
              @click="selectClip(i)"
              @dragstart="onDragStart(i)"
              @dragover.prevent
              @drop="onDrop(i)"
            >
              <span class="clip-index">{{ i + 1 }}</span>
              <video :src="clip.url" class="clip-thumb" muted preload="metadata" />
              <div class="clip-name">{{ clip.label }}</div>
              <button class="clip-remove" @click.stop="removeClip(i)">×</button>
            </div>
          </div>
        </div>

        <!-- 底部工具 -->
        <div class="editor-footer">
          <span class="footer-info">{{ timeline.length }} 个片段</span>
          <button class="btn-export" :disabled="timeline.length === 0 || exporting" @click="exportVideo">
            {{ exporting ? '导出中...' : '⬇ 导出视频' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAssetStore } from '@/stores/asset'

interface Clip {
  id: string
  url: string
  label: string
}

const assetStore = useAssetStore()
const timeline = ref<Clip[]>([])
const selectedIndex = ref(-1)
const exporting = ref(false)
const trackRef = ref<HTMLDivElement>()

const videoAssets = computed(() =>
  assetStore.sortedAssets.filter(a => a.type === 'video' && a.url)
)

const previewUrl = computed(() => {
  if (selectedIndex.value >= 0 && selectedIndex.value < timeline.value.length) {
    return timeline.value[selectedIndex.value].url
  }
  if (timeline.value.length > 0) return timeline.value[0].url
  return ''
})

function addToTimeline(v: any) {
  timeline.value.push({
    id: v.id + '_' + Date.now(),
    url: v.url,
    label: (v.prompt || '视频').slice(0, 20),
  })
  if (selectedIndex.value < 0) selectedIndex.value = 0
}

function selectClip(i: number) { selectedIndex.value = i }
function removeClip(i: number) {
  timeline.value.splice(i, 1)
  if (selectedIndex.value >= timeline.value.length) selectedIndex.value = timeline.value.length - 1
}

let dragIdx = -1
function onDragStart(i: number) { dragIdx = i }
function onDrop(targetIdx: number) {
  if (dragIdx < 0 || dragIdx === targetIdx) return
  const item = timeline.value.splice(dragIdx, 1)[0]
  timeline.value.splice(targetIdx, 0, item)
  selectedIndex.value = targetIdx
  dragIdx = -1
}

async function exportVideo() {
  if (timeline.value.length === 0) return
  exporting.value = true
  try {
    const urls = timeline.value.map(c => c.url)
    const tmpDir = await window.electronAPI?.store?.get('_tmpDir') || ''
    const result = await window.electronAPI?.video?.export(urls, tmpDir || '.')
    if (result) {
      window.alert('导出成功！\n' + result)
    }
  } catch (err: any) {
    window.alert('导出失败：' + (err?.message || err))
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped>
.editor-view { width:100%; height:100%; background:#020308; display:flex; flex-direction:column; }
.editor-main { display:flex; flex:1; overflow:hidden; }

.editor-sidebar {
  width:220px; flex-shrink:0; border-right:1px solid rgba(0,217,255,0.1);
  padding:12px; overflow-y:auto; display:flex; flex-direction:column;
}
.editor-sidebar h4 { color:#00D9FF; font-size:13px; font-weight:500; margin:0 0 10px; }
.sidebar-empty { color:rgba(255,255,255,0.3); font-size:12px; text-align:center; padding:40px 10px; }
.sidebar-item {
  display:flex; align-items:center; gap:8px; padding:8px;
  border-radius:6px; cursor:pointer; margin-bottom:4px;
  transition: background 0.15s;
}
.sidebar-item:hover { background:rgba(0,217,255,0.06); }
.sidebar-thumb { width:48px; height:36px; object-fit:cover; border-radius:4px; flex-shrink:0; }
.sidebar-info { flex:1; min-width:0; }
.sidebar-name { font-size:12px; color:#e0e0e0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sidebar-meta { font-size:10px; color:rgba(255,255,255,0.3); margin-top:2px; }
.sidebar-add { font-size:18px; color:rgba(0,217,255,0.5); flex-shrink:0; }

.editor-right { flex:1; display:flex; flex-direction:column; min-width:0; }
.editor-preview {
  height:340px; flex-shrink:0; background:#000; display:flex; align-items:center; justify-content:center;
  border-bottom:1px solid rgba(0,217,255,0.1);
}
.preview-player { max-width:100%; max-height:100%; }
.preview-empty { color:rgba(255,255,255,0.2); font-size:14px; }

.editor-timeline { flex:1; display:flex; flex-direction:column; padding:12px; overflow:hidden; }
.timeline-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.timeline-header span { font-size:12px; color:rgba(255,255,255,0.4); }
.btn-clear { background:none; border:none; color:rgba(255,68,68,0.6); cursor:pointer; font-size:11px; }
.timeline-empty { color:rgba(255,255,255,0.2); font-size:13px; text-align:center; padding:60px 0; }
.timeline-track { display:flex; gap:8px; overflow-x:auto; padding:8px 4px; flex:1; align-items:flex-start; }
.timeline-clip {
  position:relative; width:140px; flex-shrink:0; border-radius:8px; overflow:hidden;
  border:2px solid transparent; cursor:pointer; transition:border-color 0.2s;
  background:rgba(255,255,255,0.03);
}
.timeline-clip.active { border-color:#00D9FF; }
.clip-index { position:absolute; top:4px; left:6px; font-size:11px; color:#00D9FF; background:rgba(0,0,0,0.7); padding:1px 6px; border-radius:4px; z-index:1; }
.clip-thumb { width:100%; height:90px; object-fit:cover; display:block; }
.clip-name { font-size:11px; color:rgba(255,255,255,0.6); padding:6px 8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.clip-remove { position:absolute; top:4px; right:4px; width:18px; height:18px; border-radius:50%; border:none; background:rgba(0,0,0,0.7); color:#fff; font-size:14px; cursor:pointer; display:none; align-items:center; justify-content:center; line-height:1; padding:0; z-index:1; }
.timeline-clip:hover .clip-remove { display:flex; }

.editor-footer { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-top:1px solid rgba(0,217,255,0.1); flex-shrink:0; }
.footer-info { font-size:12px; color:rgba(255,255,255,0.3); }
.btn-export {
  padding:10px 28px; background:rgba(0,217,255,0.15); border:1px solid #00D9FF;
  border-radius:8px; color:#00D9FF; font-size:14px; cursor:pointer; transition:all 0.2s;
}
.btn-export:hover:not(:disabled) { background:rgba(0,217,255,0.3); box-shadow:0 0 16px rgba(0,217,255,0.3); }
.btn-export:disabled { opacity:0.4; cursor:not-allowed; }
</style>
