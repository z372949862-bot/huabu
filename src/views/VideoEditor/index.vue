<template>
  <div class="editor-view">
    <div class="editor-main">
      <div class="editor-sidebar">
        <h4>视频素材</h4>
        <div v-if="videoAssets.length === 0" class="sidebar-empty">暂无视频</div>
        <div v-else class="sidebar-list">
          <div v-for="g in assetGroups" :key="g.id" class="asset-group">
            <div class="group-header" :class="{current:g.isCurrent}" @click="toggleGroup(g.id)">
              <span class="group-caret">{{ isCollapsed(g.id)?'▸':'▾' }}</span>
              <span class="group-name">{{ g.name }}</span>
              <span class="group-count">{{ g.assets.length }}</span>
            </div>
            <template v-if="!isCollapsed(g.id)">
              <div v-for="v in g.assets" :key="v.id" class="sidebar-item" draggable="true" @click="addToTimeline(v)" @dragstart="onAssetDragStart(v)" @dragend="onAssetDragEnd" title="点击或拖到时间轴添加">
                <video :src="v.url" class="sidebar-thumb" muted preload="metadata" />
                <div class="sidebar-info"><div class="sidebar-name">{{ v.prompt?.slice(0,25)||'未命名' }}</div><div class="sidebar-meta">{{ v.model }}</div></div>
                <span class="sidebar-add">+</span>
              </div>
            </template>
          </div>
        </div>
      </div>
      <div class="editor-right" ref="editorRightRef">
        <div class="editor-preview" ref="previewBoxRef" :style="{height:previewHeight+'px'}">
          <!-- 双 video 缓冲：一个在播、一个后台预加载下一段，切段时瞬间互换实现无缝衔接 -->
          <video ref="videoA" class="preview-player" :class="{hidden:activeId!=='A'}" preload="auto"
            @timeupdate="onTimeUpdate" @play="onPlayerPlay" @pause="onPlayerPause" @ended="onPlayerEnded" @durationchange="onDurationChange" />
          <video ref="videoB" class="preview-player" :class="{hidden:activeId!=='B'}" preload="auto"
            @timeupdate="onTimeUpdate" @play="onPlayerPlay" @pause="onPlayerPause" @ended="onPlayerEnded" @durationchange="onDurationChange" />
          <!-- 拖动绿线时盖在视频上的缩略图（瞬时跟随，松手后切回实帧） -->
          <img v-if="scrubFrame" :src="scrubFrame" class="scrub-frame" />
          <div v-if="!previewUrl" class="preview-empty">点击时间线视频预览</div>
        </div>
        <div class="preview-resizer" :class="{active:previewResizing}" @mousedown="onPreviewResizeStart" title="拖动调整预览高度"><div class="resizer-grip"/></div>
        <!-- 自定义播放控件（替代视频原生控件） -->
        <div class="editor-controls">
          <button class="ctrl-btn" @click="togglePlay" :title="isPlaying?'暂停 (空格)':'播放 (空格)'">{{ isPlaying?'⏸':'▶' }}</button>
          <span class="ctrl-time">{{ fmtTime(playheadTime) }} / {{ fmtTime(totalDurationExact) }}</span>
          <div class="ctrl-spacer"/>
          <div class="ctrl-volume">
            <button class="ctrl-btn" @click="toggleMute" :title="muted||volume===0?'取消静音':'静音'">{{ (muted||volume===0)?'🔇':(volume<0.5?'🔉':'🔊') }}</button>
            <input type="range" class="ctrl-vol-range" min="0" max="1" step="0.01" :value="muted?0:volume" @input="setVolume(($event.target as HTMLInputElement).value)"/>
          </div>
          <button class="ctrl-btn" @click="toggleFullscreen" title="全屏">⛶</button>
        </div>
        <!-- 选中片段检查器：单片段音量 + 入/出点 -->
        <div v-if="selectedClip" class="clip-inspector">
          <span class="ci-name" :title="selectedClip.label">选中 {{selectedIndex+1}}. {{selectedClip.label}}</span>
          <div class="ci-vol">
            <button class="ctrl-btn ci-volbtn" @click="toggleClipMute" :title="selectedClipVolume>0?'片段静音':'取消静音'">{{ selectedClipVolume===0?'🔇':(selectedClipVolume<0.5?'🔉':'🔊') }}</button>
            <input type="range" class="ctrl-vol-range" min="0" max="1" step="0.01" :value="selectedClipVolume" @input="setClipVolume(selectedIndex,($event.target as HTMLInputElement).value)" title="该片段音量"/>
            <span class="ci-pct">{{Math.round(selectedClipVolume*100)}}%</span>
          </div>
          <span class="ci-trim">入 {{fmtTime(selectedClip.trimStart||0)}} · 出 {{fmtTime(selectedClipOut)}}</span>
        </div>
        <div class="editor-timeline">
          <div class="timeline-header">
            <span>时间轴 {{ timeline.length }}片段 · {{ totalDuration }}s</span>
            <div class="timeline-actions">
              <div class="zoom-ctrl" title="Ctrl+滚轮 也可缩放">
                <button class="zoom-btn" @click="setZoom(pxPerSec-10)">－</button>
                <input type="range" class="zoom-range" :min="MIN_PPS" :max="MAX_PPS" step="1" v-model.number="pxPerSec"/>
                <button class="zoom-btn" @click="setZoom(pxPerSec+10)">＋</button>
              </div>
              <button class="zoom-btn" @click="fitZoom" title="适应窗口">⊡</button>
              <button class="zoom-btn" @click="doUndo" :disabled="!canUndo" title="撤销 (Ctrl+Z)">↶</button>
              <button class="zoom-btn" @click="doRedo" :disabled="!canRedo" title="重做 (Ctrl+Y)">↷</button>
              <button v-if="timeline.length>0" class="btn-sm" @click="splitAtPlayhead" title="在播放头处剪开（快捷键 S）">✂ 剪开</button>
              <button v-if="timeline.length>0" class="btn-sm btn-danger-text" @click="clearTimeline">清空</button>
            </div>
          </div>
          <div class="timeline-ruler">
            <div v-for="(tk,ti) in rulerTicks" :key="ti" class="ruler-tick" :class="{major:tk.major}" :style="{left:tk.t*pxPerSec+'px'}">
              <span v-if="tk.major" class="ruler-label">{{tk.label}}</span>
            </div>
          </div>
          <div class="timeline-track" ref="trackRef" :class="{'drag-over':assetDragging}" @wheel="onTrackWheel" @mousedown="onTrackMouseDown" @mousemove="onTrackMouseMove" @mouseup="onTrackMouseUp" @mouseleave="onTrackMouseUp" @dragover.prevent @drop="onTrackDrop">
            <div class="timeline-playhead" :style="{left:playheadX+'px'}"><div class="playhead-handle" @mousedown.stop="onPlayheadGrab" title="拖动移动播放头"/><div class="playhead-line"/></div>
            <div v-for="(clip,i) in timeline" :key="clip.id" class="timeline-clip" :class="{active:selectedIndex===i}" :style="clipStyle(clip,i)" draggable="true" @click.stop="selectClip(i)" @dragstart="onDragStart(i)" @dragover.prevent @drop="onDrop(i)">
              <div class="clip-header">
                <span class="clip-title">{{i+1}}. {{clip.label}}</span>
                <span class="clip-tc">{{fmtTime(clipDur(clip))}}</span>
                <button class="clip-dup" @click.stop="duplicateClip(i)" title="复制片段 (Ctrl+D)">⧉</button>
                <button class="clip-remove" @click.stop="removeClip(i)">×</button>
              </div>
              <div class="clip-frames">
                <img v-for="(f,fi) in (clipFrames[clip.id]||[])" :key="fi" :src="f" class="clip-frame-img"/>
                <div v-if="!(clipFrames[clip.id]||[]).length" class="clip-loading">缩略图生成中…</div>
              </div>
              <template v-if="selectedIndex===i">
                <div class="trim-handle trim-handle-l" @mousedown.stop="onTrimGrab(i,'start',$event)" @dragstart.prevent @click.stop title="拖动调整入点"><span/></div>
                <div class="trim-handle trim-handle-r" @mousedown.stop="onTrimGrab(i,'end',$event)" @dragstart.prevent @click.stop title="拖动调整出点"><span/></div>
              </template>
            </div>
            <div v-if="timeline.length===0" class="timeline-empty">从左侧点 + 添加视频到时间轴</div>
          </div>
        </div>
        <div class="editor-footer">
          <span>{{timeline.length}}片段 · {{totalDuration}}秒</span>
          <div class="export-actions">
            <button v-if="jianyingAvailable" class="btn-export btn-export-jy" :disabled="timeline.length===0||exporting||jyExporting" @click="exportToJianying">{{ jyExporting?'导出剪映中…':'🎬 导出到剪映草稿' }}</button>
            <button class="btn-export" :disabled="timeline.length===0||exporting||jyExporting" @click="exportVideo">{{exporting?(exportStage+' '+exportProgress+'%'):'⬇ 导出视频(自选位置)'}}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage, ElNotification } from 'element-plus'
