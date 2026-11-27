// @vitest-environment node
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
const require = createRequire(import.meta.url)
const register = require('../../../../electron/flyapi.cjs')

it('reads real MP4 bytes from disk or a signed source and saves metadata.url without sending a key to a CDN', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'flyapi-depth-'))
  const apiKey = 'fixture-only', model = 'h3-shipinzhuanshendu', taskId = 'task_fixture'
  const source = 'https://cdn.example/source?sig=a%2Bb', result = 'https://out.example/result?sig=abc', origin = 'https://flyapi.vip'
  const handlers = new Map<string, Function>()
  const run = (key: string, args: object) => handlers.get('flyapi:'+key)!(null,args)
  try {
    const mp4 = join(dir, '1.5 秒 #01.mp4'), bad = join(dir, 'fake.mp4')
    execFileSync(require('ffmpeg-static'), ['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=gray:s=32x32:r=10','-t','1.5','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-movflags','+faststart',mp4],{windowsHide:true,timeout:15000})
    await writeFile(bad, '<html>not a video</html>')
    const bytes = new Uint8Array(await readFile(mp4))
    const fetch = vi.fn(async (url: string, opts: RequestInit) => {
      const headers = new Headers(opts.headers)
      if (url.startsWith(origin+'/')) {
        expect(headers.get('authorization')).toBe('Bearer '+apiKey)
        if (url.endsWith(taskId)) return Response.json({ id:taskId, status:'completed', metadata:{url:result} })
        expect(opts.body).toBe(JSON.stringify({model,video:source})); return Response.json({id:taskId})
      }
      expect(headers.has('authorization')).toBe(false); expect(opts.credentials).toBe('omit'); expect(opts.redirect).toBe('manual')
      if (url === source) { expect(headers.get('range')).toBe('bytes=0-63'); return new Response(bytes.slice(0,64),{status:206}) }
      if (url.endsWith('/private-hop')) return new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}})
      if (url === result) return new Response(null,{status:307,headers:{Location:'/signed.mp4?one=two'}})
      if (url === 'https://out.example/signed.mp4?one=two') return new Response(bytes,{headers:{'Content-Type':'video/mp4'}})
      throw Error('unexpected network request: '+url)
    })
    register({ipcMain:{handle:(k:string,cb:Function)=>handlers.set(k,cb)},fetch,app:{getPath:()=>dir}})
    const local = (p:string) => 'local-upload:///'+p.replaceAll('\\','/')
    expect((await run('depth-source',{source:local(mp4)})).ok).toBe(true)
    expect((await run('depth-source',{source:local(bad)})).error).toContain('MP4')
    expect((await run('depth-source',{source:'data:video/mp4;base64,'+Buffer.from(bytes).toString('base64')})).ok).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
    expect((await run('depth-source',{source})).ok).toBe(true)
    expect((await run('depth-source',{source:'https://cdn.example/private-hop'})).ok).toBe(false)
    expect((await run('request',{apiKey,path:'/v1/videos',body:{model,video:source,prompt:'not supported'}})).ok).toBe(false)
    expect((await run('request',{apiKey,path:'/v1/videos',body:{model,video:source}})).data.id).toBe(taskId)
    const task = await run('request',{apiKey,path:'/v1/videos/'+taskId})
    const saved = await run('depth-result',{url:task.data.metadata.url,taskId})
    expect(saved.ok).toBe(true); expect(await readFile(saved.data.path)).toEqual(Buffer.from(bytes))
    expect(fetch.mock.calls.map(([url])=>url)).toEqual([source,'https://cdn.example/private-hop',origin+'/v1/videos',origin+'/v1/videos/'+taskId,result,'https://out.example/signed.mp4?one=two'])
  } finally { await rm(dir,{recursive:true,force:true}) }
},20000)
