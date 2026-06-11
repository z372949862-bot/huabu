<template>
  <div class="editor-view">
    <div class="editor-main">
      <div class="editor-sidebar">
        <h4>视频素材</h4>
        <div v-if="videoAssets.length === 0" class="sidebar-empty">暂无视频</div>
        <div v-else class="sidebar-list">
          <div v-for="v in videoAssets" :key="v.id" class="sidebar-item" @click="addToTimeline(v)">
            <video :src="v.url" class="sidebar-thumb" muted preload="metadata" />
            <div class="sidebar-info"><div class="sidebar-name">{{ v.prompt?.slice(0,25)||'未命名' }}</div><div class="sidebar-meta">{{ v.model }}</div></div>
            <span class="sidebar-add">+</span>
          </div>
        </div>
      </div>
      <div class="editor-right">
        <div class="editor-preview">
          <video ref="playerRef" :src="previewUrl" class="preview-player" controls @timeupdate="onTimeUpdate" @play="onPlayerPlay" @pause="onPlayerPause" />
          <div v-if="!previewUrl" class="preview-empty">点击时间线视频预览</div>
        </div>
        <div v-if="selectedClip" class="editor-trim">
          <span class="trim-label">{{ selectedClip.label }}</span>
          <label class="trim-input">入<input type="number" v-model.number="selectedClip.trimStart" :max="selectedClip.duration" min="0" step="0.5" class="trim-num"/>s</label>
          <label class="trim-input">出<input type="number" v-model.number="selectedClip.trimEnd" :max="selectedClip.duration" min="0" step="0.5" class="trim-num"/>s</label>
          <button class="btn-sm" @click="playTrimPreview">预览</button>
        </div>
        <div class="editor-timeline">
          <div class="timeline-header">
            <span>时间轴 {{ timeline.length }}片段 · {{ totalDuration }}s</span>
            <div class="timeline-actions">
              <button v-if="timeline.length>0" class="btn-sm" @click="playAll">▶ 全部</button>
              <button v-if="timeline.length>0" class="btn-sm btn-danger-text" @click="timeline=[];selectedIndex=-1">清空</button>
            </div>
          </div>
          <div class="timeline-ruler"><div v-for="t in rulerTicks" :key="t" class="ruler-tick" :style="{left:t*pxPerSec+'px'}">{{t}}s</div></div>
          <div class="timeline-track" ref="trackRef" @mousedown="onTrackMouseDown" @mousemove="onTrackMouseMove" @mouseup="onTrackMouseUp" @mouseleave="onTrackMouseUp">
            <div class="timeline-playhead" :style="{left:playheadX+'px'}"><div class="playhead-line"/><div class="playhead-dot"/></div>
            <div v-for="(clip,i) in timeline" :key="clip.id" class="timeline-clip" :class="{active:selectedIndex===i}" :style="clipStyle(clip,i)" draggable="true" @click.stop="selectClip(i)" @dragstart="onDragStart(i)" @dragover.prevent @drop="onDrop(i)">
              <div class="clip-frames">
                <img v-for="(f,fi) in (clipFrames[clip.id]||[])" :key="fi" :src="f" class="clip-frame-img"/>
              </div>
              <span class="clip-label">{{i+1}}. {{clip.label}}</span>
              <button class="clip-remove" @click.stop="removeClip(i)">×</button>
            </div>
            <div v-if="timeline.length===0" class="timeline-empty">从左侧点 + 添加视频到时间轴</div>
          </div>
        </div>
        <div class="editor-footer">
          <span>{{timeline.length}}片段 · {{totalDuration}}秒</span>
          <button class="btn-export" :disabled="timeline.length===0||exporting" @click="exportVideo">{{exporting?'导出中...':'⬇ 导出视频'}}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useAssetStore } from '@/stores/asset'

interface Clip { id:string; url:string; label:string; duration:number; trimStart:number; trimEnd:number }

const assetStore = useAssetStore()
const timeline = ref<Clip[]>([])
const selectedIndex = ref(-1)
const exporting = ref(false)
const isPlaying = ref(false)
const playheadTime = ref(0)
const trackRef = ref<HTMLDivElement>()
const playerRef = ref<HTMLVideoElement>()
const clipFrames = reactive<Record<string,string[]>>({})
const pxPerSec = 30

const videoAssets = computed(()=>assetStore.sortedAssets.filter(a=>a.type==='video'&&a.url))
const selectedClip = computed(()=>selectedIndex.value>=0?timeline.value[selectedIndex.value]:null)
const previewUrl = computed(()=>selectedClip.value?.url||timeline.value[0]?.url||'')

function clipDur(c:Clip){return c.trimEnd>0?c.trimEnd-c.trimStart:c.duration||1}
function clipStart(c:Clip,idx:number){let o=0;for(let i=0;i<idx;i++)o+=clipDur(timeline.value[i]);return o}
const totalDuration = computed(()=>{let t=0;for(const c of timeline.value)t+=clipDur(c);return Math.round(t)})
const rulerTicks = computed(()=>{const a:number[]=[];const step=totalDuration.value>30?5:2;for(let i=0;i<=totalDuration.value;i+=step)a.push(i);return a})
const playheadX = computed(()=>playheadTime.value*pxPerSec)
function clipStyle(c:Clip,i:number){const s=clipStart(c,i);return{left:s*pxPerSec+'px',width:clipDur(c)*pxPerSec+'px'}}