import { useAssetStore } from '@/stores/asset'
import { useEditorStore, type Clip } from '@/stores/editor'

const assetStore = useAssetStore()
const editorStore = useEditorStore()
// 时间轴状态放在 store 里 → 切换节点/页面再回来不丢；并持久化到磁盘（重启也记得）
const { timeline, selectedIndex, pxPerSec, previewHeight, clipFrames, canUndo, canRedo } = storeToRefs(editorStore)
const { snapshot, undo, redo } = editorStore
const exporting = ref(false)
const exportProgress = ref(0)
const exportStage = ref('')
const isPlaying = ref(false)
const playheadTime = ref(0)
const trackRef = ref<HTMLDivElement>()
// 双 video 缓冲：videoA/videoB 两个元素，activeId 指明当前在播的那个；
// playerRef 始终指向激活元素，使现有所有 playerRef.value 读取无需改动。
const videoA = ref<HTMLVideoElement>()
const videoB = ref<HTMLVideoElement>()
const activeId = ref<'A'|'B'>('A')
const playerRef = computed(()=> activeId.value==='A' ? videoA.value : videoB.value)
const standbyRef = computed(()=> activeId.value==='A' ? videoB.value : videoA.value)
// 自定义播放控件状态
const previewBoxRef = ref<HTMLDivElement>()
const volume = ref(1)
const muted = ref(false)
// 主音量/静音变化：按各 video 元素当前承载的片段重算有效音量（保留单片段音量比例）
function applyVolume(){
  for(const el of [videoA.value,videoB.value]){
    if(!el)continue
    const clip=timeline.value.find(c=>c.id===(el as any)._clipId)
    el.volume=clipEffVolume(clip); el.muted=muted.value
  }
}
function setVolume(v:string|number){ volume.value=Math.max(0,Math.min(1,Number(v)||0)); if(volume.value>0)muted.value=false; applyVolume(); saveMasterVol() }
function toggleMute(){ muted.value=!muted.value; applyVolume(); saveMasterVol() }
// 主预览音量/静音持久化（localStorage）：重进剪辑器不再回到 100%
const MASTER_VOL_KEY='videoEditorMasterVol'
function loadMasterVol(){ try{ const r=localStorage.getItem(MASTER_VOL_KEY); if(r){ const o=JSON.parse(r); if(typeof o?.volume==='number')volume.value=Math.max(0,Math.min(1,o.volume)); if(typeof o?.muted==='boolean')muted.value=o.muted } }catch{} }
function saveMasterVol(){ try{ localStorage.setItem(MASTER_VOL_KEY, JSON.stringify({volume:volume.value,muted:muted.value})) }catch{} }
function toggleFullscreen(){ const el=previewBoxRef.value as any;if(!el)return; if(document.fullscreenElement){document.exitFullscreen?.()}else{el.requestFullscreen?.()} }
const MIN_PPS = 12, MAX_PPS = 160
function setZoom(v:number){ pxPerSec.value = Math.round(Math.max(MIN_PPS, Math.min(MAX_PPS, v))) }
function onTrackWheel(e:WheelEvent){ if(!e.ctrlKey)return; e.preventDefault(); setZoom(pxPerSec.value * (e.deltaY<0?1.12:0.89)) }
// 适应窗口：把时间轴缩放到正好铺满轨道可视宽度
function fitZoom(){
  const el=trackRef.value; const total=totalDurationExact.value
  if(!el||total<=0)return
  const avail=el.clientWidth-8 // 留点边距
  if(avail>0) setZoom(avail/total)
}

// 预览区高度可上下拖动调整（持久化在 store）
const previewResizing = ref(false)
const editorRightRef = ref<HTMLDivElement>()
let _resizeStartY = 0, _resizeStartH = 0
// 预览最大高度 = 容器高 - 下方区域（resizer/控件/底栏 + 时间轴header/ruler/轨道最小高度；选中片段时再加检查器条）。
// 防止把预览撑得过高，导致下方控件/时间轴被挤出或轨道被裁成半截。
// 窗口很矮时优先保住编辑区（时间轴/控件/底栏），预览可缩到 60。
function reserveBelow(){ return 256 + (selectedClip.value ? 34 : 0) }
function maxPreviewH(){
  const el=editorRightRef.value
  const h = el ? el.clientHeight : window.innerHeight
  return Math.max(60, h - reserveBelow())
}
// 把 previewHeight 收敛到 [60, maxPreviewH] —— 拖动时、窗口缩放时、初次恢复持久值时都调用
function clampPreviewHeight(){
  previewHeight.value = Math.min(maxPreviewH(), Math.max(60, previewHeight.value))
}
function onPreviewResizeStart(e:MouseEvent){
  previewResizing.value=true; _resizeStartY=e.clientY; _resizeStartH=previewHeight.value
  window.addEventListener('mousemove', onPreviewResizing)
  window.addEventListener('mouseup', onPreviewResizeEnd)
  e.preventDefault()
}
function onPreviewResizing(e:MouseEvent){
  if(!previewResizing.value)return
  previewHeight.value = Math.max(60, Math.min(maxPreviewH(), _resizeStartH + (e.clientY-_resizeStartY)))
}
function onPreviewResizeEnd(){
  previewResizing.value=false
  window.removeEventListener('mousemove', onPreviewResizing)
  window.removeEventListener('mouseup', onPreviewResizeEnd)
}

const videoAssets = computed(()=>assetStore.sortedAssets.filter(a=>a.type==='video'&&a.url))

