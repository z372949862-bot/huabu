const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { sha256, canonicalProof, verifyLease } = require('./license-core.cjs')
const { requiresUpdate, verifyPolicy } = require('./update-policy.cjs')
function machineFingerprint() {
  if (process.platform !== 'win32') throw new Error('当前授权试用仅支持 Windows')
  const output = execFileSync(path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'reg.exe'), ['query','HKLM' + String.fromCharCode(92) + 'SOFTWARE' + String.fromCharCode(92) + 'Microsoft' + String.fromCharCode(92) + 'Cryptography','/v','MachineGuid','/reg:64'], { encoding:'utf8', windowsHide:true, timeout:5000 })
  const match = output.match(/MachineGuid[ \t]+REG_SZ[ \t]+([a-fA-F0-9-]{20,})/)
  if (!match) throw new Error('无法读取设备标识，请联系管理员')
  return sha256('wuhu-ai-device-v1:' + match[1].toLowerCase())
}
function createLicenseClient({ app, safeStorage, net, config, notify = () => {}, fingerprint = machineFingerprint, clock = Date.now }) {
  let saved = null, device = null, policy = null, state = { authorized:false, status:'loading', message:'正在验证授权', trial:!!config.trial }, admitted = false, work = null, refreshTimer, expiryTimer, quitTimer, enforcementStarted = false
  const file = () => path.join(app.getPath('userData'),'device-license.dat')
  const updateRequired = () => !!policy && requiresUpdate(app.getVersion(),policy)
  function syncExit() {
    if (!updateRequired()) { clearTimeout(quitTimer); quitTimer=null; state.quitAt=null; return }
    if (enforcementStarted && !quitTimer) {
      state.quitAt=clock()+10000
      quitTimer=setTimeout(()=>app.exit(0),10000)
    }
  }
  const publish = patch => { state = { ...state, ...patch }; syncExit(); notify(getState()); return getState() }
  function validConfiguration() {
    try { const url = new URL(config.serverUrl); return config.required === true && !!config.publicKey && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' && (url.protocol === 'https:' || config.trial === true && url.protocol === 'http:' && url.hostname === '127.0.0.1') && crypto.createPublicKey(config.publicKey).asymmetricKeyType === 'ed25519' } catch { return false }
  }
  function save() {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密存储不可用，无法保存授权')
    const data = safeStorage.encryptString(JSON.stringify(saved))
    fs.mkdirSync(path.dirname(file()),{recursive:true}); fs.writeFileSync(file()+'.tmp',data); fs.renameSync(file()+'.tmp',file())
  }
  function currentLease() {
    if (!saved?.token || !device || saved.denied) return null
    if (saved.lastSeen && clock() + 300000 < saved.lastSeen) return null
    try { return verifyLease(saved.token,config.publicKey,device,clock()) } catch { return null }
  }
  function getState() {
    const lease = currentLease()
    return { ...state, authorized:!!lease && state.authorized && !updateRequired(), updateRequired:updateRequired(), minVersion:policy?.minVersion||'', currentVersion:app.getVersion?.()||'', machineCode:device?.fingerprint || '', expiresAt:lease?.licenseExpiresAt || null, leaseExpiresAt:lease?.exp || null, label:lease?.label || '', trial:!!config.trial, preview:!!config.preview }
  }
  function acceptPolicy(token) {
    const next=verifyPolicy(token,config.publicKey,clock())
    if(policy && next.revision<policy.revision)throw new Error('更新策略已过期，请重新联网验证')
    policy=next;saved.policyToken=token;save()
    if(updateRequired())return publish({authorized:false,status:'update-required',message:policy.message||'当前版本已停止支持，请更新后继续使用。'})
    return publish({})
  }
  async function checkPolicy() {
    if(config.trial)return
    const response=await net.fetch(config.serverUrl.replace(/[/]+$/,'')+'/v1/update-policy',{redirect:'error',signal:AbortSignal.timeout(10000)})
    const result=await response.json()
    if(!response.ok||!result.ok)throw new Error('无法读取更新策略')
    acceptPolicy(result.policyToken)
  }
  function accept(token, offline = false) {
    if(updateRequired())return publish({authorized:false,status:'update-required',message:policy.message||'请更新后继续使用'})
    const lease = verifyLease(token,config.publicKey,device,clock())
    saved.token=token; saved.licenseId=lease.licenseId; saved.lastSeen=Math.max(saved.lastSeen||0,clock()); saved.denied=null; save(); admitted=true
    clearTimeout(expiryTimer); expiryTimer=setTimeout(()=>{ if(!currentLease()) publish({authorized:false,status:'expired',message:'授权验证已过期，请连接授权服务后重新验证'}) },Math.max(1,lease.exp-clock()+10)); expiryTimer.unref?.()
    return publish({authorized:true,status:offline?'offline':'active',message:offline?'授权服务暂时无法连接，当前凭证仍有效':'授权有效'})
  }
  async function post(route,body) {
    const response = await net.fetch(config.serverUrl.replace(/[/]+$/,'')+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)})
    let result; try { result=await response.json() } catch { throw new Error('授权服务响应异常') }
    if (!response.ok || !result.ok) throw Object.assign(new Error(result.message || '授权验证失败'),{code:result.code,status:response.status,policyToken:result.policyToken})
    return result
  }
  async function perform(action,credential) {
    const challenge=await post('/v1/challenge',{fingerprint:device.fingerprint,devicePublicKey:device.publicKey})
    const body={action,nonce:challenge.nonce,fingerprint:device.fingerprint,devicePublicKey:device.publicKey,credential,appVersion:app.getVersion()}
    body.signature=crypto.sign(null,Buffer.from(canonicalProof(body)),saved.privateKey).toString('base64url')
    const result=await post('/v1/'+action,body)
    return accept(result.token)
  }
  function handleError(error, allowOffline) {
    if(error.code==='UPDATE_REQUIRED') { try{return acceptPolicy(error.policyToken)}catch{ return publish({authorized:false,status:'error',message:'更新策略验证失败，请重新联网验证'}) } }
    if(updateRequired())return publish({authorized:false,status:'update-required',message:policy.message||'请更新后继续使用'})
    const definitive=['LICENSE_NOT_FOUND','LICENSE_DISABLED','LICENSE_EXPIRED','DEVICE_UNBOUND','DEVICE_MISMATCH'].includes(error.code)
    if (definitive) { saved.denied=error.code; saved.token=null; save(); return publish({authorized:false,status:'blocked',message:error.message}) }
    if (allowOffline && currentLease()) return accept(saved.token,true)
    return publish({authorized:false,status:'error',message: error.code ? error.message : config.trial ? '暂时无法连接授权服务，请启动本地授权服务后重试' : '暂时无法连接云端授权服务，请检查网络后重试'})
  }
  function exclusive(fn) { if(work)return work; work=fn().finally(()=>{work=null}); return work }
  function refresh() {
    return exclusive(async()=>{
      if(!device || !validConfiguration()) return getState()
      try { await checkPolicy() } catch(error) { if(updateRequired())return handleError(error,false); if(!currentLease() && !config.trial)return handleError(error,false) }
      if(updateRequired())return getState()
      if(!saved.licenseId)return publish({authorized:false,status:'inactive',message:'请输入管理员发放的激活码'})
      try { return await perform('renew',saved.licenseId) } catch(error) { return handleError(error,true) }
    })
  }
  async function activate(code) {
    if(!device || !validConfiguration())return getState()
    if(typeof code!=='string' || code.trim().length<20 || code.length>100)return publish({authorized:false,status:'error',message:'请输入完整激活码'})
    return exclusive(async()=>{ try { await checkPolicy();if(updateRequired())return getState();return await perform('activate',code.trim()) } catch(error) { return handleError(error,false) } })
  }
  async function init() {
    if(!validConfiguration()) return publish({authorized:false,status:'configuration',message:'授权服务尚未配置，暂不可进入。请联系软件管理员。'})
    try {
      if(!safeStorage.isEncryptionAvailable())throw new Error('系统加密存储不可用，请检查 Windows 用户环境')
      const fp=fingerprint()
      if(fs.existsSync(file())) { try { saved=JSON.parse(safeStorage.decryptString(fs.readFileSync(file()))) } catch { throw new Error('本机授权文件无法读取，请联系管理员恢复或解绑') } }
      if(!saved) { const keys=crypto.generateKeyPairSync('ed25519');saved={privateKey:keys.privateKey.export({type:'pkcs8',format:'pem'}),publicKey:keys.publicKey.export({type:'spki',format:'pem'}),lastSeen:clock()};save() }
      device={fingerprint:fp,publicKey:saved.publicKey}
      if(crypto.createPublicKey(saved.privateKey).export({type:'spki',format:'pem'})!==saved.publicKey)throw new Error('本机授权密钥不一致，请联系管理员')
      if(saved.policyToken) { try{policy=verifyPolicy(saved.policyToken,config.publicKey,clock(),true)}catch{throw new Error('本机更新策略校验失败，请联系管理员')} }
      await refresh()
      refreshTimer=setInterval(()=>refresh().catch(()=>{}),Math.max(5,Math.min(900,config.heartbeatSeconds||900))*1000);refreshTimer.unref?.()
      return getState()
    } catch(error) { return publish({authorized:false,status:'error',message:error.message}) }
  }
  function requireActive(){ if(!getState().authorized)throw new Error('LICENSE_REQUIRED: 请先激活本机授权') }
  function canRecover(channel,args) {
    if(!admitted)return false
    if(['store:get','store:set','video:save-generated','image:save','upload:read'].includes(channel))return true
    if(channel.endsWith(':download') || channel==='piapi:download-image')return true
    if(channel.endsWith(':request')) { const p=args[0]||{}; return !p.body && typeof p.path==='string' && (/^[/]api[/]v1[/]task[/][A-Za-z0-9_-]+$/.test(p.path) || /^[/]v1[/]videos[/][A-Za-z0-9_%.-]+$/.test(p.path)) }
    return false
  }
  function guardedIpc(ipcMain) {
    return { handle(channel,fn) { ipcMain.handle(channel,async(event,...args)=>{
      if(!channel.startsWith('updater:') && !channel.startsWith('license:') && !getState().authorized && !canRecover(channel,args))requireActive()
      return fn(event,...args)
    }) } }
  }
  function register(ipcMain){ipcMain.handle('license:status',()=>getState());ipcMain.handle('license:activate',(_e,code)=>activate(code));ipcMain.handle('license:refresh',()=>refresh())}
  return {init,getState,activate,refresh,requireActive,guardedIpc,register,startEnforcement(){enforcementStarted=true;return publish({})},canRecoverHttp(method){return admitted && method==='GET'},dispose(){clearInterval(refreshTimer);clearTimeout(expiryTimer);clearTimeout(quitTimer)}}
}
module.exports={createLicenseClient,machineFingerprint}
