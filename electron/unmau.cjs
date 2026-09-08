// All authenticated New API traffic remains on the configured service origin.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {Readable} = require('stream');
const {pipeline} = require('stream/promises');
const BASE = 'https://newapis.unmau.com';
const ALLOWED_VIDEO_MODELS = new Set([
  '稳定-seedance-2.5-720p', '稳定-seedance-2.5-480p', '官方-seedance-2-5-720p',
  'ad-seedance-2.5-720p', 'ad-seedance-2.5-480p', 'jd-seedance-2.5-720p',
  'jd-seedance-2.5-480p', 'td-seedance-2.5-720p', 'xd-seedance-2.5-720p-301010',
  'xd-seedance-2.5-720p-101010', 'md2-seedance-2.5-480p', 'xd-seedance-2.5-720p',
]);
module.exports = function registerUnmau({ipcMain,net,app}) {
  const result = fn => async (_event,args) => {
    try {return {ok:true,data:await fn(args || {})};}
    catch(error) {return {ok:false,error:error.message || 'New API 请求失败',retryable:!!error.retryable};}
  };
  async function request(apiKey, route, options = {}, timeout = 120000, consume = response => response.json()) {
    if (!apiKey || typeof apiKey !== 'string' || /[\r\n]/.test(apiKey)) throw new Error('请填写有效的 API Key');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(),timeout);
    try {
      const response = await net.fetch(BASE + route,{...options,signal:controller.signal,headers:{...options.headers,Authorization:`Bearer ${apiKey.trim()}`}});
      if (!response.ok) {
        let detail = response.statusText;
        try {const body = await response.json();detail = body.error?.message || body.message || detail;} catch {}
        const error = new Error(response.status === 401 ? 'API Key 无效或已过期' : `New API ${response.status}：${detail}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      return await consume(response);
    } catch(error) {
      if(error.name === 'AbortError') {const timeoutError=new Error('New API 请求超时；若正在提交任务，请先到平台确认任务是否已创建');timeoutError.retryable=true;throw timeoutError;}
      if(error instanceof TypeError)error.retryable=true;
      throw error;
    } finally {clearTimeout(timer);}
  }
  ipcMain.handle('unmau:request',result(async ({apiKey,path:route,body}) => {
    const creating = route === '/v1/videos' && body;
    if (!creating && route !== '/v1/models' && !/^\/v1\/videos\/[A-Za-z0-9_%.-]+$/.test(route || '')) throw new Error('不支持的 New API 请求');
    if (creating && !ALLOWED_VIDEO_MODELS.has(body.model)) throw new Error('不支持的 New API 视频模型');
    return request(apiKey,route,creating ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {method:'GET'});
  }));
  ipcMain.handle('unmau:upload',result(async ({apiKey,data,fileName,mimeType}) => {
    if(typeof data !== 'string' || data.length > 28 * 1024 * 1024)throw new Error('单个参考素材不能超过 20 MB');
    const bytes=Buffer.from(data,'base64');
    if(!bytes.length || bytes.length>20*1024*1024)throw new Error('参考素材为空或超过 20 MB');
    const form=new FormData();
    form.append('file',new Blob([bytes],{type:mimeType || 'application/octet-stream'}),path.basename(fileName || 'reference.bin'));
    return request(apiKey,'/v1/materials',{method:'POST',body:form});
  }));
  const downloads = new Map();
  ipcMain.handle('unmau:download',result(async ({apiKey,taskId}) => {
    if(typeof taskId!=='string' || !taskId || taskId.length>512)throw new Error('无效的视频任务 ID');
    const hash=crypto.createHash('sha256').update(String(apiKey)+'\0'+taskId).digest('hex');
    if(downloads.has(hash))return downloads.get(hash);
    const pending=(async()=>{
      const dir=path.join(app.getPath('userData'),'generated-videos','unmau');fs.mkdirSync(dir,{recursive:true});
      const finalPath=path.join(dir,hash+'.mp4'),temporaryPath=finalPath+'.part';
      if(fs.existsSync(finalPath) && fs.statSync(finalPath).size>0)return {path:finalPath};
      try {
        await request(apiKey,`/v1/videos/${encodeURIComponent(taskId)}/content`,{method:'GET'},300000,async response=>{
          const type=response.headers.get('content-type') || '';
          if(/json|text\/html/i.test(type))throw new Error('平台内容接口未返回视频文件');
          if(!response.body)throw new Error('平台返回空视频');
          await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(temporaryPath));
        });
        if(!fs.statSync(temporaryPath).size)throw new Error('平台返回空视频');
        fs.renameSync(temporaryPath,finalPath);return {path:finalPath};
      } finally {if(fs.existsSync(temporaryPath))fs.unlinkSync(temporaryPath);}
    })();
    downloads.set(hash,pending);
    try{return await pending;}finally{downloads.delete(hash);}
  }));
};
