<template>
  <component v-if="started && workspace" :is="workspace" v-show="state.authorized" />
  <main v-if="!state.authorized || !started" class="license-screen">
    <div class="license-ambient" aria-hidden="true"></div>
    <section class="license-card">
      <div class="license-mark">WH</div><p class="license-brand">芜湖AI <span v-if="state.trial">授权试用版</span><span v-else-if="state.preview">云端授权验证版</span></p>
      <h1>{{ state.updateRequired ? '请更新芜湖AI' : state.authorized ? '正在恢复你的工作区' : '激活你的创作空间' }}</h1>
      <template v-if="state.updateRequired">
        <p class="license-description">{{ state.message }}<br>当前版本 v{{ state.currentVersion }} · 最低要求 v{{ state.minVersion }}</p>
        <p class="update-countdown" role="status">软件将在 <strong>{{ secondsLeft }}</strong> 秒后退出</p>
        <button class="license-primary" @click="openUpdate">打开新版下载页面</button>
        <p class="license-description">下载页面会在浏览器中保留。安装新版后，原有项目和素材仍会保留。</p>
        <p v-if="error" class="license-message error">{{ error }}</p>
      </template>
      <template v-else>
      <p class="license-description">一份授权，绑定一台电脑。新用户与升级用户均需完成激活，已有项目和素材会保留。</p>
      <form @submit.prevent="activate">
        <label for="license-code">激活码</label><input id="license-code" v-model="code" autocomplete="off" spellcheck="false" placeholder="输入管理员发放的 WH- 激活码" :disabled="busy || state.authorized" />
        <button type="submit" class="license-primary" :disabled="busy || !code.trim() || state.authorized">{{ busy ? '正在验证…' : '激活并进入' }}</button>
      </form>
      <div class="license-message" :class="{ error: state.status === 'error' || state.status === 'blocked' }" role="status">{{ error || state.message }}</div>
      <div class="license-machine"><span>本机机器码</span><code>{{ state.machineCode || '正在读取…' }}</code><button :disabled="!state.machineCode" @click="copyMachine">复制</button></div>
      <div class="license-actions"><button :disabled="busy" @click="refresh">重新验证已有授权</button><span>授权问题请联系发码管理员</span></div>
      </template>
      <p v-if="state.trial" class="license-trial">本地试用：15 秒检查一次，离线宽限 60 秒。此窗口使用独立数据目录，不影响正式版。</p>
      <p v-else-if="state.preview" class="license-trial">云端授权策略：5 分钟检查一次，离线宽限 1 小时。此窗口使用独立数据目录，不影响正式版。</p>
    </section>
    <footer>芜湖AI · 让想象落在画布上</footer>
  </main>
