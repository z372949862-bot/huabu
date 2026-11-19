<template>
  <section class="depth-node node-surface" :class="{ selected: selected || canvas.selectedNodeId === id }" aria-label="视频转深度节点" @click="canvas.selectNode(id)">
    <Handle id="target" type="target" :position="Position.Left" title="连接一个源视频" />
    <header><CanvasIcon name="depth" /><strong>视频转深度</strong><small>FlyAPI · H3</small></header>
    <div v-if="source && data.outputVideo" class="preview-tabs nodrag nopan" aria-label="视频预览切换">
      <button type="button" :aria-pressed="!showResult" @click.stop="showResult = false">源视频</button>
      <button type="button" :aria-pressed="showResult" @click.stop="showResult = true">深度结果</button>
    </div>
    <div class="node-main preview">
      <video v-if="data.outputVideo && (showResult || !source)" :src="mediaPreview(data.outputVideo)" controls playsinline preload="metadata" class="nodrag nopan" aria-label="深度视频结果" />
      <video v-else-if="source" :key="source.url" :src="mediaPreview(source.url)" controls playsinline preload="metadata" class="nodrag nopan" aria-label="源视频预览" @loadedmetadata="showEstimate" />
      <div v-else class="empty"><CanvasIcon name="depth" /><span>连接视频，或选择本地 MP4</span></div>
    </div>
    <div class="fields nodrag nopan nowheel" @dblclick.stop>
      <label class="account">FlyAPI 账号<select v-model="accountId" :disabled="locked || !accounts.length" aria-label="视频转深度账号"><option v-if="!accounts.length" value="">请先在设置中添加 FlyAPI</option><option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option></select></label>
      <div class="source-row"><span :title="source?.name">{{ source?.name || (linked ? '已连接源视频' : '尚未选择源视频') }}</span>
        <button v-if="data.depthSource" :disabled="locked" @click.stop="clearFile">移除本地视频</button>
        <button v-else-if="!linked" :disabled="locked" @click.stop="picker?.click()">{{ reading ? '读取中…' : '选择 MP4' }}</button>
        <input ref="picker" type="file" accept="video/mp4,.mp4" hidden aria-label="选择本地 MP4" @change="chooseFile" />
      </div>
      <small v-if="data.depthSource && !locked" class="hint">要改用画布连线，请先移除本地视频。</small>
      <small v-if="!readyAccount" class="hint">请在设置中为所选 FlyAPI 账号填写 API Key。</small>
      <p class="quote" aria-live="polite">{{ estimate || '最多 30 秒 · ¥0.20/秒，提交前确认费用' }}</p>
      <p v-if="problem || localError || data.error" class="error" role="alert">{{ localError || problem || data.error }}</p>
      <template v-if="data.status === 'running'">
        <p role="status">{{ data.referenceWarning || `正在转换 · ${Math.round(data.progress || 0)}%` }}</p>
        <button class="primary" @click.stop="canvas.cancelExecution(id)">停止等待</button>
      </template>
      <template v-else-if="data.flyapiTask && !data.flyapiTask.taskId">
        <p>上次提交未收到任务号。请先到 FlyAPI 任务记录核对。</p>
        <input v-model.trim="recoveryId" :disabled="checkingRecovery" class="recover" aria-label="原任务号" placeholder="输入平台上的原任务号" />
        <div class="actions"><button :disabled="checkingRecovery || !readyAccount || !isFlyapiTaskId(recoveryId)" @click.stop="resume">{{ checkingRecovery ? '核对中…' : '继续查询' }}</button><button :disabled="checkingRecovery" @click.stop="forget">已核对未建单</button></div>
      </template>
      <button v-else-if="data.flyapiTask?.taskId" class="primary" :disabled="!readyAccount" @click.stop="run">继续查询原任务</button>
      <button v-else class="primary" :disabled="reading || !source || !readyAccount || !!problem || invalidDuration" @click.stop="run">核对费用并转换</button>
    </div>
    <Handle id="source" type="source" :position="Position.Right" title="输出深度视频" />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import CanvasIcon from './CanvasIcon.vue'
import { useAIStore } from '@/stores/ai'
import { useNodeStore, type NodeData } from '@/stores/node'
import { FlyapiDepthProvider, depthAccount, depthPrice, depthSourceFor, mediaPreview } from '@/services/providers/flyapiDepth'
import { FlyapiProvider, isFlyapiTaskId } from '@/services/providers/flyapi'
const props = defineProps<{ id:string; data:NodeData; selected?:boolean }>()
const canvas = useNodeStore(), ai = useAIStore()
const accounts = computed(()=>ai.videoProviders.filter(p=>p.kind==='flyapi'))
const accountId=computed({get:()=>depthAccount(accounts.value,props.data.flyapiTask?.providerId || props.data.providerId),set:(id:string)=>canvas.updateNodeData(props.id,{providerId:id})})
const readyAccount = computed(() => accounts.value.some(a => a.id === accountId.value && !!a.apiKey?.trim()))
const showResult = ref(!!props.data.outputVideo), invalidDuration = ref(false)
watch(() => props.data.outputVideo, value => { if (value) showResult.value = true })
const linked=computed(()=>canvas.edges.some(e=>e.target===props.id))
const selection=computed(()=>{try{return {source:depthSourceFor(props.data,canvas.nodes,canvas.edges,props.id),error:''}}catch(e){return {source:undefined,error:linked.value || props.data.depthSource ? (e as Error).message : ''}}})
const source=computed(()=>selection.value.source), problem=computed(()=>props.data.flyapiTask ? '' : selection.value.error)
const picker=ref<HTMLInputElement>(), reading=ref(false), localError=ref(''), estimate=ref(''), recoveryId=ref('')
const checkingRecovery = ref(false)
const locked=computed(()=>reading.value || props.data.status==='running' || !!props.data.flyapiTask)
watch(() => source.value?.url, () => {
  estimate.value = ''; localError.value = ''; invalidDuration.value = false; showResult.value = false
}, { flush: 'sync' })
function showEstimate(event:Event){const v=event.target as HTMLVideoElement; if(!v.videoWidth || !v.videoHeight)return
  try{estimate.value=`${Number(v.duration.toFixed(3))} 秒 · 预计 ¥${depthPrice(v.duration)}`}catch{estimate.value='源视频时长无效或超过 30 秒'; invalidDuration.value = true} }
