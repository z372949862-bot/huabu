// @ts-nocheck
import specs from './yu25Models';
import {UnmauProvider} from './unmau';
export const YU25_BASE='https://api.yu25.xyz';
export const YU25_MODELS=Object.entries(specs).map(([id,spec])=>({id,name:spec.label,
  description:`YU25 · ${spec.resolutions.join('/')} · ${spec.durations.length===1?spec.durations[0]:`${spec.durations[0]}–${spec.durations.at(-1)}`}秒 · ${spec.min_images?`至少${spec.min_images}张图，`:''}最多${spec.max_images}图/${spec.max_videos}视频/${spec.max_audios}音频`,
  capabilities:{ratios:spec.ratios,resolutions:spec.resolutions,audioGeneration:false,
    durationRange:{min:30,max:30},
    maxImages:spec.max_images,maxVideos:spec.max_videos,maxAudios:spec.max_audios}
}));
export const isYu25Model=id=>Object.hasOwn(specs,id);
const unique=values=>[...new Set((values||[]).filter(Boolean))];
const sizes={'720p':{'16:9':'1280x720','9:16':'720x1280','1:1':'720x720'},'480p':{'16:9':'854x480','9:16':'480x854','1:1':'480x480'},'768p':{'16:9':'1366x768','9:16':'768x1366','1:1':'768x768'}};
export function buildYu25Body(data,refs){
  const spec=specs[data.model];if(!spec)throw new Error('请选择 YU25 中转站支持的视频模型');
  let prompt=String(data.prompt||'').replace(/@\[([^\]]*)\]\([^)]*\)/g,'$1').trim();
  if(!prompt)throw new Error('请输入视频提示词');
  if([...prompt].length>2500)throw new Error('YU25 提示词请控制在 2500 字符以内');
  const ratio=data.ratio||'16:9',resolution=String(data.resolution||spec.resolutions.at(-1)).toLowerCase();
  if(!spec.ratios.includes(ratio))throw new Error(`该模型支持的比例：${spec.ratios.join('、')}`);
  if(!spec.resolutions.includes(resolution))throw new Error(`该模型支持的清晰度：${spec.resolutions.join('、')}`);
  let duration=Number(data.duration??spec.durations.at(-1));
  if(!spec.durations.includes(duration))throw new Error(`该模型支持的时长：${spec.durations.join('、')} 秒`);
  duration=spec.duration_aliases?.[duration]??duration;
  const images=unique(refs.images),videos=unique(refs.videos),audios=unique(refs.audios);
  if(images.length<spec.min_images)throw new Error(`该模型至少需要 ${spec.min_images} 张参考图片`);
  for(const [values,max,label]of [[images,spec.max_images,'参考图片'],[videos,spec.max_videos,'参考视频'],[audios,spec.max_audios,'参考音频']]){
    if(values.length>max)throw new Error(max?`该模型最多支持 ${max} 个${label}，当前 ${values.length} 个`:`该模型不支持${label}`);
  }
  const body={model:data.model,prompt,seconds:String(duration),size:sizes[resolution][ratio]};
  if(images.length)body.image_urls=images;
  return body;
}
function at(data,path){return path.split('.').reduce((value,key)=>value?.[key],data);}
const first=(data,paths)=>paths.map(path=>at(data,path)).find(value=>(typeof value==='string'||typeof value==='number')&&String(value).trim())??'';
export function mapYu25Task(data){
  const raw=String(first(data,['status','state','data.status','data.state','result.status','result.state','data.data.status','data.data.state','video.status','video.state','output.status'])).trim().toLowerCase();
  const success=['completed','complete','succeeded','success','done','finished','ready'];
  const failed=['failed','failure','fail','error','cancelled','canceled','rejected','expired','timed_out','timeout','aborted','blocked','denied','not_found','task_not_found','resource_exhausted','resource_limited','quota_exceeded','content_moderated','content_rejected','moderated'];
  const videoUrl=String(first(data,['video_url','output_url','download_url','result_url','url','data.video_url','data.output_url','data.download_url','data.result_url','data.url','data.data.video_url','data.data.output_url','data.data.download_url','data.data.url','result.video_url','result.output_url','result.download_url','result.url','video.video_url','video.download_url','video.url','output.video_url','output.url','outputs.0.video_url','outputs.0.url','videos.0.video_url','videos.0.url','data.outputs.0.video_url','data.outputs.0.url','choices.0.message.content']));
  const result={status:failed.includes(raw)?'failed':success.includes(raw)||!raw&&/^https?:\/\/|^\//.test(videoUrl)?'completed':['pending','queued','submitted','not_start','not_started'].includes(raw)?'pending':'processing',videoUrl};
  const progress=Number.parseFloat(String(first(data,['progress','progress_percent','data.progress','data.progress_percent'])).replace('%',''));
  if(Number.isFinite(progress))result.progress=Math.max(0,Math.min(100,progress<=1?progress*100:progress));
  if(result.status==='failed')result.error=String(first(data,['error.message','error','fail_reason','failure_reason','error.detail','message','detail'].flatMap(field=>['','data.','data.data.','result.','video.','output.'].map(prefix=>prefix+field)))||`任务状态为 ${raw}`);
  return result;
}
function bridge(){if(!window.electronAPI?.yu25)throw new Error('YU25 接口组件未加载，请完全退出并重新打开软件');return window.electronAPI.yu25;}
function unpack(result){if(!result?.ok)throw Object.assign(new Error(result?.error||'YU25 请求失败'),{retryable:!!result?.retryable});return result.data;}
function check(signal){if(signal?.aborted)throw new DOMException('已取消','AbortError');}
export async function compressYu25Image(file){
  if(file.size>15*1024*1024)throw new Error('YU25 单张原始参考图片不能超过 15 MB');
  const bitmap=await createImageBitmap(file);
  try{
    const scale=Math.min(1,1920/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    for(const quality of [.90,.84,.78,.72,.66,.60,.54]){
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if(blob&&blob.size<=2*1024*1024)return new File([blob],'reference.jpg',{type:'image/jpeg'});
    }
    throw new Error('参考图片压缩后仍超过 2 MB，请缩小图片后重试');
  }finally{bitmap.close();}
}
export class Yu25Provider extends UnmauProvider{
  constructor(apiKey='',baseUrl=YU25_BASE){super(apiKey,baseUrl);this.downloadTimeoutMs=15*60*1000;this.compressImage=compressYu25Image;}
  setBaseUrl(url){this.baseUrl=(url||YU25_BASE).trim().replace(/\/+$/,'').replace(/\/v1$/,'');}
  validate(){if(this.baseUrl!==YU25_BASE)throw new Error('YU25 中转地址应为 https://api.yu25.xyz');if(!this.apiKey.trim())throw new Error('请在 YU25 中转站设置中填写该站的 API Key');}
  buildBody(data,refs){return buildYu25Body(data,refs);}
  assetMeta(body,data){return {model:body.model,prompt:body.prompt,aspect_ratio:data.ratio||'16:9',resolution:data.resolution||specs[body.model].resolutions.at(-1),duration:Number(body.video_duration??body.seconds)};}
  async request(path,body){this.validate();return unpack(await bridge().request({apiKey:this.apiKey,path,...body?{body}:{}}));}
  async testAuth(key){const previous=this.apiKey;this.apiKey=key;try{await this.request('/v1/models');return {success:true};}catch(error){return {success:false,error:error.message};}finally{this.apiKey=previous;}}
  async uploadAsset(url,readFile,signal,field='images'){
    this.validate();check(signal);if(/^https?:\/\//i.test(url))return url;
    if(!/image/i.test(field))throw new Error('YU25 sd2.5 仅支持图片参考');
    const kind='image';
    let file=await readFile(url);check(signal);
    file=await this.compressImage(file);
    const max=2;
    if(!file.size||file.size>max*1024*1024)throw new Error(`YU25 ${kind==='video'?'视频':kind==='audio'?'音频':'图片'}参考素材须非空且不超过 ${max} MB`);
    const extension=file.name.split('.').at(-1).toLowerCase();
    const bytes=new Uint8Array(await file.arrayBuffer());let binary='';
    for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
    check(signal);
    const mimeType={m4a:'audio/mp4',aac:'audio/aac',flac:'audio/flac'}[extension]||file.type;
    const raw=unpack(await bridge().upload({apiKey:this.apiKey,kind,data:btoa(binary),fileName:file.name,mimeType}));check(signal);
    const value=raw?.url||raw?.data?.url;if(!value)throw new Error('YU25 素材上传没有返回 URL');
    const hosted=new URL(value,YU25_BASE);if(!['https:','http:'].includes(hosted.protocol))throw new Error('YU25 返回的素材地址无效');return hosted.href;
  }
  async createTask(body){
    const data=await this.request('/v1/videos',body);
    const taskId=String(first(data,['task_id','id','request_id'].flatMap(field=>['','data.','data.data.','result.','video.','output.'].map(prefix=>prefix+field))));
    if(!taskId){const state=mapYu25Task(data);if(state.videoUrl&&state.status==='completed')return {taskId:'',videoUrl:state.videoUrl};throw new Error('YU25 未返回任务 ID，请先到平台确认任务是否创建，避免重复提交');}
    return {taskId};
  }
  async getTaskStatus(taskId){return mapYu25Task(await this.request(`/v1/videos/${encodeURIComponent(taskId)}`));}
  async download(taskId,videoUrl){this.validate();const data=unpack(await bridge().download({apiKey:this.apiKey,taskId,videoUrl}));return 'local-upload:///'+data.path.replace(/\\/g,'/');}
}
