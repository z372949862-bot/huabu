import crypto from 'node:crypto'
import core from '../electron/license-core.cjs'
import updatePolicy from '../electron/update-policy.cjs'
import adminHtml from './public/admin.html'
import adminCss from '../license-server/admin.css'
import adminJs from './public/admin.js'

const {sha256,signLease,verifyProof}=core
const {validMinimum,requiresUpdate,signPolicy}=updatePolicy
async function readPolicy(db){const row=await db.prepare('SELECT * FROM update_policy WHERE id=1').first();return {enabled:!!row.enabled,minVersion:row.min_version,message:row.message,revision:row.revision}}
const fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code})}
const random=()=>crypto.randomBytes(32).toString('base64url')
const normalize=code=>String(code||'').trim().toUpperCase().replace(/[- ]/g,'')
const headers={
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'Strict-Transport-Security':'max-age=31536000',
 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
}
const json=(status,data,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8',...extra}})
const cookie='__Host-wuhu_admin'
const secureCookie=value=>cookie+'='+value+'; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'
function dayCount(value){const days=Number(value??7);if(!Number.isInteger(days)||days<1||days>36500)fail(400,'INVALID_DAYS','有效天数应为 1–36500');return days}
async function bodyOf(request){
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')fail(415,'INVALID_TYPE','仅接受 JSON 请求')
 const reader=request.body?.getReader();if(!reader)fail(400,'INVALID_JSON','请求格式错误')
 let size=0;const chunks=[]
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();fail(413,'TOO_LARGE','请求过大')}chunks.push(value)}
 try{const data=JSON.parse(Buffer.concat(chunks).toString());if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();return data}catch{fail(400,'INVALID_JSON','请求格式错误')}
}
async function limit(db,key,max,now){
 const row=await db.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<=? THEN 1 ELSE rate_limits.count+1 END, expires_at=CASE WHEN rate_limits.expires_at<=? THEN excluded.expires_at ELSE rate_limits.expires_at END RETURNING count').bind(key,now+60000,now,now).first()
 if(row.count>max)fail(429,'RATE_LIMIT','操作过于频繁，请稍后再试')
}
function audit(db,action,id,now){return db.prepare('INSERT INTO audit(id,action,license_id,at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),action,id,now)}
function licenseView(row){return {id:row.id,label:row.label,suffix:row.suffix,status:row.status,createdAt:row.created_at,expiresAt:row.expires_at,generation:row.generation,binding:row.fingerprint?{fingerprint:row.fingerprint,boundAt:row.bound_at,lastSeen:row.last_seen}:null}}
function licenseError(row,body,action){
 if(!row)fail(404,'LICENSE_NOT_FOUND','激活码无效，请核对管理员发放的激活码')
 if(row.status==='disabled')fail(403,'LICENSE_DISABLED','授权已被管理员停用，请联系管理员')
 if(row.expires_at<=Date.now())fail(403,'LICENSE_EXPIRED','授权已到期，请联系管理员续期')
 if(!row.fingerprint&&action==='renew')fail(403,'DEVICE_UNBOUND','设备已被解绑，请使用激活码重新激活')
 if(row.fingerprint!==body.fingerprint||row.public_key!==body.devicePublicKey)fail(403,'DEVICE_MISMATCH','此激活码已绑定其他电脑，请联系管理员解绑')
 fail(409,'RETRY','授权状态已改变，请重试')
}
async function handle(request,env){
 const url=new URL(request.url),now=Date.now()
 if(!env.DB||!env.SIGNING_PRIVATE_KEY||!env.PUBLIC_KEY||!/^[a-f0-9]{64}$/.test(env.ADMIN_PASSWORD_HASH||'')||!env.PUBLIC_ORIGIN)fail(503,'NOT_CONFIGURED','授权服务正在配置，请稍后重试')
 if(url.origin!==env.PUBLIC_ORIGIN)fail(403,'INVALID_HOST','请求地址不允许')
 if(request.headers.has('origin')&&request.headers.get('origin')!==url.origin)fail(403,'INVALID_ORIGIN','跨站请求不允许')
 const db=env.DB.withSession?env.DB.withSession('first-primary'):env.DB
 const leaseSeconds=Number(env.LEASE_SECONDS||3600),heartbeatSeconds=Number(env.HEARTBEAT_SECONDS||300)
 if(!Number.isInteger(leaseSeconds)||leaseSeconds<60||leaseSeconds>86400||!Number.isInteger(heartbeatSeconds)||heartbeatSeconds<15||heartbeatSeconds>=leaseSeconds)fail(503,'NOT_CONFIGURED','授权策略配置异常')
 if(request.method==='GET'&&url.pathname==='/health'){
  await db.prepare('SELECT 1 FROM licenses LIMIT 1').first()
  if(crypto.createPublicKey(env.SIGNING_PRIVATE_KEY).export({type:'spki',format:'pem'})!==env.PUBLIC_KEY)fail(503,'NOT_CONFIGURED','签名密钥配置异常')
  return json(200,{ok:true,service:'wuhu-license-cloud',trial:false,publicKey:env.PUBLIC_KEY,heartbeatSeconds,offlineSeconds:leaseSeconds})
 }
 if(request.method==='GET'&&['/','/admin','/admin.js','/admin.css'].includes(url.pathname)){
  if(url.pathname==='/')return new Response(null,{status:302,headers:{...headers,Location:'/admin'}})
  const file=url.pathname==='/admin'?adminHtml:url.pathname==='/admin.js'?adminJs:adminCss
  const type=url.pathname==='/admin'?'text/html':url.pathname==='/admin.js'?'text/javascript':'text/css'
  return new Response(file,{headers:{...headers,'Content-Type':type+'; charset=utf-8'}})
 }
 if(request.method==='GET'&&url.pathname==='/v1/update-policy')return json(200,{ok:true,policyToken:signPolicy(await readPolicy(db),env.SIGNING_PRIVATE_KEY,now)})
 const ipHash=sha256(request.headers.get('CF-Connecting-IP')||'local')
 if(url.pathname.startsWith('/admin/api/')){
  if(!['GET','POST'].includes(request.method))fail(405,'METHOD','请求方式不支持')
  if(request.method!=='GET'&&request.headers.get('origin')!==url.origin)fail(403,'INVALID_ORIGIN','请从授权管理页面操作')
  if(url.pathname==='/admin/api/login'&&request.method==='POST'){
   await limit(db,'login:'+ipHash,10,now)
   const body=await bodyOf(request)
   const supplied=Buffer.from(sha256(String(body.password||'').trim()),'hex'),expected=Buffer.from(env.ADMIN_PASSWORD_HASH,'hex')
   if(!crypto.timingSafeEqual(supplied,expected))fail(401,'BAD_LOGIN','管理登录码无效')
   const token=random(),csrf=random()
   await db.prepare('INSERT INTO admin_sessions(token_hash,csrf,expires_at) VALUES(?,?,?)').bind(sha256(token),csrf,now+8*3600000).run()
   return json(200,{ok:true,csrf},{'Set-Cookie':secureCookie(token)})
  }
  const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookie+'='))?.slice(cookie.length+1)
  const session=token&&await db.prepare('SELECT csrf FROM admin_sessions WHERE token_hash=? AND expires_at>?').bind(sha256(token),now).first()
  if(!session)fail(401,'LOGIN_REQUIRED','请先登录管理后台')
  if(request.method!=='GET'&&request.headers.get('x-csrf-token')!==session.csrf)fail(403,'CSRF','页面验证已失效，请刷新后重试')
  if(url.pathname==='/admin/api/update-policy'&&request.method==='GET')return json(200,{ok:true,policy:await readPolicy(db)})
  if(url.pathname==='/admin/api/update-policy'&&request.method==='POST'){
   const body=await bodyOf(request)
   if(typeof body.enabled!=='boolean'||!validMinimum(body.minVersion)||typeof body.message!=='string'||body.message.length>200)fail(400,'INVALID_POLICY','请填写正确的最低版本（例如 0.3.24）及不超过 200 字的提示')
   await db.batch([db.prepare('UPDATE update_policy SET enabled=?,min_version=?,message=?,revision=revision+1,updated_at=? WHERE id=1').bind(body.enabled?1:0,body.minVersion,body.message,now),audit(db,'update-policy','update-policy',now)])
   return json(200,{ok:true,policy:await readPolicy(db)})
  }
  if(url.pathname==='/admin/api/licenses'&&request.method==='GET'){
   const rows=await db.prepare('SELECT * FROM licenses ORDER BY created_at DESC LIMIT 1000').all()
   const history=await db.prepare('SELECT action,license_id AS licenseId,at FROM audit ORDER BY at DESC LIMIT 30').all()
   const counts=await db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN fingerprint IS NOT NULL THEN 1 ELSE 0 END) AS bound,SUM(CASE WHEN status='disabled' THEN 1 ELSE 0 END) AS disabled FROM licenses").first()
   return json(200,{ok:true,csrf:session.csrf,licenses:rows.results.map(licenseView),audit:history.results,counts,limit:1000,trial:false,heartbeatSeconds,offlineSeconds:leaseSeconds})
  }
  if(url.pathname==='/admin/api/licenses'&&request.method==='POST'){
   const body=await bodyOf(request),days=dayCount(body.days),raw=crypto.randomBytes(20).toString('hex').toUpperCase(),code='WH-'+raw.match(/.{1,5}/g).join('-'),id=crypto.randomUUID(),expiresAt=now+days*86400000
   await db.batch([db.prepare("INSERT INTO licenses(id,label,code_hash,suffix,status,created_at,expires_at) VALUES(?,?,?,?,'active',?,?)").bind(id,String(body.label||'未命名授权').slice(0,80),sha256(normalize(code)),raw.slice(-5),now,expiresAt),audit(db,'create',id,now)])
   return json(201,{ok:true,id,code,expiresAt})
  }
  if(url.pathname==='/admin/api/action'&&request.method==='POST'){
   const body=await bodyOf(request)
   if(typeof body.id!=='string'||body.id.length>80)fail(400,'INVALID_ID','授权编号无效')
   let stmt
   if(body.action==='disable')stmt=db.prepare("UPDATE licenses SET status='disabled',generation=generation+1 WHERE id=? RETURNING id").bind(body.id)
   else if(body.action==='enable')stmt=db.prepare("UPDATE licenses SET status='active' WHERE id=? RETURNING id").bind(body.id)
   else if(body.action==='unbind')stmt=db.prepare('UPDATE licenses SET fingerprint=NULL,public_key=NULL,bound_at=NULL,last_seen=NULL,generation=generation+1 WHERE id=? RETURNING id').bind(body.id)
   else if(body.action==='extend')stmt=db.prepare('UPDATE licenses SET expires_at=MAX(expires_at,?)+? WHERE id=? RETURNING id').bind(now,dayCount(body.days)*86400000,body.id)
   else fail(400,'INVALID_ACTION','不支持的操作')
   const result=await db.batch([stmt,db.prepare('INSERT INTO audit(id,action,license_id,at) SELECT ?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),body.action,body.id,now)])
   if(!result[0].results.length)fail(404,'NOT_FOUND','授权不存在')
   return json(200,{ok:true})
  }
  if(url.pathname==='/admin/api/logout'&&request.method==='POST'){
   await db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(sha256(token)).run()
   return json(200,{ok:true},{'Set-Cookie':cookie+'=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})
  }
  fail(404,'NOT_FOUND','接口不存在')
 }
 if(request.method==='POST'&&url.pathname==='/v1/challenge'){
  await limit(db,'device:'+ipHash,120,now)
  const body=await bodyOf(request)
  if(!/^[a-f0-9]{64}$/.test(body.fingerprint||'')||typeof body.devicePublicKey!=='string'||body.devicePublicKey.length>1000)fail(400,'BAD_DEVICE','设备标识无效')
  try{if(crypto.createPublicKey(body.devicePublicKey).asymmetricKeyType!=='ed25519')throw new Error()}catch{fail(400,'BAD_KEY','设备公钥无效')}
  const nonce=random()
  await db.prepare('INSERT INTO challenges(nonce_hash,fingerprint,public_key,expires_at) VALUES(?,?,?,?)').bind(sha256(nonce),body.fingerprint,body.devicePublicKey,now+60000).run()
  return json(200,{ok:true,nonce})
 }
 if(request.method==='POST'&&['/v1/activate','/v1/renew'].includes(url.pathname)){
  await limit(db,'device:'+ipHash,120,now)
  const body=await bodyOf(request),action=url.pathname.slice(4)
  if(body.action!==action||typeof body.nonce!=='string'||body.nonce.length>100||!verifyProof(body))fail(403,'DEVICE_PROOF_INVALID','设备验证失败，请重试')
  const challenge=await db.prepare('DELETE FROM challenges WHERE nonce_hash=? AND fingerprint=? AND public_key=? AND expires_at>? RETURNING nonce_hash').bind(sha256(body.nonce),body.fingerprint,body.devicePublicKey,now).first()
  if(!challenge)fail(403,'DEVICE_PROOF_INVALID','设备验证失败，请重试')
  const policy=await readPolicy(db)
  if(requiresUpdate(body.appVersion,policy))return json(426,{ok:false,code:'UPDATE_REQUIRED',message:policy.message||'当前版本已停止支持，请更新后继续使用。',policyToken:signPolicy(policy,env.SIGNING_PRIVATE_KEY,now)})
  let row
  if(action==='activate'){
   const result=await db.batch([
    db.prepare("UPDATE licenses SET fingerprint=?,public_key=?,bound_at=COALESCE(bound_at,?),last_seen=? WHERE code_hash=? AND status='active' AND expires_at>? AND (fingerprint IS NULL OR (fingerprint=? AND public_key=?)) RETURNING *").bind(body.fingerprint,body.devicePublicKey,now,now,sha256(normalize(body.credential)),now,body.fingerprint,body.devicePublicKey),
    db.prepare('INSERT INTO audit(id,action,license_id,at) SELECT ?,\'activate\',id,? FROM licenses WHERE code_hash=? AND changes()=1').bind(crypto.randomUUID(),now,sha256(normalize(body.credential)))
   ]);row=result[0].results[0]
  }else row=await db.prepare("UPDATE licenses SET last_seen=? WHERE id=? AND status='active' AND expires_at>? AND fingerprint=? AND public_key=? RETURNING *").bind(now,body.credential,now,body.fingerprint,body.devicePublicKey).first()
  if(!row){const existing=action==='activate'?await db.prepare('SELECT * FROM licenses WHERE code_hash=?').bind(sha256(normalize(body.credential))).first():await db.prepare('SELECT * FROM licenses WHERE id=?').bind(body.credential).first();licenseError(existing,body,action)}
  const token=signLease({licenseId:row.id,fingerprint:row.fingerprint,deviceKey:sha256(row.public_key),generation:row.generation,iat:now,exp:Math.min(now+leaseSeconds*1000,row.expires_at),licenseExpiresAt:row.expires_at,label:row.label},env.SIGNING_PRIVATE_KEY)
  return json(200,{ok:true,token,serverTime:now})
 }
 fail(404,'NOT_FOUND','接口不存在')
}
export default {
 async fetch(request,env){try{return await handle(request,env)}catch(error){if(!error.status)console.error('license-service-failure',error.name);return json(error.status||503,{ok:false,code:error.code||'SERVICE_UNAVAILABLE',message:error.status?error.message:'授权服务暂时不可用，请稍后重试'})}},
 async scheduled(_event,env){const now=Date.now();await env.DB.batch([env.DB.prepare('DELETE FROM challenges WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(now-3600000)])}
}
