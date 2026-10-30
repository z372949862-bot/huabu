const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict')
const {sha256,canonicalProof,verifyLease}=require('../electron/license-core.cjs')
const {verifyPolicy}=require('../electron/update-policy.cjs')
async function main(){
 const dir=process.argv[2];if(!dir||!path.isAbsolute(dir))throw new Error('Provide absolute private directory')
 const config=JSON.parse(fs.readFileSync(path.join(dir,'client-config.json'),'utf8')),origin=config.serverUrl
 const call=async(route,body,headers={})=>{const r=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});return {status:r.status,headers:r.headers,...await r.json()}}
 const health=await call('/health');assert.equal(health.ok,true);assert.equal(health.publicKey,config.publicKey)
 const policyResult=await call('/v1/update-policy');assert.equal(policyResult.ok,true)
 const policy=verifyPolicy(policyResult.policyToken,config.publicKey)
 const login=await call('/admin/api/login',{password:fs.readFileSync(path.join(dir,'admin-login.txt'),'utf8').trim()},{Origin:origin});assert.equal(login.ok,true)
 const headers={Origin:origin,Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.csrf}
 const admin=(route,body)=>call('/admin/api/'+route,body,headers)
 const adminPolicy=await admin('update-policy');assert.equal(adminPolicy.ok,true)
 assert.equal(adminPolicy.policy.revision,policy.revision);assert.equal(adminPolicy.policy.enabled,policy.enabled)
 const license=await admin('licenses',{label:'云端自动验证 · 请勿分发',days:1});assert.equal(license.ok,true)
 const devices=['A','B'].map(n=>{const key=crypto.generateKeyPairSync('ed25519');return {fingerprint:sha256('cloud-smoke:'+n+crypto.randomUUID()),publicKey:key.publicKey.export({type:'spki',format:'pem'}),privateKey:key.privateKey}})
 const proof=async(who,credential,action='activate')=>{const challenge=await call('/v1/challenge',{fingerprint:who.fingerprint,devicePublicKey:who.publicKey});assert.equal(challenge.ok,true);const body={action,nonce:challenge.nonce,fingerprint:who.fingerprint,devicePublicKey:who.publicKey,credential,appVersion:require('../package.json').version};return {...body,signature:crypto.sign(null,Buffer.from(canonicalProof(body)),who.privateKey).toString('base64url')}}
 const send=body=>call('/v1/'+body.action,body)
 try{
  const bodies=await Promise.all(devices.map(d=>proof(d,license.code))),results=await Promise.all(bodies.map(send)),index=results.findIndex(r=>r.ok)
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.code==='DEVICE_MISMATCH').length,1)
  const winner=devices[index],other=devices[1-index];assert.equal(verifyLease(results[index].token,config.publicKey,winner).licenseId,license.id)
  assert.equal((await send(bodies[index])).code,'DEVICE_PROOF_INVALID')
  await admin('action',{id:license.id,action:'disable'});assert.equal((await send(await proof(winner,license.id,'renew'))).code,'LICENSE_DISABLED')
  await admin('action',{id:license.id,action:'enable'});assert.equal((await send(await proof(winner,license.id,'renew'))).ok,true)
  await admin('action',{id:license.id,action:'unbind'});assert.equal((await send(await proof(winner,license.id,'renew'))).code,'DEVICE_UNBOUND')
  assert.equal((await send(await proof(other,license.code))).ok,true)
  assert.equal((await call('/admin/api/licenses')).status,401)
  assert.equal((await call('/admin/api/licenses',{days:7},{Origin:origin,Cookie:headers.Cookie})).code,'CSRF')
  const output={ok:true,origin,at:new Date().toISOString(),checks:['health and signing key','signed update policy and authenticated admin policy','one code two concurrent devices','replay rejection','disable and restore','unbind and transfer','admin login and CSRF'],testLicenseId:license.id}
  fs.writeFileSync(path.join(dir,'cloud-smoke-result.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2))
 }finally{await admin('action',{id:license.id,action:'disable'})}
 const ownerPath=path.join(dir,'owner-test-license.json')
 if(!fs.existsSync(ownerPath)){const owner=await admin('licenses',{label:'所有者本机 · 云端试用',days:7});assert.equal(owner.ok,true);fs.writeFileSync(ownerPath,JSON.stringify({id:owner.id,code:owner.code,expiresAt:owner.expiresAt},null,2),{mode:0o600})}
 await admin('logout',{})
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