// 按项目分类：读项目名(localStorage recent_projects) + 当前项目(localStorage currentProjectId)
const projectNames = ref<Record<string,string>>({})
const currentProjectId = ref<string>('')
function loadProjectMeta(){
  try{
    const raw=localStorage.getItem('recent_projects')
    const map:Record<string,string>={}
    if(raw){for(const p of JSON.parse(raw)){ if(p&&p.id) map[p.id]=p.name||'未命名项目' }}
    projectNames.value=map
  }catch{ projectNames.value={} }
  currentProjectId.value=localStorage.getItem('currentProjectId')||''
}
// 视频素材按项目分组：当前项目排最前，其余按资产数量，未分类垫底
const assetGroups = computed(()=>{
  const groups:Record<string,typeof videoAssets.value>={}
  for(const a of videoAssets.value){ const k=a.projectId||'__none__'; (groups[k]||(groups[k]=[])).push(a) }
  const keys=Object.keys(groups).sort((x,y)=>{
    if(x===currentProjectId.value)return -1; if(y===currentProjectId.value)return 1
    if(x==='__none__')return 1; if(y==='__none__')return -1
    return groups[y].length-groups[x].length
  })
  return keys.map(k=>({
    id:k,
    name:k==='__none__'?'未分类':(projectNames.value[k]||'其它项目'),
    assets:groups[k],
    isCurrent:k===currentProjectId.value,
  }))
})
// 折叠状态：默认只展开当前项目
const collapsed = ref<Record<string,boolean>>({})
function isCollapsed(id:string){ return id in collapsed.value ? collapsed.value[id] : id!==currentProjectId.value }
function toggleGroup(id:string){ collapsed.value={...collapsed.value,[id]:!isCollapsed(id)} }

const selectedClip = computed(()=>selectedIndex.value>=0?timeline.value[selectedIndex.value]:null)
// 选中片段音量（默认1）与出点，供检查器条显示/编辑
const selectedClipVolume = computed(()=> selectedClip.value && selectedClip.value.volume!=null ? selectedClip.value.volume : 1)
const selectedClipOut = computed(()=>{ const c=selectedClip.value; if(!c)return 0; return c.trimEnd>0?c.trimEnd:(c.duration||0) })
// 设某片段音量（写进 clip.volume → 随时间轴持久化、导出/剪映带上），并实时应用到正在承载它的预览元素
function setClipVolume(i:number, v:string|number){
  const c=timeline.value[i]; if(!c)return
  c.volume=Math.max(0,Math.min(1,Number(v)||0))
  applyVolume()
}
function toggleClipMute(){
  const c=selectedClip.value; if(!c)return
  setClipVolume(selectedIndex.value, (c.volume!=null?c.volume:1)>0 ? 0 : 1)
}
// 当前预览的片段：选中段优先，否则首段
const previewClip = computed(()=>selectedClip.value||timeline.value[0]||null)
const previewUrl = computed(()=>previewClip.value?.url||'')

// 检查器条出现/消失会改变下方占用高度 → 重新收敛预览高度，避免轨道被挤裁
watch(()=>!!selectedClip.value, ()=>{ clampPreviewHeight() })
function clipEffVolume(clip:Clip|null|undefined){
  const m=muted.value?0:volume.value
  const cv=clip&&clip.volume!=null?clip.volume:1
  return Math.max(0,Math.min(1,m*cv))
}
// 给 video 元素设源（记录已加载的 url，避免重复 load 触发重新缓冲）；并按片段音量设音量。
// 在元素上记 _clipId，便于主音量/静音变化时按各自承载的片段重算音量。
function setVideoSrc(el:HTMLVideoElement|undefined, clip:Clip|null|undefined){
  if(!el||!clip)return
  ;(el as any)._clipId=clip.id
  if((el as any)._loadedUrl!==clip.url){
    ;(el as any)._loadedUrl=clip.url
    el.src=clip.url; el.load()
  }
  el.volume=clipEffVolume(clip); el.muted=muted.value
}
// 手动选片/scrub：把当前预览源加载进激活的 video（连续播放切段由 advanceToClip 自行控制，这里不插手）
watch(previewClip,(clip)=>{
  if(_advancing)return
  const el=playerRef.value
  if(el&&clip) setVideoSrc(el,clip)
},{immediate:false})

// trim 边界校验：0 ≤ trimStart < trimEnd ≤ duration，避免出现负数/越界宽度
function setTrimStart(v:string|number){
  const c=selectedClip.value; if(!c)return
  const dur=c.duration||0; const end=c.trimEnd>0?c.trimEnd:dur
  let n=Number(v); if(!Number.isFinite(n))n=0
  c.trimStart=Math.max(0,Math.min(n,Math.max(0,end-0.1)))
}
function setTrimEnd(v:string|number){
  const c=selectedClip.value; if(!c)return
  const dur=c.duration||0
  let n=Number(v); if(!Number.isFinite(n))n=dur
  c.trimEnd=Math.min(dur||n,Math.max(n,(c.trimStart||0)+0.1))
}

function clipDur(c:Clip){return c.trimEnd>0?c.trimEnd-c.trimStart:c.duration||1}
function clipStart(c:Clip,idx:number){let o=0;for(let i=0;i<idx;i++)o+=clipDur(timeline.value[i]);return o}
// 精确总时长（不取整）：严格等于所有片段实际时长之和，驱动刻度范围与播放头边界
const totalDurationExact = computed(()=>{let t=0;for(const c of timeline.value)t+=clipDur(c);return t})
// 显示用总时长（取整，不显示小数）
const totalDuration = computed(()=>Math.round(totalDurationExact.value))

// 自适应刻度：根据缩放选一个"整齐"的主刻度步长，让相邻标签间距 ~64px，不挤不疏
const TICK_STEPS=[1,2,5,10,15,30,60,120,300]
const tickStep = computed(()=>{
  const targetPx=64
  const ideal=targetPx/pxPerSec.value           // 期望多少秒一格
  return TICK_STEPS.find(s=>s>=ideal) ?? TICK_STEPS[TICK_STEPS.length-1]
})
// 主刻度（带时间码标签）+ 次刻度（每个主刻度间 5 等分的短线）。末尾精确收在总时长处。
const rulerTicks = computed(()=>{
  const total=totalDurationExact.value
  const step=tickStep.value
  const out:{t:number;major:boolean;label:string}[]=[]
  if(total<=0)return out
  const minor=step/5
  for(let t=0;t<=total+1e-6;t+=minor){
    const tt=Math.round(t*1000)/1000
    const isMajor=Math.abs(tt/step-Math.round(tt/step))<1e-6
    out.push({t:tt,major:isMajor,label:isMajor?fmtTick(tt):''})
  }
  // 末端精确刻度线（严格遵循视频时长）：保留线条对齐精度，但离最近主刻度太近时不重复标注，避免两个时长叠在一起
  const last=out[out.length-1]
  if(Math.abs(last.t-total)>1e-3){
    const showLabel = (total - Math.floor(total/step)*step) >= step*0.5
    out.push({t:total,major:true,label:showLabel?fmtTick(total):''})
  }
  return out
})
// 刻度时间码（取整，无小数）：<60s 显示 "Ns"，≥60s 显示 M:SS
function fmtTick(s:number){
  const r=Math.round(s)
  if(r<60)return r+'s'
  const m=Math.floor(r/60),ss=r%60;return `${m}:${String(ss).padStart(2,'0')}`
}
const playheadX = computed(()=>playheadTime.value*pxPerSec.value)
function clipStyle(c:Clip,i:number){const s=clipStart(c,i);return{left:s*pxPerSec.value+'px',width:clipDur(c)*pxPerSec.value+'px'}}

// 时长 → 时间码 HH:MM:SS
function fmtTime(sec:number){const s=Math.max(0,Math.floor(sec||0));const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60;const p=(n:number)=>String(n).padStart(2,'0');return `${p(h)}:${p(m)}:${p(ss)}`}

const MAX_FRAMES = 40    // 单片段抽帧上限，防止超长视频卡顿

