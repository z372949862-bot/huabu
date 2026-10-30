// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { build } from 'esbuild'
import path from 'node:path'
import crypto from 'node:crypto'
const require=createRequire(import.meta.url)
const {canonicalProof,verifyLease,sha256}=require('../../../electron/license-core.cjs')
const {requiresUpdate,verifyPolicy}=require('../../../electron/update-policy.cjs')
const {createLicenseClient}=require('../../../electron/license-client.cjs')
const clients:any[]=[],directories:string[]=[]
const root=path.resolve(import.meta.dirname,'../../..'),databases:any[]=[]
let worker:any
beforeAll(async()=>{
 const bundle=await build({entryPoints:[path.join(root,'license-cloud/worker.mjs')],bundle:true,write:false,platform:'node',format:'cjs',loader:{'.html':'text','.css':'text'},plugins:[{name:'admin-text',setup(b){b.onLoad({filter:/public[/\\]admin\.js$/},a=>({contents:readFileSync(a.path,'utf8'),loader:'text'}))}}]})
 const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(require,mod,mod.exports);worker=(mod.exports as any).default
})
afterEach(()=>{for(const client of clients.splice(0))client.dispose();for(const dir of directories.splice(0))rmSync(dir,{recursive:true,force:true});for(const db of databases.splice(0))db.close();vi.useRealTimers()})
function database(){
 const raw=new DatabaseSync(':memory:');databases.push(raw);for(const migration of ['0001_license.sql','0002_update_policy.sql'])raw.exec(readFileSync(path.join(root,'license-cloud/migrations',migration),'utf8'))
 const api:any={prepare(sql:string){let values:any[]=[];const q=()=>raw.prepare(sql);const stmt:any={bind(...args:any[]){values=args;return stmt},async first(){return q().all(...values)[0]||null},async all(){return {results:q().all(...values),success:true}},async run(){return {meta:q().run(...values),success:true}},exec(){return {results:q().all(...values),success:true}}};return stmt},withSession(){return api},async batch(statements:any[]){raw.exec('BEGIN');try{const result=statements.map(s=>s.exec());raw.exec('COMMIT');return result}catch(e){raw.exec('ROLLBACK');throw e}}};return {raw,api}
}
async function setup(){
 const {raw,api}=database(),keys=crypto.generateKeyPairSync('ed25519'),origin='https://license.example.com',password=crypto.randomBytes(32).toString('hex')
 const env:any={DB:api,PUBLIC_ORIGIN:origin,SIGNING_PRIVATE_KEY:keys.privateKey.export({type:'pkcs8',format:'pem'}),PUBLIC_KEY:keys.publicKey.export({type:'spki',format:'pem'}),ADMIN_PASSWORD_HASH:sha256(password),LEASE_SECONDS:'3600',HEARTBEAT_SECONDS:'300'}
 const call=async(route:string,body?:any,extra:any={})=>{const response=await worker.fetch(new Request(origin+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','CF-Connecting-IP':'1.2.3.4',...extra},body:body===undefined?undefined:JSON.stringify(body)}),env);return {status:response.status,headers:response.headers,...await response.json()}}
 const login=await call('/admin/api/login',{password},{Origin:origin}),cookie=login.headers.get('set-cookie').split(';')[0]
 const admin=(route:string,body?:any)=>call('/admin/api/'+route,body,{Origin:origin,Cookie:cookie,'X-CSRF-Token':login.csrf})
 const device=(label:string)=>{const key=crypto.generateKeyPairSync('ed25519');return {fingerprint:sha256(label),publicKey:key.publicKey.export({type:'spki',format:'pem'}),privateKey:key.privateKey}}
 const proof=async(who:any,credential:string,action='activate',appVersion='0.3.24')=>{const challenge=await call('/v1/challenge',{fingerprint:who.fingerprint,devicePublicKey:who.publicKey});const body={action,nonce:challenge.nonce,fingerprint:who.fingerprint,devicePublicKey:who.publicKey,credential,appVersion};return {...body,signature:crypto.sign(null,Buffer.from(canonicalProof(body)),who.privateKey).toString('base64url')}}
 const submit=(body:any)=>call('/v1/'+body.action,body)
 return {raw,env,origin,call,admin,device,proof,submit,cookie,csrf:login.csrf}
}
describe('cloud authorization with persistent transactional storage',()=>{
 it('serves signed desktop-compatible leases and atomically binds one machine',async()=>{
  const e=await setup(),l=await e.admin('licenses',{label:'客户甲',days:7}),a=e.device('A'),b=e.device('B')
  const bodies=await Promise.all([e.proof(a,l.code),e.proof(b,l.code)]),results=await Promise.all(bodies.map(e.submit))
  expect(results.filter(r=>r.ok)).toHaveLength(1);expect(results.filter(r=>r.code==='DEVICE_MISMATCH')).toHaveLength(1)
  const index=results.findIndex(r=>r.ok),winner=index===0?a:b,lease=verifyLease(results[index].token,e.env.PUBLIC_KEY,winner)
  expect(lease.exp-lease.iat).toBe(3600000);expect(lease.licenseId).toBe(l.id)
  expect((await e.submit(bodies[index])).code).toBe('DEVICE_PROOF_INVALID')
  expect(JSON.stringify(e.raw.prepare('SELECT * FROM licenses').all())).not.toContain(l.code)
  expect((await e.admin('licenses')).audit.filter((a:any)=>a.action==='activate')).toHaveLength(1)
 })
 it('enforces disable restore expiry renewal and transfer without retaining revoked access',async()=>{
  const e=await setup(),l=await e.admin('licenses',{days:1}),a=e.device('A'),b=e.device('B')
  expect((await e.submit(await e.proof(a,l.code))).ok).toBe(true)
  await e.admin('action',{id:l.id,action:'disable'});expect((await e.submit(await e.proof(a,l.id,'renew'))).code).toBe('LICENSE_DISABLED')
  await e.admin('action',{id:l.id,action:'enable'});expect((await e.submit(await e.proof(a,l.id,'renew'))).ok).toBe(true)
  e.raw.prepare('UPDATE licenses SET expires_at=? WHERE id=?').run(Date.now()-1,l.id)
  expect((await e.submit(await e.proof(a,l.id,'renew'))).code).toBe('LICENSE_EXPIRED')
  await e.admin('action',{id:l.id,action:'extend',days:7});await e.admin('action',{id:l.id,action:'unbind'})
  expect((await e.submit(await e.proof(a,l.id,'renew'))).code).toBe('DEVICE_UNBOUND')
  expect((await e.submit(await e.proof(b,l.code))).ok).toBe(true)
  expect((await e.submit(await e.proof(a,l.id,'renew'))).code).toBe('DEVICE_MISMATCH')
  expect((await e.admin('action',{id:'missing',action:'disable'})).status).toBe(404)
 })
 it('protects administrator actions, request origins, cookies and stored secrets',async()=>{
  const e=await setup()
  expect((await e.call('/admin/api/licenses')).status).toBe(401)
  expect((await e.call('/admin/api/login',{password:'wrong'},{Origin:'https://evil.example'})).status).toBe(403)
  expect((await e.call('/admin/api/licenses',{days:7},{Origin:e.origin,Cookie:e.cookie})).code).toBe('CSRF')
  const response=await worker.fetch(new Request('https://other.example/health'),e.env);expect(response.status).toBe(403)
  const l=await e.admin('licenses',{days:7,label:'<img src=x onerror=alert(1)>'}),view=await e.admin('licenses')
  expect(JSON.stringify(view)).not.toContain(l.code);expect(JSON.stringify(view)).not.toContain('code_hash');expect(JSON.stringify(view)).not.toContain('PRIVATE KEY')
  await e.admin('logout',{});expect((await e.admin('licenses')).status).toBe(401)
 })
 it('rejects tampered proof, expired challenges and unconfigured service',async()=>{
  const e=await setup(),l=await e.admin('licenses',{days:7}),a=e.device('A'),body=await e.proof(a,l.code)
  body.credential='forged';expect((await e.submit(body)).code).toBe('DEVICE_PROOF_INVALID')
  const expired=await e.proof(a,l.code);e.raw.prepare('UPDATE challenges SET expires_at=0').run();expect((await e.submit(expired)).code).toBe('DEVICE_PROOF_INVALID')
  const response=await worker.fetch(new Request(e.origin+'/health'),{...e.env,SIGNING_PRIVATE_KEY:''});expect(response.status).toBe(503)
  for(let i=0;i<11;i++)await e.call('/admin/api/login',{password:'bad'},{Origin:e.origin})
  expect((await e.call('/admin/api/login',{password:'bad'},{Origin:e.origin})).status).toBe(429)
 })
 it('signs public policy, protects policy writes and rejects old activation before binding',async()=>{
  const e=await setup(),l=await e.admin('licenses',{days:7}),a=e.device('policy-A')
  expect((await e.call('/admin/api/update-policy',{enabled:true,minVersion:'0.3.25',message:''},{Origin:e.origin,Cookie:e.cookie})).code).toBe('CSRF')
  expect((await e.admin('update-policy',{enabled:true,minVersion:'latest',message:''})).status).toBe(400)
  const updated=await e.admin('update-policy',{enabled:true,minVersion:'0.3.25',message:'请更新'})
  expect(updated.policy.revision).toBe(1)
  const publicPolicy=await e.call('/v1/update-policy'),policy=verifyPolicy(publicPolicy.policyToken,e.env.PUBLIC_KEY)
  expect(policy).toMatchObject({enabled:true,minVersion:'0.3.25'})
  expect(()=>verifyPolicy(publicPolicy.policyToken+'X',e.env.PUBLIC_KEY)).toThrow()
  const denied=await e.submit(await e.proof(a,l.code));expect(denied.code).toBe('UPDATE_REQUIRED');expect(denied.status).toBe(426)
  expect(e.raw.prepare('SELECT fingerprint FROM licenses WHERE id=?').get(l.id).fingerprint).toBeNull()
  expect((await e.submit(await e.proof(a,l.code,'activate','0.3.25'))).ok).toBe(true)
  expect((await e.submit(await e.proof(a,l.id,'renew'))).code).toBe('UPDATE_REQUIRED')
  await e.admin('update-policy',{enabled:false,minVersion:'0.3.25',message:''})
  expect((await e.submit(await e.proof(a,l.id,'renew'))).ok).toBe(true)
  expect(requiresUpdate('0.3.9',{enabled:true,minVersion:'0.3.10'})).toBe(true)
  expect(requiresUpdate('0.3.24-preview',{enabled:true,minVersion:'0.3.24'})).toBe(true)
  expect(requiresUpdate('0.4.0',{enabled:true,minVersion:'0.3.24'})).toBe(false)
 })
 it('locks a running desktop, preserves projects and exits after ten seconds without resetting on refresh',async()=>{
  const e=await setup(),dir=mkdtempSync(path.join(tmpdir(),'wuhu-policy-'));directories.push(dir)
  const exit=vi.fn(),app={getPath:()=>dir,getVersion:()=> '0.3.24',exit},safeStorage={isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s),decryptString:(b:Buffer)=>b.toString()}
  let offline=false
  const config={required:true,serverUrl:e.origin,publicKey:e.env.PUBLIC_KEY,heartbeatSeconds:300}
  const net={fetch:async(url:string,options:any)=>{if(offline)throw new Error('offline');return worker.fetch(new Request(url,options),e.env)}}
  const make=()=>{const client=createLicenseClient({app,safeStorage,net,config,fingerprint:()=>sha256('desktop-policy')});clients.push(client);return client}
  const client=make();await client.init();const l=await e.admin('licenses',{days:7});expect((await client.activate(l.code)).authorized).toBe(true)
  const project=path.join(dir,'project.json');writeFileSync(project,'original project')
  vi.useFakeTimers();client.startEnforcement()
  await e.admin('update-policy',{enabled:true,minVersion:'0.3.25',message:'请更新'})
  expect(await client.refresh()).toMatchObject({authorized:false,updateRequired:true,status:'update-required'})
  const deadline=client.getState().quitAt
  expect(()=>client.requireActive()).toThrow('LICENSE_REQUIRED')
  await vi.advanceTimersByTimeAsync(5000);await client.refresh();expect(client.getState().quitAt).toBe(deadline)
  await vi.advanceTimersByTimeAsync(4999);expect(exit).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1);expect(exit).toHaveBeenCalledExactlyOnceWith(0)
  expect(readFileSync(project,'utf8')).toBe('original project')
  client.dispose();offline=true;const reopened=make();expect(await reopened.init()).toMatchObject({authorized:false,updateRequired:true})
  reopened.startEnforcement();await vi.advanceTimersByTimeAsync(10000);expect(exit).toHaveBeenCalledTimes(2)
 })
 it('checks unactivated desktops and cancels a pending exit when a newer signed policy removes the restriction',async()=>{
  const e=await setup(),dir=mkdtempSync(path.join(tmpdir(),'wuhu-policy-'));directories.push(dir)
  const exit=vi.fn(),client=createLicenseClient({app:{getPath:()=>dir,getVersion:()=> '0.3.24',exit},safeStorage:{isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s),decryptString:(b:Buffer)=>b.toString()},net:{fetch:(url:string,opts:any)=>worker.fetch(new Request(url,opts),e.env)},config:{required:true,serverUrl:e.origin,publicKey:e.env.PUBLIC_KEY},fingerprint:()=>sha256('inactive-policy')});clients.push(client)
  await e.admin('update-policy',{enabled:true,minVersion:'0.3.25',message:''})
  vi.useFakeTimers();expect(await client.init()).toMatchObject({authorized:false,updateRequired:true});client.startEnforcement()
  await vi.advanceTimersByTimeAsync(3000);await e.admin('update-policy',{enabled:false,minVersion:'0.3.25',message:''})
  expect(await client.refresh()).toMatchObject({authorized:false,updateRequired:false,quitAt:null})
  await vi.advanceTimersByTimeAsync(10000);expect(exit).not.toHaveBeenCalled()
 })
})
