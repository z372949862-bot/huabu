// Adapter for the sd2.5 protocols in the supplied YU25 Seedance 1.5.15 source.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {Readable}=require('stream');
const {pipeline}=require('stream/promises');
const BASE='https://api.yu25.xyz';
function retryError(message){return Object.assign(new Error(message),{retryable:true});}
function validateVideo(file,expectedBytes){
  const size=fs.statSync(file).size;
  if(!size||expectedBytes>0&&size!==expectedBytes)throw retryError('YU25 视频下载不完整，正在等待重新获取');
  const fd=fs.openSync(file,'r');const boxes=new Set();
  try{
    let offset=0;
    while(offset<size){
      const header=Buffer.alloc(16);
      if(fs.readSync(fd,header,0,8,offset)!==8)throw retryError('YU25 视频文件头不完整');
      const type=header.toString('ascii',4,8);let length=header.readUInt32BE(0),headerSize=8;
      if(offset===0&&type!=='ftyp')throw retryError('YU25 返回的内容不是 MP4 视频');
      if(length===1){if(fs.readSync(fd,header,8,8,offset+8)!==8)throw retryError('YU25 视频文件不完整');length=Number(header.readBigUInt64BE(8));headerSize=16;}
      if(length===0)length=size-offset;
      if(!Number.isSafeInteger(length)||length<headerSize||offset+length>size)throw retryError('YU25 视频文件被截断');
      boxes.add(type);offset+=length;
    }
    if(!boxes.has('moov')||!boxes.has('mdat'))throw retryError('YU25 视频缺少索引或媒体数据，正在等待完整成片');
  }finally{fs.closeSync(fd);}
}
module.exports=function registerYu25({ipcMain,net,app}){
  const wrap=fn=>async(_event,args)=>{try{return {ok:true,data:await fn(args||{})};}catch(error){let message=error.message||'YU25 请求失败';if(args?.apiKey)message=message.split(args.apiKey).join('[API Key]');return {ok:false,error:message,retryable:!!error.retryable};}};
  async function request(apiKey,url,options={},timeout=120000,consume=response=>response.json(),phase='poll'){
    if(typeof apiKey!=='string'||!apiKey.trim()||/[\r\n]/.test(apiKey))throw new Error('请填写有效的 YU25 API Key');
    const parsed=new URL(url);
    if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('YU25 返回的地址无效');
    const headers={Accept:'application/json',...options.headers};
    if(parsed.origin===BASE)headers.Authorization=`Bearer ${apiKey.trim()}`;
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeout);
    try{
      const response=await net.fetch(parsed.href,{...options,headers,signal:abort.signal});
      if(!response.ok){
        let reason=response.statusText;
        try{const body=await response.json();reason=body.error?.message||body.error||body.message||body.detail||reason;}catch{}
        const error=new Error(`YU25 ${phase==='download'?'下载':phase==='create'?'提交任务':'查询'}失败（HTTP ${response.status}）：${String(reason)}`);
        error.retryable=phase==='download'?![401,403].includes(response.status):phase==='poll'&&[404,409,425,429,500,502,503,504].includes(response.status);
        if(phase==='create')error.message+='；请先到平台确认是否已创建任务，避免重复提交';
        throw error;
      }
      return await consume(response);
    }catch(error){
      if(error.name==='AbortError'||error instanceof TypeError){const e=new Error(`YU25 请求${error.name==='AbortError'?'超时':'连接中断'}${phase==='create'?'；请先到平台确认是否已创建任务，避免重复提交':''}`);e.retryable=phase!=='create';throw e;}
      throw error;
    }finally{clearTimeout(timer);}
  }
  ipcMain.handle('yu25:request',wrap(async({apiKey,path:route,body})=>{
    const creating=route==='/v1/videos'&&!!body;
    if(!creating&&route!=='/v1/models'&&!/^\/v1\/videos\/[A-Za-z0-9_%.-]+$/.test(route||''))throw new Error('不支持的 YU25 请求');
    if(creating&&!new Set(['sd2.5','sd2.5 高']).has(body.model))throw new Error('YU25 接入仅支持 sd2.5 和 sd2.5 高');
    const trace=crypto.randomUUID();
    // Check local storage before submitting a potentially billable job.
    let journal;
    if(creating){
      const dir=path.join(app.getPath('userData'),'yu25-tasks');fs.mkdirSync(dir,{recursive:true});
      journal=fs.openSync(path.join(dir,'submitted.jsonl'),'a');
    }
    try{
      const data=await request(apiKey,BASE+route,creating?{method:'POST',headers:{'Content-Type':'application/json','X-Request-ID':trace,'Idempotency-Key':trace},body:JSON.stringify(body)}:{method:'GET'},creating?300000:60000,undefined,creating?'create':'poll');
      if(creating){
        const envelopes=[data,data?.data,data?.data?.data,data?.result,data?.video,data?.output];
        const taskId=['task_id','id','request_id'].flatMap(field=>envelopes.map(value=>value?.[field])).find(value=>(typeof value==='string'||typeof value==='number')&&String(value).trim());
        if(taskId!==undefined){
          try{
            // No keys, prompts, material data or signed media URLs in this journal.
            fs.writeSync(journal,JSON.stringify({task_id:String(taskId),model:String(body.model),submitted_at:new Date().toISOString(),client_request_id:trace})+'\n');
            fs.fsyncSync(journal);
          }catch{throw new Error(`YU25 已受理任务 ${taskId}，但本地任务编号保存失败；请记录此编号并到平台查询，勿重复提交`);}
        }
      }
      return data;
    }finally{if(journal!==undefined)fs.closeSync(journal);}
  }));
  ipcMain.handle('yu25:upload',wrap(async({apiKey,kind,data,fileName,mimeType})=>{
    if(kind!=='image')throw new Error('YU25 sd2.5 系列仅支持图片参考');
    if(typeof data!=='string'||data.length>3*1024*1024)throw new Error('参考图片须压缩到 2 MB 以内');
    const bytes=Buffer.from(data,'base64');if(!bytes.length||bytes.length>2*1024*1024)throw new Error('参考图片为空或超过 2 MB');
    const form=new FormData();form.append('image',new Blob([bytes],{type:mimeType||'image/jpeg'}),path.basename(fileName||'reference.jpg'));
    return request(apiKey,BASE+'/v1/temp-images',{method:'POST',body:form},60000,undefined,'upload');
  }));
  const downloads=new Map();
  ipcMain.handle('yu25:download',wrap(async({apiKey,taskId,videoUrl})=>{
    if(taskId!==undefined&&(typeof taskId!=='string'||taskId.length>512))throw new Error('YU25 任务 ID 无效');
    const candidates=[];if(taskId)candidates.push(`${BASE}/v1/videos/${encodeURIComponent(taskId)}/content`);
    if(videoUrl){const url=new URL(videoUrl,BASE).href;if(!candidates.includes(url))candidates.push(url);}
    if(!candidates.length)throw retryError('YU25 尚未返回可下载的视频地址');
    const hash=crypto.createHash('sha256').update(String(apiKey)+'\0'+(taskId||videoUrl)).digest('hex');
    if(downloads.has(hash))return downloads.get(hash);
    const job=(async()=>{
      const dir=path.join(app.getPath('userData'),'generated-videos','yu25');fs.mkdirSync(dir,{recursive:true});
      const dest=path.join(dir,hash+'.mp4'),temp=dest+'.part';
      if(fs.existsSync(dest)){validateVideo(dest,0);return {path:dest};}
      let last;
      for(const url of candidates){
        try{
          await request(apiKey,url,{method:'GET',headers:{Accept:'video/*,application/octet-stream;q=0.9,*/*;q=0.8'}},300000,async response=>{
            if(/json|text\/html/i.test(response.headers.get('content-type')||''))throw retryError('YU25 暂时返回网页或消息，尚未取得视频');
            if(!response.body)throw retryError('YU25 返回空视频');
            await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(temp));
            const range=response.headers.get('content-range')||'';
            const expected=Number(range.match(/\/(\d+)\s*$/)?.[1]||response.headers.get('content-length')||0);
            validateVideo(temp,expected);
          },'download');
          fs.renameSync(temp,dest);return {path:dest};
        }catch(error){last=error;if(!error.retryable)throw error;}
        finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
      }
      throw last||retryError('YU25 视频下载暂时不可用');
    })();
    downloads.set(hash,job);try{return await job;}finally{downloads.delete(hash);}
  }));
};
module.exports.validateVideo=validateVideo;