let mounted=true;onBeforeUnmount(()=>{mounted=false})
function clearFile(){canvas.updateNodeData(props.id,{depthSource:undefined,error:undefined});localError.value=''}
async function chooseFile(event:Event){
  const input=event.target as HTMLInputElement,file=input.files?.[0];input.value=''
  if(!file || locked.value || linked.value)return
  localError.value=''; if(!/\.mp4$/i.test(file.name) || !file.size || file.size>100*1024*1024){localError.value='请选择不超过 100 MB 的本地 MP4 视频';return}
  const pid=canvas.currentProjectId;reading.value=true
  try{
    const storage=window.electronAPI?.upload;if(!storage)throw new Error('请在桌面版选择本地视频')
    const base64=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(new Error('无法读取本地视频'));r.onload=()=>resolve(String(r.result).split(',')[1]);r.readAsDataURL(file)})
    const path=await storage.save(base64,file.name);if(!path)throw new Error('本地视频保存失败，请检查磁盘空间')
    if(!mounted || canvas.currentProjectId!==pid || linked.value || !canvas.nodes.some(n=>n.id===props.id)){await storage.delete(path);return}
    canvas.updateNodeData(props.id,{depthSource:{name:file.name,url:'local-upload:///'+path.replace(/\\/g,'/')},error:undefined})
  }catch(e){localError.value=e instanceof Error?e.message:'添加视频失败'}finally{reading.value=false}
}
function run(){localError.value='';return canvas.executeNode(props.id)}
async function resume() {
  const task = props.data.flyapiTask, id = recoveryId.value, projectId = canvas.currentProjectId
  if (checkingRecovery.value || !projectId || !task || task.taskId || !isFlyapiTaskId(id)) return
  const account = ai.getProviderConfig(task.providerId)
  if (account?.kind !== 'flyapi' || !account.apiKey?.trim()) return
  const current = () => mounted && canvas.currentProjectId === projectId && canvas.nodes.find(n => n.id === props.id)?.data?.flyapiTask
  localError.value = ''; checkingRecovery.value = true
  try {
    const provider = new FlyapiDepthProvider(new FlyapiProvider(account.apiKey, account.baseUrl))
    await provider.getTaskStatus(id, true)
    if (current() !== task) return
    canvas.updateNodeData(props.id, {flyapiTask:{...task,taskId:id}, taskId:id, error:undefined})
    await canvas.flushPersist(true)
    const saved = current()
    if (saved && saved.submissionId === task.submissionId && saved.providerId === task.providerId && saved.taskId === id) {
      recoveryId.value = ''; await run()
    }
  } catch (e) {
    if (current()) localError.value = e instanceof Error ? e.message : '无法核对原任务号，请重试'
  } finally { checkingRecovery.value = false }
}
function forget(){if(window.confirm('已在 FlyAPI 确认上次没有创建任务？清除记录后再转换会提交一笔新任务。'))canvas.updateNodeData(props.id,{flyapiTask:undefined,taskId:undefined,status:'idle',error:undefined})}
</script>

<style scoped>
.depth-node{position:relative;box-sizing:border-box;width:330px;padding:14px;border:1px solid #484951;border-radius:16px;background:#232329;color:#f3f2f5;font:13px/1.5 system-ui,sans-serif;box-shadow:0 6px 20px #0003}.depth-node.selected{border-color:#aeacbb}.depth-node header,.account,.source-row,.actions{display:flex;align-items:center;gap:8px}.depth-node header{margin-bottom:10px}.depth-node header>svg{width:20px;height:20px}.depth-node header small,.account,.quote{color:#c1bdcb}.depth-node header small{margin-left:auto}.preview{display:grid;place-items:center;aspect-ratio:16/9;background:#16161b;border-radius:9px;overflow:hidden}.preview video{width:100%;height:100%;object-fit:contain}.empty{display:grid;justify-items:center;gap:8px;color:#aaa6b3}.empty svg{width:32px;height:32px}.fields{display:grid;gap:8px;margin-top:10px}.depth-node p{margin:0;overflow-wrap:anywhere}.source-row>span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.account select{flex:1;min-width:0}.depth-node button,.depth-node select,.recover{box-sizing:border-box;border-radius:6px;border:1px solid #54525e;color:inherit;background:#34333b;font:inherit;padding:4px 8px}.depth-node button{cursor:pointer}.depth-node button:disabled{opacity:.52;cursor:default}.preview-tabs{display:flex;gap:4px;margin-bottom:6px}.preview-tabs [aria-pressed="true"]{color:#eeeaf9;background:#514b5f}.hint{color:#b4aebc}.depth-node .primary{background:#e7e5ee;color:#232229;font-weight:600;padding:7px}.error{color:#ffb8ac}.depth-node :deep(.vue-flow__handle){width:10px;height:10px;background:#b8b4c5;border:2px solid #26252a}
</style>
