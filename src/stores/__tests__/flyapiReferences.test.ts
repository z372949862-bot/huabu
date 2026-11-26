import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { useAIStore } from '../ai'
import { useNodeStore } from '../node'
import { FlyapiProvider } from '@/services/providers/flyapi'
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })
const host = 'https://flyapi.vip', reg='/kyyReactApiServer/asset/seedance2/assetUpload', detail='/kyyReactApiServer/asset/seedance2/assetDetail'
it('upgrades a legacy FlyAPI selection for new jobs and records the actual D model', async () => {
  const r = setup()
  r.store.updateNodeData('out', { model: 'seedance2.5' })
  await r.run()
  expect(r.ai.getProviderConfig(r.providerId)?.models.map(m => m.id)).toEqual(['seedance2.5-D'])
  expect(r.store.nodes[0].data.model).toBe('seedance2.5-D')
  expect(r.store.nodes[0].data.flyapiSubmission?.model).toBe('seedance2.5-D')
  expect(r.calls.filter(c => c.path === '/v1/videos')).toHaveLength(1)
  expect(r.calls.find(c => c.path === '/v1/videos')?.body.model).toBe('seedance2.5-D')
})
it('preserves ordinary-model pending tasks and never creates a replacement D job', async () => {
  const r = setup()
  const params = { model: 'seedance2.5', prompt: 'original', duration: 4 }
  const pending = { providerId: r.providerId, taskId: 'task_existing', params }
  r.store.updateNodeData('out', { model: 'seedance2.5', flyapiTask: pending })
  expect(new FlyapiProvider().resumeBody({ model: 'seedance2.5-D', flyapiTask: pending })).toEqual(params)
  await r.run()
  expect(r.calls.map(c => c.path)).toEqual(['/v1/videos/task_existing'])
  expect(r.store.nodes[0].data.model).toBe('seedance2.5')
  expect(r.uploads).toEqual([])
})
function setup(issue = '') {
  vi.useFakeTimers(); setActivePinia(createPinia()); const ai=useAIStore(), store=useNodeStore()
  const isMagiProvider = issue === 'magi' || issue === 'magiAuth' || issue === 'magiMissing'
  const providerId=ai.addProvider({ name:isMagiProvider ? 'FlyAPI Magi-2' : 'FlyAPI Seedance', kind:isMagiProvider ? 'flyapi-magi2' : 'flyapi', type:'video', apiKey:isMagiProvider ? 'magi-fixture' : 'fixture' }); const calls:{path:string;body?:any;apiKey?:string}[]=[], uploads:string[]=[], downloads:string[]=[]
  const sources = [ {id:'a',type:'image',name:'角色',url:'https://media.example/a.jpg'}, {id:'b',type:'image',name:'场景',url:'assetId://asset_b'}, {id:'v',type:'video',name:'运镜',url:'C:\\fixtures\\motion.mp4'}, ...(issue==='magi' ? [{id:'aud',type:'audio',name:'音效',url:'https://media.example/a.mp3'}] : []) ]; let checks=0
  vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('unexpected network')})); vi.stubGlobal('electronAPI',{upload:{read: async()=>({data:'AAAAFGZ0eXBpc29t',size:12})},flyapi:{
    upload:async(arg:any)=>{expect(Object.keys(arg)).toEqual(['dataUrl']);uploads.push(arg.dataUrl);return {ok:true,data:{url:'https://media.example/staged.mp4'}}},
    request:async({path,body,apiKey}:any)=>{calls.push({path,body,apiKey}); let value:any;
      if(path===reg){if(issue==='duration'&&body.assetType==='Video')return {ok:false,status:400,error:'FlyAPI (HTTP 400): video duration could not be determined'};value={assetId:body.assetType==='Video'?'asset_v':body.assetType==='Audio'?'asset_audio':'asset_a',status:'PROCESSING'};}
      else if(path===detail){const video=body.assetId==='asset_v',audio=body.assetId==='asset_audio';const wait=issue==='wait'&&video&&++checks===1;value={assetId:body.assetId,assetType:video?'Video':audio?'Audio':'Image',status:video&&issue==='reject'?'FAILED':wait?'PROCESSING':'ACTIVE',errorMessage:video&&issue==='reject'?'视频无法解码':null};}
      else if(path==='/v1/videos'&&body){
        if(issue==='lostResponse')return {ok:false,error:'响应中断'};
        value={id:'task_existing',status:'queued'};
      }
      else if(path==='/v1/videos/task_existing')value=issue==='taskError'?{status:'failed',error:{code:'bad_media',message:'平台无法读取视频'}}:{status:'completed'};
      else if(path==='/v1/models')value={data:issue==='magiAuth'?[null,{id:42},{id:'magi-2'}]:[{id:issue==='noAccess'?'other':'seedance2.5-D'}]};else throw Error('unexpected path: '+path);
      return {ok:true,data:value}},download:async({taskId}:any)=>{downloads.push(taskId);return {ok:true,data:{path:'C:/result.mp4'}}}}})
  store.addNode({id:'out',type:'ai-video',position:{x:0,y:0},data:{label:'video',status:'idle',providerId,model:isMagiProvider ? 'magi-2' : 'seedance2.5-D',prompt:'让 @[角色](a) 跟随 @[运镜](v)',duration:30,resolution:'720p',ratio:'16:9',_uploads:sources} as any})
  const run=async()=>{const p=store.executeNode('out');await vi.advanceTimersByTimeAsync(20000);await p};return {store, ai, providerId, calls, uploads, downloads, run}
}
it('registers the local motion video, waits for ACTIVE, then sends two pictures + one video and downloads the accepted task',async()=>{const r=setup('wait');await r.run();expect(r.store.nodes[0].data.error).toBeUndefined();expect(r.uploads).toEqual(['data:video/mp4;base64,AAAAFGZ0eXBpc29t']);
  expect(r.calls.filter(x=>x.path===detail&&x.body.assetId==='asset_v')).toHaveLength(2);expect(r.calls.filter(x=>x.path===reg).map(x=>x.body)).toEqual([{assetType:'Image',url:'https://media.example/a.jpg'},{assetType:'Video',url:'https://media.example/staged.mp4'}]);
  expect(r.calls.filter(x=>x.path==='/v1/videos').map(x=>x.body)).toEqual([expect.objectContaining({model:'seedance2.5-D',prompt:'让 @图片1 跟随 @视频1',duration:30,resolution:'720p',aspect_ratio:'16:9',reference_images:['assetId://asset_a','assetId://asset_b'],reference_videos:['assetId://asset_v']})]);expect(r.downloads).toEqual(['task_existing']);expect(r.store.nodes[0].data.flyapiSubmission).toMatchObject({images:2,videos:1,taskId:'task_existing'});expect(r.store.nodes[0].data.flyapiTask).toBeUndefined()})