</template>
<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useAssetStore } from '@/stores/asset'
import { useMaterialStore } from '@/stores/material'
import { useNodeStore } from '@/stores/node'
import { useEditorStore } from '@/stores/editor'
const state = ref<any>({ authorized:false,status:'loading',message:'正在检查本机授权' })
const workspace = shallowRef<any>(null), started=ref(false), busy=ref(false), code=ref(''), error=ref('')
const displayTime=ref(Date.now())
const secondsLeft=computed(()=>Math.max(0,Math.ceil(((state.value.quitAt||displayTime.value+10000)-displayTime.value)/1000)))
let unsubscribe:(()=>void)|undefined, starting:Promise<void>|null=null, poll:ReturnType<typeof setInterval>|undefined, tick:ReturnType<typeof setInterval>|undefined
async function openUpdate(){try{await window.electronAPI?.license?.openUpdate()}catch{error.value='无法打开浏览器，请访问 GitHub 的 z372949862-bot/huabu Releases 页面'}}
async function receive(next:any){
  state.value=next
  if(next.authorized && !started.value){
    if(!starting) starting=(async()=>{
      await Promise.all([useAIStore().init(),useAssetStore().init(),useMaterialStore().init(),useNodeStore().init(),useEditorStore().init()])
      workspace.value=(await import('@/App.vue')).default;started.value=true
    })().catch(()=>{error.value='工作区恢复失败，请重新验证；已有项目未删除'}).finally(()=>{starting=null})
    await starting
  }
}
async function activate(){if(busy.value)return;busy.value=true;error.value='';try{await receive(await window.electronAPI!.license!.activate(code.value));if(state.value.authorized)code.value=''}catch{error.value='激活失败，请检查授权服务'}finally{busy.value=false}}
async function refresh(){if(busy.value)return;busy.value=true;error.value='';try{await receive(await window.electronAPI!.license!.refresh())}catch{error.value='暂时无法验证授权，请稍后重试'}finally{busy.value=false}}
async function copyMachine(){try{await navigator.clipboard.writeText(state.value.machineCode);error.value='机器码已复制'}catch{error.value='复制失败，请手动选中机器码复制'}}
onMounted(async()=>{
  tick=setInterval(()=>{displayTime.value=Date.now()},250)
  const api=window.electronAPI?.license
  if(!api){if(import.meta.env.DEV && !window.electronAPI){await receive({authorized:true,status:'development',message:'浏览器开发预览'})}else state.value={authorized:false,status:'error',message:'缺少桌面授权模块，请使用完整客户端'};return}
  unsubscribe=api.onChanged(next=>receive(next))
  try{await receive(await api.status())}catch{state.value={authorized:false,status:'error',message:'授权模块启动失败，请重新打开软件'}}
  poll=setInterval(()=>api.status().then(receive).catch(()=>{}),5000)
})
onBeforeUnmount(()=>{unsubscribe?.();if(poll)clearInterval(poll);if(tick)clearInterval(tick)})
</script>
<style scoped>
.update-countdown{margin:28px 0;color:#cbb6e5;font-size:15px}.update-countdown strong{font-size:36px;font-weight:600;margin:0 6px;color:#ead8ff}
.license-screen{position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:auto;background:#0b0c11;color:#f0edf8;font-family:Inter,'Microsoft YaHei',sans-serif;padding:32px}.license-ambient{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 23% 25%,#64528230,transparent 42%),radial-gradient(ellipse at 83% 78%,#55447d22,transparent 40%)}.license-card{position:relative;width:540px;max-width:100%;padding:34px 38px;background:#19191fcc;border:1px solid #38313f;border-radius:22px;box-shadow:0 24px 100px #0006}.license-mark{display:grid;place-items:center;width:44px;height:44px;border:1px solid #75618b;border-radius:12px;color:#d0b6ff;font-size:18px;font-weight:800;letter-spacing:-2px;background:#30243c}.license-brand{margin:14px 0 25px;font-size:16px;font-weight:600}.license-brand span{margin-left:8px;padding:4px 8px;color:#b5a1d3;background:#302738;border-radius:5px;font-size:10px;font-weight:400}h1{font-size:28px;font-weight:600;margin:0 0 14px}.license-description{font-size:13px;color:#a5a0af;line-height:1.9;margin-bottom:26px}label{display:block;font-size:12px;color:#bfb5ce;margin-bottom:10px}input{width:100%;padding:15px;border-radius:9px;border:1px solid #484050;background:#111116;color:#eee8f6;font-size:13px;outline:none}input:focus{border-color:#b69ad8;box-shadow:0 0 0 3px #987cbb18}button{cursor:pointer;font-family:inherit}button:disabled{cursor:default;opacity:.5}.license-primary{width:100%;padding:14px;margin-top:14px;border:0;border-radius:9px;color:#251a30;background:linear-gradient(110deg,#d2b9ec,#aa9ae0);font-size:14px;font-weight:600}.license-message{font-size:12px;color:#b9a8d1;min-height:36px;padding:13px 0;line-height:1.6}.license-message.error{color:#e9a6ad}.license-machine{display:grid;grid-template-columns:1fr auto;gap:8px;border-top:1px solid #353039;padding-top:18px}.license-machine span{font-size:11px;color:#8f879a}.license-machine code{grid-column:1;font-size:10px;word-break:break-all;color:#aaa0b6;line-height:1.7}.license-machine button{grid-column:2;grid-row:1/3;align-self:center;border:1px solid #4b4055;border-radius:6px;padding:7px 10px;background:#29222f;color:#cfc2df;font-size:11px}.license-actions{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:22px}.license-actions button{border:0;background:none;padding:0;color:#c1a6e3;font-size:11px}.license-actions span{font-size:10px;color:#827a8a}.license-trial{font-size:10px;line-height:1.8;color:#9e91ae;border-top:1px solid #353039;margin:20px 0 0;padding-top:14px}footer{position:relative;margin-top:24px;font-size:11px;letter-spacing:2px;color:#746d80}
</style>