async function captureFrames(clip:Clip){
  // 时长优先用已知的 clip.duration（添加时 / 播放时已探明）—— 省掉一次多余的远程元数据请求；
  // 仅当未知时才临时 new 一个 <video> 读元数据。
  let dur = (Number.isFinite(clip.duration)&&clip.duration>0) ? clip.duration : 0
  if(!dur){
    try{
      const v=document.createElement('video'); v.src=clip.url; v.preload='metadata'
      await new Promise<void>(res=>{v.onloadedmetadata=()=>res();v.onerror=()=>res();setTimeout(res,4000)})
      if(Number.isFinite(v.duration)&&v.duration>0)dur=v.duration
    }catch{}
    if(!dur)dur=5
  }
  // 缩略图数量按时长定（与缩放解耦）：约每 0.8s 一帧，上限 MAX_FRAMES。
  // 缩放只改变片段宽度，这些帧用 flex 铺满，不会因缩放而重新抽帧。
  const count = Math.max(1, Math.min(MAX_FRAMES, Math.round(dur/0.8)))

  // 优先用主进程 ffmpeg 抽帧（不受 CORS / GPU 解码黑帧影响）
  const viaFfmpeg = window.electronAPI?.video?.thumbnails
  if(viaFfmpeg){
    try{
      const frames = await viaFfmpeg(clip.url, dur, count)
      if(frames && frames.length){ clipFrames.value[clip.id]=frames; return }
    }catch{ /* 回退到 canvas */ }
  }

  // 回退：renderer canvas 抽帧（无 ffmpeg 环境时）
  const frames:string[]=[]
  const video = document.createElement('video')
  video.crossOrigin='anonymous'; video.muted=true; video.preload='auto'; video.src = clip.url
  await new Promise<void>(r=>{video.onloadeddata=()=>r();video.onerror=()=>r();setTimeout(r,5000)})
  const step = dur/count
  for(let i=0;i<count;i++){
    video.currentTime = step*i+step/2
    await new Promise(r=>{video.onseeked=r})
    await new Promise(r=>{ (video as any).requestVideoFrameCallback ? (video as any).requestVideoFrameCallback(()=>r(null)) : requestAnimationFrame(()=>r(null)) })
    const canvas = document.createElement('canvas')
    canvas.width=284; canvas.height=160
    canvas.getContext('2d')!.drawImage(video,0,0,284,160)
    frames.push(canvas.toDataURL('image/jpeg',0.85))
  }
  clipFrames.value[clip.id]=frames
}

// 抽帧并发节流：一次加多个视频时，限制同时抽帧数，避免打满 ffmpeg 卡顿
const FRAME_CONCURRENCY = 2
let _activeCaptures = 0
const _captureQueue:Clip[] = []
function queueCapture(clip:Clip){
  _captureQueue.push(clip)
  pumpCaptureQueue()
}
function pumpCaptureQueue(){
  while(_activeCaptures<FRAME_CONCURRENCY && _captureQueue.length){
    const clip=_captureQueue.shift()!
    _activeCaptures++
    captureFrames(clip).finally(()=>{ _activeCaptures--; pumpCaptureQueue() })
  }
}

function addToTimeline(v:any){
  const clip:Clip={id:v.id+'_'+Date.now(),url:v.url,label:(v.prompt||'视频').slice(0,15),duration:5,trimStart:0,trimEnd:0}
  timeline.value.push(clip)
  if(selectedIndex.value<0)selectedIndex.value=0
  const tmp = document.createElement('video'); tmp.src=v.url; tmp.preload='metadata'
  tmp.onloadedmetadata=()=>{clip.duration=tmp.duration||5;if(!clip.trimEnd)clip.trimEnd=clip.duration}
  queueCapture(clip)
}

// 切到第 i 段：用预加载好的待命 video 瞬间互换，实现无缝衔接（不再重新 load 卡顿）
let _advancing=false
function waitReady(el:HTMLVideoElement){
  return new Promise<void>(r=>{
    if(el.readyState>=2)return r()
    const on=()=>{el.removeEventListener('loadeddata',on);r()}
    el.addEventListener('loadeddata',on)
    setTimeout(()=>{el.removeEventListener('loadeddata',on);r()},4000)
  })
}
// 把第 nx 段预加载进待命 video 并定位到入点（当前段播放时后台进行，切段时即可秒切）
function preloadNext(i:number){
  const nx=i+1
  if(nx>=timeline.value.length)return
  const sb=standbyRef.value;const c=timeline.value[nx]
  if(sb&&(sb as any)._loadedUrl!==c.url){
    setVideoSrc(sb,c)
    const on=()=>{sb.removeEventListener('loadedmetadata',on);try{sb.currentTime=c.trimStart||0}catch{}}
    sb.addEventListener('loadedmetadata',on)
  }
}
async function advanceToClip(i:number){
  if(i<0||i>=timeline.value.length){playerRef.value?.pause();return}
  _advancing=true
  const c=timeline.value[i]
  const sb=standbyRef.value
  const old=playerRef.value
  if(sb){
    // 待命 video 未预加载到本段则补加载
    if((sb as any)._loadedUrl!==c.url){ setVideoSrc(sb,c); await waitReady(sb) }
    try{ sb.currentTime=c.trimStart||0 }catch{}
    // 先让待命的开始播（此时仍透明叠在下层，已 seek 到入点、已缓冲）
    const playP=sb.play().catch(()=>{})
    // 瞬间互换可见性 + 选中段，并立刻恢复播放头循环（不等 play 完成，避免绿线冻结）
    activeId.value = activeId.value==='A' ? 'B' : 'A'
    selectedIndex.value=i
    _advancing=false
    startPlayheadLoop()
    if(old&&old!==sb) old.pause()
    await playP
  }else{
    selectedIndex.value=i
    _advancing=false
  }
  preloadNext(i) // 继续预加载再下一段
}

// 把绿线位置同步到当前播放点（忠实跟随 currentTime，绝不向前补位/吸附，避免突兀跳动）
function syncPlayhead(){
  const v=playerRef.value;if(!v)return
  const idx=selectedIndex.value;if(idx<0||idx>=timeline.value.length)return
  const clip=timeline.value[idx]
  playheadTime.value=clipStart(clip,idx)+Math.max(0,v.currentTime-(clip.trimStart||0))
}

// 绿线用 rAF 平滑跟随播放（60fps），而非靠 ~250ms 一次的 timeupdate（会一格一格跳）
let _rafId=0
function playheadTick(){
  _rafId=0
  const v=playerRef.value
  if(!v||v.paused||_advancing)return
  const idx=selectedIndex.value
  if(idx<0||idx>=timeline.value.length)return
  const clip=timeline.value[idx]
  const te=clip.trimEnd>0?clip.trimEnd:(clip.duration||0)
  // 到出点（trim 在真实时长之内时）：有下一段就接着播，否则暂停。位置不吸附，停在 currentTime 处。
  if(te>0 && v.currentTime>=te){
    syncPlayhead()
    if(idx+1<timeline.value.length){ advanceToClip(idx+1); return }
    v.pause(); return
  }
  syncPlayhead()
  _rafId=requestAnimationFrame(playheadTick)
}
function startPlayheadLoop(){ if(!_rafId) _rafId=requestAnimationFrame(playheadTick) }
function stopPlayheadLoop(){ if(_rafId){cancelAnimationFrame(_rafId);_rafId=0} }