it('rejects a failed reference before sending any video generation request',async()=>{const r=setup('reject');await r.run();expect(r.store.nodes[0].data.error).toContain('视频无法解码');expect(r.calls.some(x=>x.path==='/v1/videos')).toBe(false)})
it('explains upstream duration rejection and never submits or retries generation',async()=>{const r=setup('duration');await r.run();expect(r.store.nodes[0].data.error).toContain('FlyAPI 无法从参考视频链接读取时长');expect(r.store.nodes[0].data.error).toContain('本次未提交视频生成');expect(r.calls.some(x=>x.path==='/v1/videos')).toBe(false);expect(r.calls.filter(x=>x.path===reg&&x.body.assetType==='Video')).toHaveLength(1)})
it('resumes only the original task even if the prompt and attachments have since changed',async()=>{const r=setup('taskError');r.store.updateNodeData('out',{taskId:'task_existing',flyapiTask:{taskId:'task_existing',providerId:r.providerId},prompt:'',_uploads:[]} as any);await r.run();expect(r.calls.map(c=>c.path)).toEqual(['/v1/videos/task_existing']);expect(r.uploads).toEqual([]);expect(r.store.nodes[0].data.error).toMatch(/bad_media.*平台无法读取视频|平台无法读取视频.*bad_media/);})
it('never submits twice after losing the creation response', async () => {
  const r = setup('lostResponse'); await r.run(); await r.run()
  expect(r.calls.filter(c => c.path === '/v1/videos')).toHaveLength(1)
  expect(r.uploads).toHaveLength(1)
  expect(r.store.nodes[0].data.flyapiTask).toMatchObject({ providerId: r.providerId, counts: { images: 2, videos: 1, audios: 0 } })
  expect(r.store.nodes[0].data.error).toContain('核对')
})
it('reports absent model permission without creating a test job', async () => {
  const r = setup('noAccess'); expect(await r.ai.testProviderConnection(r.providerId)).toMatchObject({ ok: false, error: expect.stringContaining('seedance2.5') })
  expect(r.calls.map(c=>c.path)).toEqual(['/v1/models'])
})
it('accepts a Magi-2-only model listing and ignores malformed model entries', async () => {
  const r = setup('magiAuth')
  expect(await r.ai.testProviderConnection(r.providerId)).toEqual({ ok: true })
  expect(r.calls.map(c=>c.path)).toEqual(['/v1/models'])
})
it('does not accept a Seedance-only key for the separate Magi-2 account', async () => {
  const r = setup('magiMissing')
  expect(await r.ai.testProviderConnection(r.providerId)).toMatchObject({ ok: false, error: expect.stringContaining('magi-2') })
  expect(r.calls.map(c=>c.path)).toEqual(['/v1/models'])
})
it('builds Magi-2 video requests with the selected size, duration and all three reference types', async()=>{
  const r=setup('magi');r.store.updateNodeData('out',{model:'magi-2',duration:22,resolution:'1080p',ratio:'9:16'} as any)
  expect(r.ai.getProviderConfig(r.providerId)).toMatchObject({kind:'flyapi-magi2',apiKey:'magi-fixture',models:[{id:'magi-2'}]})
  await r.run()
  expect(r.store.nodes[0].data.error).toBeUndefined()
  expect(r.calls.find(c=>c.path==='/v1/videos')?.apiKey).toBe('magi-fixture')
  expect(r.calls.find(c=>c.path==='/v1/videos')?.body).toEqual(expect.objectContaining({model:'magi-2',duration:22,resolution:'1080p',aspect_ratio:'9:16',reference_images:['asset://asset_a','asset://asset_b'],reference_videos:['asset://asset_v'],reference_audios:['asset://asset_audio']}))
})
it('looks up model access without generating',async()=>{const r=setup();expect(await r.ai.testProviderConnection(r.providerId)).toEqual({ok:true});expect(r.calls.map(c=>c.path)).toEqual(['/v1/models']);expect(r.ai.getProviderConfig(r.providerId)?.baseUrl).toBe(host)})

