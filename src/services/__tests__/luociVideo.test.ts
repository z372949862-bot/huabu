import { afterEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAIStore } from '../../stores/ai'
import { LUOCI_BASE, LUOCI_MODEL, LuociVideoProvider, luociBody } from '../providers/luociVideo'
import { runUnmauNode } from '../providers/unmau'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
const data = { model: LUOCI_MODEL, prompt: 'test', providerId: 'luoci-fixture', duration: 30 }
const references = { images: ['https://example.org/a.png','https://example.org/b.png'], videos: ['https://example.org/c.mp4'], audios: [] }

it('keeps the two images and video together and validates frame mode', () => {
  expect(luociBody(data, references)).toEqual({ modelId: LUOCI_MODEL, prompt: 'test', duration: 30, generateAudio: true,
    aspectRatio: 'adaptive', imageSize: '480p', videoInputMode: 'reference-media', referenceUrls: references.images, referenceVideoUrls: references.videos })
  expect(() => luociBody({ ...data, luociFrames: 2 }, references)).toThrow('首尾帧')
  expect(luociBody({ ...data, luociFrames: 2, duration: -1 }, { ...references, videos: [] })).toMatchObject({ videoInputMode: 'keyframes', duration: -1 })
})
it('restores an uncertain submission and downloads the settled result without a second quote or a new key', async () => {
  const charges: any[] = []
  const request = vi.fn(async args => {
    if (args.route.endsWith('/quote')) return { ok: true, data: { estimatedPoints: 4.24 } }
    if (args.route.endsWith('/generations')) {
      charges.push(args)
      if (charges.length === 1) return {ok:false,error:'timeout'}
      return { ok:true,data:{taskId:'t1'} }
    }
    return {ok:true,data:{task:{status:'partial',settled:true,chargedPoints:4,videos:[{url:'/api/v1/tasks/t1/videos/0'}]}}}
  })
  vi.stubGlobal('electronAPI', { luociVideo: { request, download: async () => ({ok:true,data:{path:'C:/mock/result.mp4'}}) } })
  vi.stubGlobal('confirm',vi.fn().mockReturnValue(true))
  const state: any = { ...data }
  const node = {id:'n',data:state}
  const run = () => runUnmauNode({id:'n',data:{...state},nodes:[node],edges:[],provider:new LuociVideoProvider('fixture', LUOCI_BASE),
    isCurrent:()=>true, wait:async()=>{}, update:(patch:any)=>Object.assign(state,patch), persist:async()=>{},
    complete:vi.fn(), fail:(error:string)=>Object.assign(state,{error,status:'error'})} as any)
  await run()
  expect(state.error).toContain('timeout')
  expect(state.luociTask.body.requestKey).toBeTruthy()
  state.prompt = 'changed on canvas'
  await run()
  expect(charges).toHaveLength(2)
  expect(charges[0]).toEqual(charges[1])
  expect(window.confirm).toHaveBeenCalledTimes(1)
  expect(state).toMatchObject({status:'completed',luociEstimate:4.24,luociCharge:4,outputVideo:'local-upload:///C:/mock/result.mp4'})
  expect(state.luociTask).toBeUndefined()
})
it('cancels at the quote and never submits a paid request', async () => {
  const request = vi.fn(async () => ({ok:true,data:{estimatedPoints:0.7068}}))
  vi.stubGlobal('electronAPI',{luociVideo:{request}})
  vi.stubGlobal('confirm',()=>false)
  const state:any={...data}
  await runUnmauNode({id:'n',data:state,nodes:[{id:'n',data:state}],edges:[],provider:new LuociVideoProvider('fixture',LUOCI_BASE),
    isCurrent:()=>true,update:(p:any)=>Object.assign(state,p),fail:vi.fn(),persist:async()=>{}} as any)
  expect(request).toHaveBeenCalledTimes(1)
  expect(state.status).toBe('idle')
})
it('adds a separate video provider, reuses an official image key and retains the video default', async () => {
  const disk=new Map([['aiProviders',JSON.stringify({migrationVersion:18,defaultProviderId:'video',providers:[
    {id:'video',type:'video',kind:'aimi',name:'AIMI',models:[],apiKey:'',baseUrl:'https://aimiapi.com'},
    {id:'image',type:'image',kind:'luoci',models:[],baseUrl:LUOCI_BASE,apiKey:'fixture'}
  ]})]])
  vi.stubGlobal('electronAPI',{store:{get:async(key:string)=>disk.get(key),set:async(k:string,v:string)=>disk.set(k,v)}})
  setActivePinia(createPinia())
  const store=useAIStore();await store.init()
  const cards=store.videoProviders.filter(p=>p.kind==='luoci')
  expect(cards).toHaveLength(1)
  expect(cards[0].models.map(m=>m.id)).toEqual([LUOCI_MODEL])
  expect(store.getProvider(cards[0].id)).toBeInstanceOf(LuociVideoProvider)
  expect(cards[0].apiKey).toBe('fixture')
  expect(store.defaultProviderId).toBe('video')
})

it('refreshes a saved Luoci video capability catalog so the duration selector stays adjustable', async () => {
  const legacy = { id: 'luoci-video', type: 'video', kind: 'luoci', name: '我的洛辞视频', baseUrl: LUOCI_BASE,
    apiKey: 'fixture', models: [{ id: LUOCI_MODEL, name: 'Seedance 2.5', capabilities: { durationOptions: [28] } }] }
  const custom = { id: 'custom-old', name: '旧自定义模型', capabilities: { durationRange: { min: 2, max: 3 } } }
  legacy.models.push(custom as any)
  const disk = new Map([['aiProviders', JSON.stringify({ providers: [legacy], migrationVersion: 19, defaultProviderId: legacy.id })]])
  vi.stubGlobal('electronAPI', { store: { get: async (key: string) => disk.get(key), set: async (key: string, value: string) => { disk.set(key, value) } } })
  setActivePinia(createPinia())
  const store = useAIStore(); await store.init()
  const provider = store.getProviderConfig(legacy.id)!
  expect(provider).toMatchObject({ name: legacy.name, baseUrl: LUOCI_BASE, apiKey: 'fixture' })
  const model = provider.models.find(item => item.id === LUOCI_MODEL)!
  expect(model.capabilities.durationRange).toBeUndefined()
  expect(model.capabilities.durationOptions).toEqual([-1, ...Array.from({ length: 27 }, (_, i) => i + 4)])
  expect(model.capabilities.durationOptions!.length).toBeGreaterThan(1)
  expect(provider.models.find(item => item.id === custom.id)).toEqual(custom)
})