async function captureFrames(clip:Clip, count=4){
  const frames:string[]=[]
  const dur = clip.duration||5
  const video = document.createElement('video')
  video.src = clip.url; video.crossOrigin='anonymous'; video.preload='auto'; video.muted=true
  await new Promise<void>(r=>{video.onloadedmetadata=()=>r();video.load()})
  const step = dur/count
  for(let i=0;i<count;i++){
    video.currentTime = step*i+step/2
    await new Promise(r=>{video.onseeked=r})
    const canvas = document.createElement('canvas')
    canvas.width=80; canvas.height=45
    canvas.getContext('2d')!.drawImage(video,0,0,80,45)
    frames.push(canvas.toDataURL('image/jpeg',0.6))
  }
  clipFrames[clip.id]=frames
}

function addToTimeline(v:any){
  const clip:Clip={id:v.id+'_'+Date.now(),url:v.url,label:(v.prompt||'视频').slice(0,15),duration:5,trimStart:0,trimEnd:0}
  timeline.value.push(clip)
  if(selectedIndex.value<0)selectedIndex.value=0
  const tmp = document.createElement('video'); tmp.src=v.url; tmp.preload='metadata'
  tmp.onloadedmetadata=()=>{clip.duration=tmp.duration||5;if(!clip.trimEnd)clip.trimEnd=clip.duration}
  captureFrames(clip,4)
}

function onTimeUpdate(){if(!playerRef.value||!isPlaying.value)return;const t=playerRef.value.currentTime;const idx=selectedIndex.value;if(idx<0||idx>=timeline.value.length)return;const clip=timeline.value[idx];playheadTime.value=clipStart(clip,idx)+(t-(clip.trimStart||0))}
function onPlayerPlay(){isPlaying.value=true}
function onPlayerPause(){isPlaying.value=false}
function selectClip(i:number){selectedIndex.value=i}
function removeClip(i:number){timeline.value.splice(i,1);if(selectedIndex.value>=timeline.value.length)selectedIndex.value=Math.max(0,timeline.value.length-1)}

let dragIdx=-1
function onDragStart(i:number){dragIdx=i}
function onDrop(i:number){if(dragIdx<0||dragIdx===i)return;const it=timeline.value.splice(dragIdx,1)[0];timeline.value.splice(i,0,it);selectedIndex.value=i;dragIdx=-1}

let scrubbing=false
function onTrackMouseDown(e:MouseEvent){scrubbing=true;seekToMouse(e)}
function onTrackMouseMove(e:MouseEvent){if(scrubbing)seekToMouse(e)}
function onTrackMouseUp(){scrubbing=false}

function seekToMouse(e:MouseEvent){
  if(!trackRef.value)return
  const r=trackRef.value.getBoundingClientRect();const x=e.clientX-r.left+trackRef.value.scrollLeft
  playheadTime.value=Math.max(0,Math.min(totalDuration.value,x/pxPerSec));seekToClip(playheadTime.value)
}

function seekToClip(time:number){
  let o=0
  for(let i=0;i<timeline.value.length;i++){const d=clipDur(timeline.value[i]);if(time>=o&&time<o+d){const c=timeline.value[i];selectedIndex.value=i;const v=playerRef.value;if(v){if(v.src!==c.url)v.src=c.url;setTimeout(()=>{if(v)v.currentTime=Math.max(0,(c.trimStart||0)+(time-o))},50)}return}o+=d}
}

function playTrimPreview(){const c=selectedClip.value;const v=playerRef.value;if(!c||!v)return;v.currentTime=c.trimStart||0;v.play();if(c.trimEnd>0){const t=setInterval(()=>{if(v.currentTime>=c.trimEnd){v.pause();clearInterval(t)}},200)}}

async function playAll(){for(let i=0;i<timeline.value.length;i++){selectedIndex.value=i;const c=timeline.value[i];const v=playerRef.value;if(!v)continue;v.src=c.url;await new Promise<void>(r=>{const on=()=>{v.removeEventListener('loadedmetadata',on);v.currentTime=c.trimStart||0;v.play();setTimeout(r,clipDur(c)*1000+300)};v.addEventListener('loadedmetadata',on);v.load()})}}
async function exportVideo(){if(timeline.value.length===0)return;exporting.value=true;try{const r=await window.electronAPI?.video?.export(timeline.value.map(c=>c.url),'.');if(r)window.alert('导出成功!\n'+r)}catch(e:any){window.alert('导出失败:'+(e?.message||e))}finally{exporting.value=false}}
</script>