// 双 video：只处理来自「当前激活」元素的事件，忽略待命/旧元素的串扰（否则切段时旧 video 的 pause 会误杀播放头循环）
function isActiveEvent(e:Event){ return e.target===playerRef.value }
// timeupdate 作为 rAF 的兜底（万一 rAF 没跑），同样只忠实同步、不吸附
function onTimeUpdate(e:Event){ if(!isActiveEvent(e))return; if(isPlaying.value&&!_advancing) syncPlayhead() }
function onPlayerPlay(e:Event){
  if(!isActiveEvent(e))return
  isPlaying.value=true
  // 用户点原生播放键时，若播放位置在 trim 区间外，先跳到入点（切段中 自行定位，跳过）
  if(!_advancing){
    const v=playerRef.value;const clip=selectedClip.value
    if(v&&clip){
      const ts=clip.trimStart||0;const te=clip.trimEnd>0?clip.trimEnd:(clip.duration||0)
      if(v.currentTime<ts-0.05||(te>0&&v.currentTime>=te-0.05)) v.currentTime=ts
    }
    preloadNext(selectedIndex.value) // 后台预加载下一段，第一次切换也无缝
  }
  startPlayheadLoop()
}
function onPlayerPause(e:Event){ if(!isActiveEvent(e))return; isPlaying.value=false;stopPlayheadLoop();syncPlayhead() }
// 预览播放器报告了更准的真实时长 → 校正该段（远程/生成视频元数据常虚高，时间轴框据此画偏宽）
function onDurationChange(e:Event){
  if(!isActiveEvent(e))return
  const v=playerRef.value;const clip=selectedClip.value;if(!v||!clip)return
  const real=v.duration
  if(!Number.isFinite(real)||real<=0)return
  // 时长明显不同才校正（>0.3s）；未端裁过的同步 trimEnd，端裁过的只 clamp 不超真实时长
  if(Math.abs(real-(clip.duration||0))>0.3){
    const wasUntrimmedEnd = clip.trimEnd<=0 || clip.trimEnd>=(clip.duration||0)-0.05
    clip.duration=real
    if(wasUntrimmedEnd) clip.trimEnd=real
    else clip.trimEnd=Math.min(clip.trimEnd,real)
    if(clip.trimStart>real) clip.trimStart=0
  }
}
// 视频自然播到结尾（trimEnd≥真实时长，currentTime 到不了 te）：推进下一段；最后一段则停在当前点，不吸附
function onPlayerEnded(e:Event){
  if(!isActiveEvent(e))return
  stopPlayheadLoop()
  // 自愈：视频真实停的位置明显早于记录时长 → 把这段校正成真实可播时长，时间轴框收缩对齐
  const v=playerRef.value;const clip=selectedClip.value
  if(v&&clip){
    const realEnd=v.currentTime
    const wasUntrimmedEnd = clip.trimEnd<=0 || clip.trimEnd>=(clip.duration||0)-0.05
    if(wasUntrimmedEnd && realEnd>0.3 && (clip.duration||0)-realEnd>0.3){
      clip.duration=realEnd; clip.trimEnd=realEnd
    }
  }
  if(_advancing)return
  const idx=selectedIndex.value
  if(idx>=0&&idx+1<timeline.value.length){ advanceToClip(idx+1); return }
  syncPlayhead()
}
function selectClip(i:number){selectedIndex.value=i}
// 删除某片段缩略图（回收内存）
function dropFrames(id:string){ if(id in clipFrames.value) delete clipFrames.value[id] }
// 撤销/重做后对账：清掉时间轴上已不存在的片段帧；给恢复出来但缺帧的片段补抽（命中磁盘缓存很快）
function reconcileFrames(){
  const ids=new Set(timeline.value.map(c=>c.id))
  for(const k of Object.keys(clipFrames.value)) if(!ids.has(k)) delete clipFrames.value[k]
  for(const c of timeline.value) if(!(clipFrames.value[c.id]||[]).length) queueCapture(c)
}
function doUndo(){ undo(); reconcileFrames() }
function doRedo(){ redo(); reconcileFrames() }
function removeClip(i:number){const c=timeline.value[i];snapshot();timeline.value.splice(i,1);if(c)dropFrames(c.id);if(selectedIndex.value>=timeline.value.length)selectedIndex.value=Math.max(0,timeline.value.length-1)}
function clearTimeline(){if(!timeline.value.length)return;snapshot();timeline.value=[];selectedIndex.value=-1;for(const k of Object.keys(clipFrames.value))delete clipFrames.value[k]}
// 复制选中片段，插入其后（同源、同 trim、复制缩略图）
function duplicateClip(i:number){
  const c=timeline.value[i];if(!c)return
  snapshot()
  const copy:Clip={...c,id:c.id+'_D'+Date.now()}
  timeline.value.splice(i+1,0,copy)
  const frames=clipFrames.value[c.id]
  if(frames) clipFrames.value[copy.id]=[...frames]
  selectedIndex.value=i+1
}

let dragIdx=-1
function onDragStart(i:number){dragIdx=i}
function onDrop(i:number){if(dragIdx<0||dragIdx===i)return;snapshot();const it=timeline.value.splice(dragIdx,1)[0];timeline.value.splice(i,0,it);selectedIndex.value=i;dragIdx=-1}

// 从左侧素材栏拖拽添加到时间轴
const assetDragging=ref(false)
let _draggingAsset:any=null
function onAssetDragStart(v:any){_draggingAsset=v;assetDragging.value=true}
function onAssetDragEnd(){_draggingAsset=null;assetDragging.value=false}
function onTrackDrop(){if(!_draggingAsset)return;addToTimeline(_draggingAsset);_draggingAsset=null;assetDragging.value=false}

let scrubbing=false
function onTrackMouseDown(e:MouseEvent){scrubbing=true;scrubTo(e)}
function onTrackMouseMove(e:MouseEvent){if(scrubbing)scrubTo(e)}
function onTrackMouseUp(){if(!scrubbing)return;scrubbing=false;previewSeek(playheadTime.value)}

// 播放头握把：全局拖动，不受片段原生拖拽干扰
let _grabbing=false
function onPlayheadGrab(e:MouseEvent){_grabbing=true;scrubTo(e);window.addEventListener('mousemove',onGrabMove);window.addEventListener('mouseup',onGrabEnd);e.preventDefault()}
function onGrabMove(e:MouseEvent){if(_grabbing)scrubTo(e)}
function onGrabEnd(){if(!_grabbing)return;_grabbing=false;previewSeek(playheadTime.value);window.removeEventListener('mousemove',onGrabMove);window.removeEventListener('mouseup',onGrabEnd)}

// 可视化裁剪：拖片段左/右手柄实时改 trimStart/trimEnd（像素差 ÷ pxPerSec = 秒差）
let _trimming:{idx:number;edge:'start'|'end';startX:number;origStart:number;origEnd:number}|null=null
function onTrimGrab(idx:number,edge:'start'|'end',e:MouseEvent){
  const c=timeline.value[idx];if(!c)return
  selectedIndex.value=idx
  snapshot() // 拖动是一次操作，按下时记一次快照即可
  const dur=c.duration||0
  _trimming={idx,edge,startX:e.clientX,origStart:c.trimStart||0,origEnd:c.trimEnd>0?c.trimEnd:dur}
  window.addEventListener('mousemove',onTrimMove)
  window.addEventListener('mouseup',onTrimEnd)
  e.preventDefault()
}
function onTrimMove(e:MouseEvent){
  if(!_trimming)return
  const c=timeline.value[_trimming.idx];if(!c)return
  const deltaSec=(e.clientX-_trimming.startX)/pxPerSec.value
  if(_trimming.edge==='start') setTrimStart(_trimming.origStart+deltaSec)
  else setTrimEnd(_trimming.origEnd+deltaSec)
}
function onTrimEnd(){_trimming=null;window.removeEventListener('mousemove',onTrimMove);window.removeEventListener('mouseup',onTrimEnd)}

