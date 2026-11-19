import { createApp, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import DepthVideoNode from '../DepthVideoNode.vue'
import { useAIStore } from '@/stores/ai'
import { useNodeStore, type NodeData } from '@/stores/node'
vi.mock('@vue-flow/core', async original => ({ ...await original<typeof import('@vue-flow/core')>(), Handle:{render:()=>null} }))
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})

it('picks a local MP4, shows its account and estimate, cancels before staging, and keeps the last result available', async () => {
  const pinia=createPinia();setActivePinia(pinia);const ai=useAIStore(), canvas=useNodeStore();canvas.currentProjectId='qa'
  ai.addProvider({type:'video',kind:'flyapi',name:'未配置'}); ai.addProvider({type:'video',kind:'flyapi',name:'已配置账号',apiKey:'fixture-only'})
  canvas.addNode({id:'depth',type:'video-depth',position:{x:0,y:0},data:{label:'视频转深度',status:'idle'}})
  const save=vi.fn(async()=>'C:/cache/短片 #1.mp4'),upload=vi.fn(),request=vi.fn()
  vi.stubGlobal('electronAPI',{upload:{save},flyapi:{checkDepthSource:async()=>({ok:true}),upload,request}})
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
  vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{})
  const host=document.createElement('div');document.body.append(host)
  const app=createApp({render:()=>h(DepthVideoNode,{id:'depth',data:canvas.nodes[0].data as NodeData})}).use(pinia)
  try {
    app.mount(host);await nextTick();const submit=()=>host.querySelector<HTMLButtonElement>('button.primary')!
    expect(submit().disabled).toBe(true);expect(host.querySelector('select')!.selectedOptions[0].textContent).toBe('已配置账号')
    const input=host.querySelector<HTMLInputElement>('input[type=file]')!
    Object.defineProperty(input,'files',{value:[new File([new Uint8Array([1,2,3])],'短片 #1.mp4',{type:'video/mp4'})]});input.dispatchEvent(new Event('change'))
    await vi.waitFor(()=>expect(submit().disabled).toBe(false));expect(save).toHaveBeenCalledWith('AQID','短片 #1.mp4')
    const preview=host.querySelector('video')!;expect(preview.getAttribute('src')).toContain('%23');expect(preview.getAttribute('src')).not.toContain(' ')
    vi.spyOn(HTMLMediaElement.prototype, 'duration', 'get').mockReturnValue(12.5)
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(96)
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(54)
    preview.dispatchEvent(new Event('loadedmetadata'));await nextTick();expect(host.querySelector('.quote')?.textContent).toContain('12.5 秒 · 预计 ¥2.50')
    const original=document.createElement.bind(document);vi.spyOn(document,'createElement').mockImplementation((tag:string,options?:ElementCreationOptions)=>{const el=original(tag,options);if(tag==='video')queueMicrotask(()=>el.dispatchEvent(new Event('loadedmetadata')));return el})
    submit().click();await vi.waitFor(()=>expect(confirm).toHaveBeenCalledTimes(1));expect(confirm.mock.calls[0][0]).toContain('¥2.50');expect(upload).not.toHaveBeenCalled();expect(request).not.toHaveBeenCalled();expect(canvas.nodes[0].data?.status).toBe('idle')
    canvas.updateNodeData('depth',{outputVideo:'local-upload:///C:/cache/result.mp4',status:'completed'});await nextTick();expect(host.querySelector('video')!.getAttribute('aria-label')).toBe('深度视频结果')
    ;[...host.querySelectorAll('button')].find(b=>b.textContent==='源视频')!.click();await nextTick();expect(host.querySelector('video')!.getAttribute('aria-label')).toBe('源视频预览')
  } finally {app.unmount();host.remove()}
})

it('keeps an unverified recovery number editable and resumes the corrected task using only status requests', async () => {
  vi.useFakeTimers()
  const pinia = createPinia(); setActivePinia(pinia)
  const ai = useAIStore(), canvas = useNodeStore(); canvas.currentProjectId = 'depth-recovery'
  const providerId = ai.addProvider({type:'video', kind:'flyapi', name:'FlyAPI', apiKey:'fixture-only'})
  const model = 'h3-shipinzhuanshendu'
  canvas.addNode({id:'recover', type:'video-depth', position:{x:0,y:0}, data:{label:'视频转深度', status:'idle', flyapiTask:{providerId,submissionId:'original',params:{model,prompt:'深度',duration:4}}}})
  const request = vi.fn(async ({path}: {path:string; body?:unknown}) => {
    const id = path.split('/').pop()
    if (id === 'task_missing') return {ok:false, status:404, error:'任务不存在'}
    return {ok:true,data:{id,model:id === 'task_seed' ? 'seedance2.5' : model,status:'completed',metadata:{url:'https://example.test/result.mp4'}}}
  })
  const downloadDepth = vi.fn(async () => ({ok:true,data:{path:'C:/cache/recovered.mp4'}}))
  vi.stubGlobal('electronAPI',{store:{set:vi.fn(async()=>{})},flyapi:{request,downloadDepth}})
  const host = document.createElement('div'); document.body.append(host)
  const app = createApp({render:()=>h(DepthVideoNode,{id:'recover',data:canvas.nodes[0].data as NodeData})}).use(pinia)
  const input = () => host.querySelector<HTMLInputElement>('input.recover')
  const recover = async (id:string) => {
    input()!.value = id; input()!.dispatchEvent(new Event('input')); await nextTick()
    host.querySelector<HTMLButtonElement>('.actions button')!.click()
    await vi.advanceTimersByTimeAsync(11_000); await nextTick()
  }
  try {
    app.mount(host); await nextTick()
    for (const wrong of ['task_missing','task_seed']) {
      await recover(wrong)
      expect(input()?.value).toBe(wrong)
      expect(host.querySelector('[role=alert]')?.textContent).toBeTruthy()
      expect(canvas.nodes[0].data?.flyapiTask).toMatchObject({submissionId:'original'})
      expect(canvas.nodes[0].data?.flyapiTask?.taskId).toBeUndefined()
    }
    await recover('task_depth')
    expect(canvas.nodes[0].data).toMatchObject({status:'completed',outputVideo:'local-upload:///C:/cache/recovered.mp4'})
    expect(downloadDepth).toHaveBeenCalledTimes(1)
    expect(request.mock.calls.every(([args]) => args.path.startsWith('/v1/videos/task_') && !args.body)).toBe(true)
  } finally {canvas.cancelExecution('recover'); app.unmount(); host.remove(); vi.clearAllTimers(); vi.useRealTimers()}
})