<style scoped>
.editor-view{width:100%;height:100%;background:#020308;display:flex;flex-direction:column}.editor-main{display:flex;flex:1;overflow:hidden}
.editor-sidebar{width:200px;flex-shrink:0;border-right:1px solid rgba(0,217,255,.1);padding:10px;overflow-y:auto}.editor-sidebar h4{color:#00D9FF;font-size:12px;font-weight:500;margin:0 0 8px}.sidebar-empty{color:rgba(255,255,255,.3);font-size:12px;text-align:center;padding:40px 10px}.sidebar-item{display:flex;align-items:center;gap:8px;padding:8px;border-radius:6px;cursor:pointer;margin-bottom:4px;transition:background .15s}.sidebar-item:hover{background:rgba(0,217,255,.06)}.sidebar-thumb{width:44px;height:32px;object-fit:cover;border-radius:4px;flex-shrink:0}.sidebar-info{flex:1;min-width:0}.sidebar-name{font-size:11px;color:#e0e0e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sidebar-meta{font-size:10px;color:rgba(255,255,255,.3)}.sidebar-add{font-size:16px;color:rgba(0,217,255,.5);flex-shrink:0}
.editor-right{flex:1;display:flex;flex-direction:column;min-width:0}.editor-preview{height:260px;flex-shrink:0;background:#000;display:flex;align-items:center;justify-content:center;border-bottom:1px solid rgba(0,217,255,.1)}.preview-player{max-width:100%;max-height:100%}.preview-empty{color:rgba(255,255,255,.2);font-size:14px}
.editor-trim{display:flex;align-items:center;gap:14px;padding:6px 14px;border-bottom:1px solid rgba(0,217,255,.06);flex-shrink:0}.trim-label{font-size:12px;color:#00D9FF;font-weight:500}.trim-input{display:flex;align-items:center;gap:4px;font-size:11px;color:rgba(255,255,255,.5)}.trim-num{width:44px;padding:2px 6px;background:rgba(0,217,255,.05);border:1px solid rgba(0,217,255,.2);border-radius:4px;color:#fff;font-size:11px;text-align:center}
.editor-timeline{flex:1;display:flex;flex-direction:column;overflow:hidden;user-select:none}.timeline-header{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;flex-shrink:0}.timeline-header span{font-size:11px;color:rgba(255,255,255,.35)}.timeline-actions{display:flex;gap:8px}.btn-sm{padding:4px 12px;border-radius:4px;font-size:11px;cursor:pointer;border:none;background:rgba(0,217,255,.1);color:#00D9FF}.btn-sm:hover{background:rgba(0,217,255,.2)}.btn-danger-text{background:transparent;color:rgba(255,68,68,.5)}.btn-danger-text:hover{color:#ff4444;background:rgba(255,68,68,.1)}
.timeline-ruler{position:relative;height:18px;margin:0 14px;flex-shrink:0}.ruler-tick{position:absolute;font-size:10px;color:rgba(255,255,255,.22);transform:translateX(-50%)}
.timeline-track{position:relative;flex:1;margin:0 14px 14px;background:rgba(255,255,255,.01);border-radius:8px;overflow-x:auto;overflow-y:hidden;cursor:pointer;min-height:72px}.timeline-empty{color:rgba(255,255,255,.2);font-size:13px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);white-space:nowrap}
.timeline-playhead{position:absolute;top:-18px;bottom:0;z-index:10;pointer-events:none;width:0}.playhead-line{position:absolute;top:0;bottom:0;left:50%;width:2px;background:#00ff88;transform:translateX(-50%)}.playhead-dot{position:absolute;top:-4px;left:50%;width:10px;height:10px;background:#00ff88;border-radius:50%;transform:translate(-50%,0)}
.timeline-clip{position:absolute;top:4px;bottom:4px;border-radius:5px;overflow:hidden;background:rgba(0,0,0,.5);border:1px solid rgba(0,217,255,.12);cursor:pointer;transition:border-color .15s}.timeline-clip:hover{border-color:rgba(0,217,255,.35)}.timeline-clip.active{border-color:#00D9FF;box-shadow:0 0 6px rgba(0,217,255,.25)}
.clip-frames{display:flex;height:100%;gap:1px}.clip-frame-img{height:100%;flex:1;object-fit:cover;opacity:.65}
.clip-label{position:absolute;bottom:0;left:0;right:0;font-size:9px;color:#fff;padding:1px 6px;background:linear-gradient(transparent,rgba(0,0,0,.9));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:1}
.clip-remove{position:absolute;top:1px;right:1px;width:14px;height:14px;border-radius:50%;border:none;background:rgba(0,0,0,.8);color:#fff;font-size:10px;cursor:pointer;display:none;align-items:center;justify-content:center;padding:0;z-index:2}.timeline-clip:hover .clip-remove{display:flex}
.editor-footer{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-top:1px solid rgba(0,217,255,.1);flex-shrink:0}.editor-footer span{font-size:12px;color:rgba(255,255,255,.3)}.btn-export{padding:10px 28px;background:rgba(0,217,255,.12);border:1px solid #00D9FF;border-radius:8px;color:#00D9FF;font-size:14px;cursor:pointer}.btn-export:hover:not(:disabled){background:rgba(0,217,255,.25);box-shadow:0 0 16px rgba(0,217,255,.3)}.btn-export:disabled{opacity:.4;cursor:not-allowed}
</style>