// 在播放头处把当前片段剪成两段
function splitAtPlayhead(){
  const time=playheadTime.value
  let o=0,idx=-1,offset=0
  for(let i=0;i<timeline.value.length;i++){const d=clipDur(timeline.value[i]);if(time>o+0.05&&time<o+d-0.05){idx=i;offset=time-o;break}o+=d}
  if(idx<0)return // 播放头不在某片段内部（落在边缘或空白处）
  const c=timeline.value[idx]
  const ts=c.trimStart||0
  const te=c.trimEnd>0?c.trimEnd:(c.duration||(ts+clipDur(c)))
  const cut=ts+offset
  if(cut<=ts+0.05||cut>=te-0.05)return
  snapshot()
  const now=Date.now()
  const left:Clip={...c,id:c.id+'_L'+now,trimStart:ts,trimEnd:cut}
  const right:Clip={...c,id:c.id+'_R'+now,trimStart:cut,trimEnd:te}
  // 缩略图按 trim 区间从原片段切分，左右各取所属部分
  const full=clipFrames.value[c.id]||[]
  const D=c.duration||te||1
  const slice=(a:number,b:number)=>{if(!full.length)return [] as string[];const s=Math.floor(full.length*(a/D));const e=Math.max(s+1,Math.ceil(full.length*(b/D)));return full.slice(s,Math.min(full.length,e))}
  timeline.value.splice(idx,1,left,right)
  clipFrames.value[left.id]=slice(ts,cut)
  clipFrames.value[right.id]=slice(cut,te)
  dropFrames(c.id) // 原片段已被左右两段取代，回收其缩略图
  selectedIndex.value=idx
}

// 快捷键：S 剪开；Delete/Backspace 删除；空格 播放/暂停；←/→ 移动播放头(Shift 逐帧 1/30s)；
// Home/End 跳首尾；Ctrl+Z 撤销 / Ctrl+Y(或 Ctrl+Shift+Z) 重做；忽略输入框内按键
function togglePlay(){const v=playerRef.value;if(!v)return;if(v.paused){if(!previewUrl.value)return;v.play()}else v.pause()}
function nudgePlayhead(delta:number){const t=Math.max(0,Math.min(totalDurationExact.value,playheadTime.value+delta));playheadTime.value=t;previewSeek(t)}
function onKeydown(e:KeyboardEvent){
  const t=e.target as HTMLElement
  if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return
  // 撤销 / 重做
  if((e.ctrlKey||e.metaKey)&&(e.key==='z'||e.key==='Z')){e.preventDefault();e.shiftKey?doRedo():doUndo();return}
  if((e.ctrlKey||e.metaKey)&&(e.key==='y'||e.key==='Y')){e.preventDefault();doRedo();return}
  if((e.ctrlKey||e.metaKey)&&(e.key==='d'||e.key==='D')){e.preventDefault();if(selectedIndex.value>=0)duplicateClip(selectedIndex.value);return}
  if(e.ctrlKey||e.metaKey||e.altKey)return
  if(e.key==='s'||e.key==='S'){e.preventDefault();splitAtPlayhead();return}
  if(e.key==='Delete'||e.key==='Backspace'){if(selectedIndex.value>=0){e.preventDefault();removeClip(selectedIndex.value)}return}
  if(e.key===' '){e.preventDefault();togglePlay();return}
  if(e.key==='ArrowLeft'){e.preventDefault();nudgePlayhead(e.shiftKey?-1/30:-0.5);return}
  if(e.key==='ArrowRight'){e.preventDefault();nudgePlayhead(e.shiftKey?1/30:0.5);return}
  if(e.key==='Home'){e.preventDefault();playheadTime.value=0;previewSeek(0);return}
  if(e.key==='End'){e.preventDefault();const t2=totalDurationExact.value;playheadTime.value=t2;previewSeek(t2);return}
}
onMounted(()=>{
  window.addEventListener('keydown',onKeydown)
  loadProjectMeta()
  loadMasterVol() // 恢复上次的主预览音量/静音，再装载初始源
  // store 里恢复出来的片段没有缩略图（帧不持久化），补抽缺失的（走并发队列）
  for(const c of timeline.value){ if(!(clipFrames.value[c.id]||[]).length) queueCapture(c) }
  // 初始把当前预览源装进激活 video（不再靠模板 :src 绑定）
  if(previewClip.value) setVideoSrc(playerRef.value, previewClip.value)
  // 检测剪映是否安装（决定显不显示「导出到剪映」按钮）
  window.electronAPI?.jianying?.available?.().then(v=>{jianyingAvailable.value=!!v}).catch(()=>{})
  // 恢复出来的预览高度可能比当前窗口还大 → 先收敛；并随窗口缩放持续收敛，保证下方区域不被挤出
  clampPreviewHeight()
  window.addEventListener('resize', clampPreviewHeight)
})
onBeforeUnmount(()=>{window.removeEventListener('keydown',onKeydown);window.removeEventListener('resize',clampPreviewHeight);cancelScrubClear();stopPlayheadLoop()})

// 拖动绿线时显示的缩略图帧（瞬时跟随，远程视频不必边拖边缓冲导致黑屏）；松手后切回实帧
const scrubFrame = ref<string|null>(null)
let _scrubClearTimer:number|null=null
function cancelScrubClear(){ if(_scrubClearTimer){clearTimeout(_scrubClearTimer);_scrubClearTimer=null} }

// 取某全局时间点最接近的缩略图（帧按片段真实时长 0..duration 均匀抽）
function thumbAt(time:number):string|null{
  let o=0
  for(let i=0;i<timeline.value.length;i++){
    const c=timeline.value[i]; const d=clipDur(c)
    if(time>=o&&time<o+d){
      const frames=clipFrames.value[c.id]||[]
      if(!frames.length)return null
      const inClip=(c.trimStart||0)+(time-o)
      const dur=c.duration||(c.trimEnd>0?c.trimEnd:d)||1
      let idx=Math.floor(frames.length*(inClip/dur))
      idx=Math.max(0,Math.min(frames.length-1,idx))
      return frames[idx]
    }
    o+=d
  }
  return null
}

// 把鼠标位置换算成时间：更新绿线 + 缩略图预览（不动真实视频，避免远程边拖边缓冲）
function scrubTo(e:MouseEvent){
  if(!trackRef.value)return
  cancelScrubClear() // 正在 scrub，取消上一轮的待清除，避免把当前缩略图误清
  const r=trackRef.value.getBoundingClientRect();const x=e.clientX-r.left+trackRef.value.scrollLeft
  playheadTime.value=Math.max(0,Math.min(totalDurationExact.value,x/pxPerSec.value))
  scrubFrame.value=thumbAt(playheadTime.value)
}

// 把真实视频 seek 到精确帧，就绪后清掉缩略图（无缝切回实帧）；带兜底保证缩略图绝不卡住
function previewSeek(time:number){
  scrubFrame.value=thumbAt(time) // 先即时显示缩略图
  cancelScrubClear()
  const clear=()=>{ cancelScrubClear(); scrubFrame.value=null }
  doSeekExact(time, clear)
  _scrubClearTimer=window.setTimeout(clear, 800) // 兜底：无论 seeked/加载是否触发都清掉
}

