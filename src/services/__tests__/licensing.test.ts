// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
const require=createRequire(import.meta.url)
const {createService}=require('../../../license-server/server.cjs')
const {createLicenseClient}=require('../../../electron/license-client.cjs')
const {canonicalProof,verifyLease,sha256}=require('../../../electron/license-core.cjs')
const roots:string[]=[], services:any[]=[], clients:any[]=[]
afterEach(async()=>{for(const client of clients.splice(0))client.dispose();for(const service of services.splice(0))await service.close();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function temp(){const dir=mkdtempSync(path.join(tmpdir(),'wuhu-license-test-'));roots.push(dir);return dir}
async function setup(){
  let now=Date.now(); const dir=temp(), service=createService({directory:dir,port:0,clock:()=>now,leaseMs:60000});services.push(service);const base=await service.listen()
  const login=await fetch(base+'/admin/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({password:readFileSync(path.join(dir,'admin-login.txt'),'utf8')})})
  let cookie=login.headers.get('set-cookie')!.split(';')[0],{csrf}=await login.json()
  const relogin=async()=>{const response=await fetch(base+'/admin/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({password:readFileSync(path.join(dir,'admin-login.txt'),'utf8')})});cookie=response.headers.get('set-cookie')!.split(';')[0];csrf=(await response.json()).csrf}
  const admin=async(route:string,body?:any)=>{const res=await fetch(base+'/admin/api/'+route,{method:body?'POST':'GET',headers:{Origin:base,Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,...await res.json()}}
  const device=(label:string)=>{const keys=crypto.generateKeyPairSync('ed25519');return {fingerprint:sha256(label),publicKey:keys.publicKey.export({type:'spki',format:'pem'}),privateKey:keys.privateKey}}
  const proof=async(who:any,credential:string,action='activate')=>{const challenge=await fetch(base+'/v1/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fingerprint:who.fingerprint,devicePublicKey:who.publicKey})}).then(r=>r.json());const body={action,nonce:challenge.nonce,fingerprint:who.fingerprint,devicePublicKey:who.publicKey,credential,appVersion:'trial'};return {...body,signature:crypto.sign(null,Buffer.from(canonicalProof(body)),who.privateKey).toString('base64url')}}
  const submit=async(body:any)=>{const res=await fetch(base+'/v1/'+body.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:res.status,...await res.json()}}
  return {service,dir,base,admin,relogin,device,proof,submit,clock:()=>now,advance:(ms:number)=>{now+=ms}}
}
function desktop(env:any,label='machine-a'){
  const userData=temp(), localSecret=crypto.randomBytes(32)
  const safeStorage={isEncryptionAvailable:()=>true,encryptString:(text:string)=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',localSecret,iv);return Buffer.concat([iv,cipher.update(text),cipher.final(),cipher.getAuthTag()])},decryptString:(bytes:Buffer)=>{const decipher=crypto.createDecipheriv('aes-256-gcm',localSecret,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString()}}
  const config={required:true,trial:true,serverUrl:env.base,publicKey:env.service.publicKey,heartbeatSeconds:900}
  const create=(net:any={fetch})=>{const c=createLicenseClient({app:{getPath:()=>userData,getVersion:()=> '0.3.24-trial'},safeStorage,net,config,fingerprint:()=>sha256(label),clock:env.clock});clients.push(c);return c}
  return {create,userData,safeStorage,config}
}
describe('one license one device service',()=>{
  it('activates one machine and rejects reuse, replay and a copied fingerprint with another key',async()=>{
    const e=await setup(),license=await e.admin('licenses',{days:7,label:'客户甲'}),a=e.device('A'),b=e.device('B')
    const body=await e.proof(a,license.code),result=await e.submit(body)
    expect(result.ok).toBe(true);expect(verifyLease(result.token,e.service.publicKey,a).licenseId).toBe(license.id)
    expect((await e.submit(body)).code).toBe('DEVICE_PROOF_INVALID')
    expect((await e.submit(await e.proof(b,license.code))).code).toBe('DEVICE_MISMATCH')
    b.fingerprint=a.fingerprint
    expect((await e.submit(await e.proof(b,license.code))).code).toBe('DEVICE_MISMATCH')
    const db=readFileSync(path.join(e.dir,'licenses.json'),'utf8');expect(db).not.toContain(license.code);expect(db).not.toContain('PRIVATE KEY')
  })
  it('resolves concurrent activation attempts with only one binding',async()=>{
    const e=await setup(),license=await e.admin('licenses',{days:1})
    const bodies=await Promise.all([e.proof(e.device('A'),license.code),e.proof(e.device('B'),license.code)])
    const results=await Promise.all(bodies.map(e.submit));expect(results.filter(r=>r.ok)).toHaveLength(1);expect(results.filter(r=>r.code==='DEVICE_MISMATCH')).toHaveLength(1)
  })
  it('supports disable restore expiry extension and owner-controlled machine transfer',async()=>{
    const e=await setup(),license=await e.admin('licenses',{days:1}),a=e.device('A'),b=e.device('B')
    await e.submit(await e.proof(a,license.code));await e.admin('action',{id:license.id,action:'disable'})
    expect((await e.submit(await e.proof(a,license.id,'renew'))).code).toBe('LICENSE_DISABLED')
    await e.admin('action',{id:license.id,action:'enable'});expect((await e.submit(await e.proof(a,license.id,'renew'))).ok).toBe(true)
    e.advance(86400001);expect((await e.submit(await e.proof(a,license.id,'renew'))).code).toBe('LICENSE_EXPIRED')
    await e.relogin()
    await e.admin('action',{id:license.id,action:'extend',days:30});await e.admin('action',{id:license.id,action:'unbind'})
    expect((await e.submit(await e.proof(a,license.id,'renew'))).code).toBe('DEVICE_UNBOUND')
    expect((await e.submit(await e.proof(b,license.code))).ok).toBe(true)
    expect((await e.submit(await e.proof(a,license.id,'renew'))).code).toBe('DEVICE_MISMATCH')
  })
  it('rejects unauthenticated admin calls, cross-origin writes and proof tampering',async()=>{
    const e=await setup()
    expect((await fetch(e.base+'/admin/api/licenses')).status).toBe(401)
    expect((await fetch(e.base+'/admin/api/login',{method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json'},body:'{}'})).status).toBe(403)
    const license=await e.admin('licenses',{days:1}),body=await e.proof(e.device('A'),license.code)
    body.credential='WH-forged';expect((await e.submit(body)).code).toBe('DEVICE_PROOF_INVALID')
    const view=await e.admin('licenses');expect(JSON.stringify(view)).not.toContain('codeHash');expect(JSON.stringify(view)).not.toContain(license.code)
  })
})
describe('desktop activation gate and project preservation',()=>{
  it('keeps existing installations locked until activation and persists only encrypted device credentials',async()=>{
    const e=await setup(),d=desktop(e),client=d.create()
    const project=path.join(d.userData,'ai-video-canvas-config.json'),legacy='{"nodeCanvas:default":"existing-project-sentinel"}'
    writeFileSync(project,legacy)
    expect((await client.init()).authorized).toBe(false)
    const handlers=new Map(),calls:any[]=[];client.guardedIpc({handle:(name:string,fn:any)=>handlers.set(name,fn)}).handle('piapi:request',(_e:any,p:any)=>calls.push(p))
    await expect(handlers.get('piapi:request')(null,{path:'/api/v1/task',body:{}})).rejects.toThrow('LICENSE_REQUIRED')
    const license=await e.admin('licenses',{days:7});expect((await client.activate(license.code)).authorized).toBe(true)
    await handlers.get('piapi:request')(null,{path:'/api/v1/task',body:{}});expect(calls).toHaveLength(1)
    const stored=readFileSync(path.join(d.userData,'device-license.dat'));expect(stored.toString()).not.toContain(license.code);expect(stored.toString()).not.toContain('PRIVATE KEY')
    client.dispose();const reopened=d.create();expect((await reopened.init()).authorized).toBe(true)
    expect(readFileSync(project,'utf8')).toBe(legacy)
  })
  it('revokes new submissions but retains already admitted task recovery without deleting data',async()=>{
    const e=await setup(),d=desktop(e),client=d.create();await client.init();const license=await e.admin('licenses',{days:7});await client.activate(license.code)
    const handlers=new Map(),ipc=client.guardedIpc({handle:(name:string,fn:any)=>handlers.set(name,fn)})
    ipc.handle('piapi:request',()=> 'query');ipc.handle('store:set',()=> 'saved');ipc.handle('upload:delete',()=> 'deleted')
    await e.admin('action',{id:license.id,action:'disable'});expect((await client.refresh()).authorized).toBe(false)
    await expect(handlers.get('piapi:request')(null,{path:'/api/v1/task',body:{}})).rejects.toThrow('LICENSE_REQUIRED')
    expect(await handlers.get('piapi:request')(null,{path:'/api/v1/task/task_old'})).toBe('query')
    expect(await handlers.get('store:set')(null,'nodeCanvas:old','existing')).toBe('saved')
    await expect(handlers.get('upload:delete')(null,'a.png')).rejects.toThrow('LICENSE_REQUIRED')
    client.dispose();const reopened=d.create({fetch:async()=>{throw new Error('offline')}});expect((await reopened.init()).authorized).toBe(false)
    await e.admin('action',{id:license.id,action:'enable'});expect((await client.refresh()).authorized).toBe(true)
  })
  it('expires offline leases and rejects clock rollback and forged tokens',async()=>{
    const e=await setup(),d=desktop(e);let offline=false
    const client=d.create({fetch:(...args:any[])=>{if(offline)throw new Error('offline');return fetch(args[0],args[1])}});await client.init();const license=await e.admin('licenses',{days:7});await client.activate(license.code)
    offline=true;expect((await client.refresh()).status).toBe('offline');e.advance(60001);expect((await client.refresh()).authorized).toBe(false)
    offline=false;await client.refresh();e.advance(-600000);expect(client.getState().authorized).toBe(false)
    const a=e.device('A');expect(()=>verifyLease('forged.signature',e.service.publicKey,a)).toThrow()
  })
  it('fails closed when production service is unconfigured',async()=>{
    const c=createLicenseClient({app:{getPath:()=>temp()},config:{required:true,trial:false,serverUrl:'',publicKey:''},safeStorage:{isEncryptionAvailable:()=>true},net:{fetch}});clients.push(c)
    expect(await c.init()).toMatchObject({authorized:false,status:'configuration'})
    expect(()=>require('../../../scripts/check-license-release.cjs')({required:true,trial:false,serverUrl:'',publicKey:''})).toThrow('禁止正式打包')
  })
})
