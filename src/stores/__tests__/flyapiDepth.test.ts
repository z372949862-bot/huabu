import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { useAIStore } from '../ai'
import { useNodeStore } from '../node'
import { useAssetStore } from '../asset'
const media = vi.hoisted(() => ({ duration: vi.fn() }))
vi.mock('@/services/providers/piapi', async original => ({ ...await original<typeof import('@/services/providers/piapi')>(), readMediaDuration: media.duration }))
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))
const model = 'h3-shipinzhuanshendu', url = 'https://cdn.example.test/source.mp4', result = 'https://cdn.example.test/depth.mp4'
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
function fixture(options: { seconds?: number; confirm?: boolean; local?: boolean; lost?: boolean } = {}) {
  vi.useFakeTimers(); setActivePinia(createPinia()); const ai = useAIStore(), store = useNodeStore()
  const providerId = ai.addProvider({ type: 'video', kind: 'flyapi', name: 'FlyAPI', apiKey: 'depth-fixture' })
  const source = options.local ? 'local-upload:///C:/test/source.mp4' : url
  store.addNode({ id: 's', type: 'asset-ref', position: { x: 0, y: 0 }, data: { status: 'idle', assetType: 'video', assetName: '源视频', assetUrl: source } })
  store.addNode({ id: 'd', type: 'video-depth', position: { x: 300, y: 0 }, data: { status: 'idle', label: '视频转深度', providerId } })
  store.addEdge({ id: 's-d', source: 's', target: 'd' })
  store.currentProjectId = 'depth-fixture-project'
  const records = new Map<string,string>()
  const storage = {get: async (key: string) => records.get(key), set: async (key: string,value: string) => {records.set(key,value)}, delete: async (key: string) => {records.delete(key)}}
  const events: string[]=[], bodies: unknown[]=[], paths: string[]=[]; let polls = 0
  const checkSource = vi.fn(async ({source: s}: any) => { expect(s).toBe(source); return {ok:true,data:{}} })
  media.duration.mockReset().mockResolvedValue(options.seconds ?? 12.5)
  const confirm = vi.spyOn(window,'confirm').mockImplementation(() => {events.push('confirm');return options.confirm!==false})
  vi.stubGlobal('electronAPI', { store: storage, upload:{read:async()=>({size:12,data:'AAAAFGZ0eXBpc29t'})}, flyapi:{ checkDepthSource:checkSource,
    upload:async (args: any)=>{ events.push('upload');expect(Object.keys(args)).toEqual(['dataUrl']);return {ok:true,data:{url}} },
    request: async ({apiKey,path,body}: any) => { expect(apiKey).toBe('depth-fixture'); paths.push(path)
      if(body){events.push('submit');bodies.push(body);return options.lost ? {ok:false,error:'请求超时'} : {ok:true,data:{id:'task_depth',model,status:'queued'}}}
      return {ok:true,data:{id:'task_depth',model,status:++polls===1?'unknown':'completed',metadata:{url:result}}} },
    downloadDepth: async (args: any) => {events.push('download');expect(args).toEqual({taskId:'task_depth',url:result});return {ok:true,data:{path:'C:/results/depth.mp4'}}},
    download:()=>{throw Error('wrong Seedance /content endpoint')},
  } })
  const data=()=>store.nodes.find(n=>n.id==='d')!.data
  const run=async()=>{const task=store.executeNode('d');await vi.advanceTimersByTimeAsync(45000);await task}
  return {store,providerId,events,bodies,paths,checkSource,confirm,data,run,storage}
}
it('quotes the actual source before uploading, posts exactly one MP4, polls through unknown, and saves the public depth result to the canvas',async()=>{
  const f=fixture({local:true});await f.run();expect(f.events).toEqual(['confirm','upload','submit','download']);expect(f.bodies).toEqual([{model,video:url}]);expect(f.confirm.mock.calls[0][0]).toMatch(/12\.5.*2\.50/s)
  expect(f.paths).toEqual(['/v1/videos','/v1/videos/task_depth','/v1/videos/task_depth']);expect(f.data()).toMatchObject({status:'completed',outputVideo:'local-upload:///C:/results/depth.mp4'});expect(useAssetStore().assets[0]).toMatchObject({model,duration:12.5,nodeType:'video-depth'})
})
it.each([30.001,0,Infinity])('blocks an invalid source duration (%s) before charging or uploading',async seconds=>{const f=fixture({seconds,local:true});await f.run();expect(f.events).toEqual([]);expect(f.data().status).toBe('error')})
it('cancels at the estimate without uploading, creating a task or freezing the node',async()=>{const f=fixture({confirm:false,local:true});await f.run();expect(f.events).toEqual(['confirm']);expect(f.data().status).toBe('idle');expect(f.data().flyapiTask).toBeUndefined()})
it('does not silently choose between a local input and an incoming video',async()=>{const f=fixture();f.store.updateNodeData('d',{depthSource:{name:'other.mp4',url}} as any);await f.run();expect(f.data().error).toMatch(/一个|一种|断开/);expect(f.events).toEqual([])})
it('preserves an ambiguous paid submission and resumes the original ID without uploading or submitting again',async()=>{const f=fixture({lost:true});await f.run();expect(f.data().flyapiTask).toMatchObject({providerId:f.providerId,params:{model}});await f.run();expect(f.bodies).toHaveLength(1);f.store.updateNodeData('d',{flyapiTask:{...f.data().flyapiTask,taskId:'task_depth'}});f.store.removeNode('s');await f.run();expect(f.data().status).toBe('completed');expect(f.events).toEqual(['confirm','submit','download'])})

it('refuses to start a paid conversion without a current project, and submits nothing if recording the attempt fails', async () => {
  const f = fixture({local:true}); f.store.currentProjectId=null; await f.run()
  expect(f.events).toEqual([]); expect(f.data().error).toContain('项目')
  f.store.currentProjectId='original'; vi.spyOn(f.storage,'set').mockRejectedValue(new Error('out of space')); await f.run()
  expect(f.bodies).toHaveLength(0); expect(f.data().flyapiTask).toBeUndefined(); expect(f.data().error).toMatch(/记录|存储/)
})
it('resumes a stopped conversion in its original project, even without the source, without a second charge',async()=>{
  const f=fixture(); const first=f.store.executeNode('d'); await vi.advanceTimersByTimeAsync(50)
  expect(f.data().flyapiTask?.taskId).toBe('task_depth'); await f.store.createProject('different'); await first
  expect(f.store.nodes).toHaveLength(0); await f.store.loadProject('depth-fixture-project'); expect(f.data().status).toBe('idle')
  f.store.removeNode('s'); await f.run(); expect(f.data().status).toBe('completed'); expect(f.bodies).toHaveLength(1); expect(f.confirm).toHaveBeenCalledTimes(1)
})