it('stores a late task receipt on the original project and resumes it after reloading the canvas', async () => {
  const r = setup(), disk = new Map<string, string>(), api = window.electronAPI!
  api.store = { get: async key => disk.get(key) ?? null, set: async (key, value) => { disk.set(key, value) }, delete: async key => { disk.delete(key) } }
  const original = r.store.nodes[0]
  await r.store.createProject('one'); r.store.addNode(original)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const bridge = api.flyapi!, request = bridge.request
  bridge.request = async args => {
    const response = await request(args)
    if (args.path === '/v1/videos') await gate
    return response
  }
  const first = r.store.executeNode('out'); await vi.advanceTimersByTimeAsync(0)
  expect(r.calls.filter(c => c.path === '/v1/videos')).toHaveLength(1)
  await r.store.loadProject('two'); release(); await first
  expect(r.store.nodes).toHaveLength(0)
  expect(JSON.parse(disk.get('nodeCanvas:one')!).nodes[0].data.flyapiTask).toMatchObject({ taskId: 'task_existing', params: { duration: 30 } })
  await r.store.loadProject('one')
  expect(r.store.nodes[0].data.taskId).toBe('task_existing')
  r.store.updateNodeData('out', { prompt: '', _uploads: [] })
  const before = r.calls.length; await r.run()
  expect(r.calls.slice(before).map(c => c.path)).toEqual(['/v1/videos/task_existing'])
  expect(r.uploads).toHaveLength(1); expect(r.downloads).toEqual(['task_existing'])
  expect(r.store.nodes[0].data.flyapiTask).toBeUndefined()
})