function doSeekExact(time:number, onSeeked?:()=>void){
  let o=0
  for(let i=0;i<timeline.value.length;i++){
    const c=timeline.value[i]; const d=clipDur(c)
    if(time>=o&&time<o+d){
      if(selectedIndex.value!==i)selectedIndex.value=i
      const v=playerRef.value
      if(!v){onSeeked?.();return}
      const ct=Math.max(0,(c.trimStart||0)+(time-o))
      const seekNow=()=>{
        let done=false
        const finish=()=>{ if(done)return; done=true; v.removeEventListener('seeked',finish); onSeeked?.() }
        v.addEventListener('seeked',finish)
        setTimeout(finish,600) // 远程缓冲慢的兜底，避免缩略图一直挂着
        try{ v.currentTime=ct }catch{ finish() }
      }
      if((v as any)._loadedUrl===c.url && v.readyState>=1){
        seekNow()
      }else{
        setVideoSrc(v,c)
        const onMeta=()=>{ v.removeEventListener('loadeddata',onMeta); seekNow() }
        v.addEventListener('loadeddata',onMeta)
        setTimeout(()=>{ v.removeEventListener('loadeddata',onMeta); onSeeked?.() },4000)
      }
      return
    }
    o+=d
  }
  onSeeked?.()
}

async function exportVideo(){
  if(timeline.value.length===0)return
  exporting.value=true; exportProgress.value=0; exportStage.value='准备中'
  const off = window.electronAPI?.video?.onProgress?.((p)=>{ exportStage.value=p.stage; exportProgress.value=p.percent })
  try{
    const clips = timeline.value.map(c=>({ url:c.url, trimStart:c.trimStart||0, trimEnd:c.trimEnd||0, volume:c.volume==null?1:c.volume }))
    const r = await window.electronAPI?.video?.export(clips)
    if(r){
      ElNotification({
        title:'导出成功',
        message:'已保存到：'+r+'\n（点此打开所在文件夹）',
        type:'success',
        duration:6000,
        onClick:()=>window.electronAPI?.shell?.showItem(r),
      })
    }
    // r 为 null 表示用户取消了保存对话框，不提示
  }catch(e:any){
    ElMessage.error('导出失败：'+(e?.message||e))
  }finally{
    off?.(); exporting.value=false; exportProgress.value=0; exportStage.value=''
  }
}

// 导出到剪映草稿
const jianyingAvailable = ref(false)
const jyExporting = ref(false)
async function exportToJianying(){
  if(timeline.value.length===0||jyExporting.value)return
  jyExporting.value=true
  try{
    const clips = timeline.value.map(c=>({ url:c.url, trimStart:c.trimStart||0, trimEnd:c.trimEnd||0, volume:c.volume==null?1:c.volume }))
    // 草稿名用当前项目名（拿不到就用时间戳）
    const pname = projectNames.value[currentProjectId.value] || ''
    const name = (pname ? pname+'_' : 'AI视频_') + new Date().toISOString().slice(5,16).replace(/[-:T]/g,'')
    const folder = await window.electronAPI?.jianying?.exportDraft(clips, name)
    if(folder){
      ElNotification({
        title:'已导出到剪映草稿',
        message:'草稿名：'+name+'\n请重启剪映专业版后在草稿列表查看（点此打开草稿文件夹）',
        type:'success',
        duration:8000,
        onClick:()=>window.electronAPI?.shell?.showItem(folder),
      })
    }
  }catch(e:any){
    ElMessage.error('导出剪映失败：'+(e?.message||e))
  }finally{
    jyExporting.value=false
  }
}
</script>

<style scoped>
.editor-view{width:100%;height:100%;background:#020308;display:flex;flex-direction:column}.editor-main{display:flex;flex:1;overflow:hidden}
.editor-sidebar{width:200px;flex-shrink:0;border-right:1px solid rgba(0,217,255,.1);padding:10px;overflow-y:auto}.editor-sidebar h4{color:#00D9FF;font-size:12px;font-weight:500;margin:0 0 8px}.sidebar-empty{color:rgba(255,255,255,.3);font-size:12px;text-align:center;padding:40px 10px}.sidebar-item{display:flex;align-items:center;gap:8px;padding:8px;border-radius:6px;cursor:grab;margin-bottom:4px;transition:background .15s}.sidebar-item:active{cursor:grabbing}.sidebar-item:hover{background:rgba(0,217,255,.06)}
.asset-group{margin-bottom:6px}.group-header{display:flex;align-items:center;gap:6px;padding:5px 6px;border-radius:5px;cursor:pointer;user-select:none;background:rgba(255,255,255,.03)}.group-header:hover{background:rgba(0,217,255,.08)}.group-header.current{background:rgba(0,217,255,.12)}.group-caret{font-size:9px;color:rgba(0,217,255,.7);width:10px;flex-shrink:0}.group-name{flex:1;font-size:11px;color:#cfe9f5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.group-header.current .group-name{color:#00D9FF;font-weight:500}.group-count{font-size:10px;color:rgba(255,255,255,.35);background:rgba(255,255,255,.06);border-radius:8px;padding:1px 7px;flex-shrink:0}.sidebar-thumb{width:44px;height:32px;object-fit:cover;border-radius:4px;flex-shrink:0}.sidebar-info{flex:1;min-width:0}.sidebar-name{font-size:11px;color:#e0e0e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sidebar-meta{font-size:10px;color:rgba(255,255,255,.3)}.sidebar-add{font-size:16px;color:rgba(0,217,255,.5);flex-shrink:0}
.editor-right{flex:1;display:flex;flex-direction:column;min-width:0}.editor-preview{flex-shrink:0;background:#000;display:flex;align-items:center;justify-content:center;border-bottom:1px solid rgba(0,217,255,.1);position:relative}
.preview-player{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain}
/* 待命 video 不用 display:none（会被浏览器停止解码、白预加载），改透明叠放保持就绪 */
.preview-player.hidden{opacity:0;pointer-events:none;z-index:0}
.preview-player:not(.hidden){z-index:1}
.preview-empty{color:rgba(255,255,255,.2);font-size:14px;position:relative;z-index:2}
.scrub-frame{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;z-index:3;pointer-events:none}
.preview-resizer{height:8px;flex-shrink:0;cursor:ns-resize;display:flex;align-items:center;justify-content:center;background:rgba(0,217,255,.04);border-bottom:1px solid rgba(0,217,255,.08);transition:background .15s}.preview-resizer:hover,.preview-resizer.active{background:rgba(0,217,255,.18)}.resizer-grip{width:46px;height:3px;border-radius:2px;background:rgba(0,217,255,.4)}.preview-resizer:hover .resizer-grip,.preview-resizer.active .resizer-grip{background:#00D9FF;box-shadow:0 0 6px rgba(0,217,255,.5)}
.editor-controls{display:flex;align-items:center;gap:10px;padding:6px 14px;border-bottom:1px solid rgba(0,217,255,.06);flex-shrink:0}
.ctrl-btn{min-width:28px;height:28px;padding:0 6px;border:none;border-radius:5px;background:rgba(0,217,255,.1);color:#00D9FF;font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}.ctrl-btn:hover{background:rgba(0,217,255,.22)}
.ctrl-time{font-size:11px;color:rgba(255,255,255,.5);font-variant-numeric:tabular-nums;white-space:nowrap}
.ctrl-spacer{flex:1}
.ctrl-volume{display:flex;align-items:center;gap:6px}
.ctrl-vol-range{width:80px;height:4px;-webkit-appearance:none;appearance:none;background:rgba(0,217,255,.18);border-radius:2px;outline:none;cursor:pointer}.ctrl-vol-range::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:11px;border-radius:50%;background:#00D9FF;cursor:pointer;box-shadow:0 0 5px rgba(0,217,255,.5)}
.editor-timeline{flex:1;display:flex;flex-direction:column;overflow:hidden;user-select:none}
.clip-inspector{display:flex;align-items:center;gap:12px;padding:5px 14px;border-bottom:1px solid rgba(0,217,255,.06);flex-shrink:0;background:rgba(0,217,255,.03)}.ci-name{font-size:11px;color:#9be8ff;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0}.ci-vol{display:flex;align-items:center;gap:6px}.ci-volbtn{min-width:24px;height:24px;font-size:12px}.ci-pct{font-size:10px;color:rgba(255,255,255,.5);font-variant-numeric:tabular-nums;width:34px;text-align:right}.ci-trim{font-size:10px;color:rgba(255,255,255,.35);font-variant-numeric:tabular-nums;margin-left:auto;white-space:nowrap}
.timeline-header{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;flex-shrink:0}.timeline-header span{font-size:11px;color:rgba(255,255,255,.35)}.timeline-actions{display:flex;gap:8px;align-items:center}.btn-sm{padding:4px 12px;border-radius:4px;font-size:11px;cursor:pointer;border:none;background:rgba(0,217,255,.1);color:#00D9FF}.btn-sm:hover{background:rgba(0,217,255,.2)}.btn-danger-text{background:transparent;color:rgba(255,68,68,.5)}.btn-danger-text:hover{color:#ff4444;background:rgba(255,68,68,.1)}
.zoom-ctrl{display:flex;align-items:center;gap:5px;margin-right:4px}.zoom-btn{width:20px;height:20px;border:none;border-radius:4px;background:rgba(0,217,255,.1);color:#00D9FF;font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}.zoom-btn:hover{background:rgba(0,217,255,.22)}.zoom-btn:disabled{opacity:.3;cursor:not-allowed}.zoom-range{width:96px;height:4px;-webkit-appearance:none;appearance:none;background:rgba(0,217,255,.18);border-radius:2px;outline:none;cursor:pointer}.zoom-range::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:#00D9FF;cursor:pointer;box-shadow:0 0 6px rgba(0,217,255,.5)}
.timeline-ruler{position:relative;height:22px;margin:0 14px;flex-shrink:0;border-bottom:1px solid rgba(0,217,255,.12)}
.ruler-tick{position:absolute;bottom:0;width:1px;height:5px;background:rgba(255,255,255,.18)}
.ruler-tick.major{height:10px;background:rgba(0,217,255,.45)}
.ruler-label{position:absolute;bottom:11px;left:0;transform:translateX(-50%);font-size:10px;color:rgba(255,255,255,.4);white-space:nowrap;font-variant-numeric:tabular-nums}
.timeline-track{position:relative;flex:1;margin:0 14px 14px;background:rgba(255,255,255,.01);border-radius:8px;overflow-x:auto;overflow-y:hidden;cursor:pointer;min-height:80px}.timeline-track.drag-over{background:rgba(0,217,255,.06);box-shadow:inset 0 0 0 2px rgba(0,217,255,.4)}.timeline-empty{color:rgba(255,255,255,.2);font-size:13px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);white-space:nowrap}
.timeline-playhead{position:absolute;top:0;bottom:0;z-index:20;pointer-events:none;width:0}.playhead-line{position:absolute;top:16px;bottom:0;left:50%;width:3px;background:#00ff88;transform:translateX(-50%);box-shadow:0 0 5px rgba(0,255,136,.7)}.playhead-handle{position:absolute;top:1px;left:50%;width:20px;height:15px;transform:translateX(-50%);background:#00ff88;border-radius:4px;cursor:ew-resize;pointer-events:auto;box-shadow:0 0 8px rgba(0,255,136,.6)}.playhead-handle:hover{background:#5effb0}.playhead-handle::after{content:'';position:absolute;left:50%;bottom:-5px;transform:translateX(-50%);border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #00ff88}
.timeline-clip{position:absolute;top:4px;bottom:4px;border-radius:4px;overflow:hidden;background:rgba(0,0,0,.5);border:1px solid rgba(0,217,255,.2);cursor:pointer;transition:border-color .15s;display:flex;flex-direction:column}.timeline-clip:hover{border-color:rgba(0,217,255,.5)}.timeline-clip.active{border-color:#00D9FF;box-shadow:0 0 6px rgba(0,217,255,.3)}
.clip-header{display:flex;align-items:center;gap:6px;height:16px;flex-shrink:0;padding:0 4px;background:rgba(0,217,255,.18);border-bottom:1px solid rgba(0,217,255,.25)}.clip-title{flex:1;min-width:0;font-size:9px;color:#cfffff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.clip-tc{font-size:9px;color:rgba(0,217,255,.85);font-variant-numeric:tabular-nums;flex-shrink:0}
.clip-frames{display:flex;flex:1;min-height:0;gap:0;position:relative;background:#05080e}.clip-frame-img{height:100%;flex:1;min-width:0;object-fit:cover;opacity:.95}
.clip-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:rgba(0,217,255,.6);background:repeating-linear-gradient(90deg,rgba(0,217,255,.04) 0 12px,rgba(0,217,255,.09) 12px 24px);animation:clippulse 1.2s ease-in-out infinite}@keyframes clippulse{0%,100%{opacity:.5}50%{opacity:.9}}
.clip-remove{width:13px;height:13px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;font-size:10px;line-height:1;cursor:pointer;display:none;align-items:center;justify-content:center;padding:0;flex-shrink:0}.timeline-clip:hover .clip-remove{display:flex}
.clip-dup{width:14px;height:13px;border-radius:3px;border:none;background:rgba(0,0,0,.55);color:#9be8ff;font-size:9px;line-height:1;cursor:pointer;display:none;align-items:center;justify-content:center;padding:0;flex-shrink:0;margin-left:auto}.timeline-clip:hover .clip-dup{display:flex}.clip-dup:hover{background:rgba(0,217,255,.4);color:#fff}
/* 可视化裁剪手柄：选中片段左右边缘，可拖动改入/出点（青色，与片段框统一） */
.trim-handle{position:absolute;top:0;bottom:0;width:12px;z-index:15;cursor:ew-resize;display:flex;align-items:center;justify-content:center;background:rgba(0,217,255,.2)}.trim-handle:hover{background:rgba(0,217,255,.4)}.trim-handle-l{left:0;border-left:3px solid #00D9FF;border-radius:4px 0 0 4px}.trim-handle-r{right:0;border-right:3px solid #00D9FF;border-radius:0 4px 4px 0}.trim-handle span{width:2px;height:40%;background:#00D9FF;border-radius:1px;box-shadow:0 0 5px rgba(0,217,255,.8)}
.editor-footer{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-top:1px solid rgba(0,217,255,.1);flex-shrink:0}.editor-footer span{font-size:12px;color:rgba(255,255,255,.3)}.export-actions{display:flex;gap:10px;align-items:center}.btn-export{padding:10px 24px;background:rgba(0,217,255,.12);border:1px solid #00D9FF;border-radius:8px;color:#00D9FF;font-size:14px;cursor:pointer;white-space:nowrap}.btn-export:hover:not(:disabled){background:rgba(0,217,255,.25);box-shadow:0 0 16px rgba(0,217,255,.3)}.btn-export:disabled{opacity:.4;cursor:not-allowed}.btn-export-jy{background:rgba(180,50,255,.14);border-color:#B432FF;color:#d79bff}.btn-export-jy:hover:not(:disabled){background:rgba(180,50,255,.28);box-shadow:0 0 16px rgba(180,50,255,.3)}
</style>
