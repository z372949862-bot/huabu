// @ts-nocheck
// New API video adapter. Protocol verified against newapis.unmau.com/docs.
export const UNMAU_BASE = 'https://newapis.unmau.com';
export const UNMAU_MODELS = [
  { id: '稳定-seedance-2.5-720p', name: '稳定 Seedance 2.5 · 720P',
    description: '稳定满血，4–30秒，30图/10视频/10音频参考，¥0.85/秒',
    capabilities: { ratios: ['16:9','9:16','1:1','4:3','3:4','21:9'], resolutions: ['720p'], durationRange: {min:4,max:30}, audioGeneration: true, maxImages:30, maxVideos:10, maxAudios:10 } },
  { id: '稳定-seedance-2.5-480p', name: '稳定 Seedance 2.5 · 480P',
    description: '稳定满血，4–30秒，30图/10视频/10音频参考，¥0.40/秒',
    capabilities: { ratios: ['16:9','9:16','1:1','4:3','3:4','21:9'], resolutions: ['480p'], durationRange: {min:4,max:30}, audioGeneration: true, maxImages:30, maxVideos:10, maxAudios:10 } },
  { id: '官方-seedance-2-5-720p', name: '官方 Seedance 2.5 · 720P',
    description: '官方渠道，4–30秒，30图/10视频/10音频参考，不卡人脸，¥1.00/秒',
    capabilities: { ratios: ['16:9','9:16','1:1','4:3','3:4','21:9'], resolutions: ['720p'], durationRange: {min:4,max:30}, audioGeneration: true, maxImages:30, maxVideos:10, maxAudios:10 } },
  { id: 'ad-seedance-2.5-720p', name: 'AD Seedance 2.5 · 720P',
    description: '稳定满血，4–30秒，30图/10视频/10音频参考，不卡人脸，¥0.90/秒',
    capabilities: { ratios: ['16:9','9:16','1:1','4:3','3:4','21:9'], resolutions: ['720p'], durationRange: {min:4,max:30}, audioGeneration: false, maxImages:30, maxVideos:10, maxAudios:10 } },
  { id: 'ad-seedance-2.5-480p', name: 'AD Seedance 2.5 · 480P',
    description: '稳定满血，4–30秒，30图/10视频/10音频参考，不卡人脸，¥0.40/秒',
    capabilities: { ratios: ['16:9','9:16','1:1','4:3','3:4','21:9'], resolutions: ['480p'], durationRange: {min:4,max:30}, audioGeneration: false, maxImages:30, maxVideos:10, maxAudios:10 } },
  { id: 'jd-seedance-2.5-720p', name: 'JD Seedance 2.5 · 720P',
    description: '4–30秒，30图/10视频/10音频参考，¥0.46/秒',
    capabilities: { ratios: ['16:9','9:16','1:1','4:3','3:4','21:9'], resolutions: ['720p'], durationRange: {min:4,max:30}, audioGeneration: false, maxImages:30, maxVideos:10, maxAudios:10 } },
  { id: 'jd-seedance-2.5-480p', name: 'JD Seedance 2.5 · 480P',
    description: '4–30秒，30图/10视频/10音频参考，¥0.33/秒',
    capabilities: { ratios: ['16:9','9:16','1:1','4:3','3:4','21:9'], resolutions: ['480p'], durationRange: {min:4,max:30}, audioGeneration: false, maxImages:30, maxVideos:10, maxAudios:10 } },
  { id: 'td-seedance-2.5-720p', name: 'TD Seedance 2.5 · 720P',
    description: '4–30秒，30图/10视频/10音频参考，¥4.60/次',
    capabilities: { ratios: ['16:9','9:16','1:1','4:3','3:4','21:9'], resolutions: ['720p'], durationRange: {min:4,max:30}, audioGeneration: false, maxImages:30, maxVideos:10, maxAudios:10 } },
  { id: 'xd-seedance-2.5-720p-301010', name: 'XD Seedance 2.5 · 720P · 30/10/10',
    description: '4–30秒，30图/10视频/10音频参考，¥5.30/次',
    capabilities: { ratios: ['16:9','9:16'], resolutions: ['720p'], durationRange: {min:4,max:30}, audioGeneration: false, maxImages:30, maxVideos:10, maxAudios:10 } },
  { id: 'xd-seedance-2.5-720p-101010', name: 'XD Seedance 2.5 · 720P · 10/10/10',
    description: '4–30秒，10图/10视频/10音频参考，¥3.30/次',
    capabilities: { ratios: ['16:9','9:16'], resolutions: ['720p'], durationRange: {min:4,max:30}, audioGeneration: false, maxImages:10, maxVideos:10, maxAudios:10 } },
  { id: 'md2-seedance-2.5-480p', name: 'MD2 Seedance 2.5 · 480P',
    description: '4–24秒，30图/10视频/10音频参考，卡真人，¥2.20/次',
    capabilities: { ratios: ['16:9','9:16'], resolutions: ['480p'], durationRange: {min:4,max:24}, audioGeneration: false, maxImages:30, maxVideos:10, maxAudios:10 } },
  { id: 'xd-seedance-2.5-720p', name: 'XD Seedance 2.5 · 720P · 9图',
    description: '4–30秒，最多9张参考图，不支持视频/音频参考，卡人脸，¥1.20/次；高峰约10–30分钟',
    capabilities: { ratios: ['16:9','9:16','1:1','4:3','3:4','21:9'], resolutions: ['720p'], durationRange: {min:4,max:30}, audioGeneration: false, maxImages:9, maxVideos:0, maxAudios:0 } }
];
export const isUnmauModel = id => UNMAU_MODELS.some(model => model.id === id);
const unique = values => [...new Set(values.filter(value => typeof value === 'string' && value.trim()))];
export function collectReferences(data, nodes = [], edges = [], nodeId) {
  const refs = {
    images: [...(data.inputImages || []), data.inputImage],
    videos: [...(data.inputVideos || []), data.inputVideo],
    audios: [...(data.inputAudios || []), data.inputAudio]
  };
  for (const edge of edges.filter(edge => edge.target === nodeId)) {
    const node = nodes.find(node => node.id === edge.source), d = node?.data;
    if (!d) continue;
    if (node.type === 'asset-ref' && d.assetUrl) {
      const field = {image:'images',video:'videos',audio:'audios'}[d.assetType || 'image'];
      if (field) refs[field].push(d.assetUrl);
    } else if (d.outputImage) refs.images.push(d.outputImage);
    else if (d.outputVideo) refs.videos.push(d.outputVideo);
    else if (d.outputAudio) refs.audios.push(d.outputAudio);
  }
  return Object.fromEntries(Object.entries(refs).map(([key, values]) => [key, unique(values)]));
}
export function buildUnmauBody(data, refs) {
  const model = UNMAU_MODELS.find(model => model.id === data.model);
  if (!model) throw new Error('请选择 New API 的 Seedance 2.5 模型');
  const prompt = (data.prompt || '').replace(/@\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
  if (!prompt) throw new Error('请输入视频提示词');
  const duration = Number(data.duration ?? 15);
  const {min,max} = model.capabilities.durationRange;
  if (!Number.isInteger(duration) || duration < min || duration > max) throw new Error(`${model.name} 的视频时长须为 ${min}–${max} 秒的整数`);
  const aspect_ratio = data.ratio || '16:9';
  if (!model.capabilities.ratios.includes(aspect_ratio)) throw new Error('请选择此模型支持的画面比例');
  const resolution = model.capabilities.resolutions[0];
  if (data.resolution && data.resolution.toLowerCase() !== resolution.toLowerCase()) throw new Error(`${model.name} 仅支持 ${resolution}`);
  const body = {model:model.id, prompt, duration, aspect_ratio, resolution};
  if (model.capabilities.audioGeneration) body.generate_audio = !!data.generateAudio;
  for (const [field, limit, label] of [['images','maxImages','参考图'],['videos','maxVideos','参考视频'],['audios','maxAudios','参考音频']]) {
    const values = unique(refs[field] || []), max = model.capabilities[limit];
    if (values.length > max) throw new Error(max ? `${model.name} 最多支持 ${max} 个${label}，当前 ${values.length} 个` : `${model.name} 不支持${label}，请移除素材或切换其他模型`);
    if (values.length) body[field] = values;
  }
  const imageCount = unique(refs.images || []).length;
  const mediaCount = unique([...(refs.videos || []), ...(refs.audios || [])]).length;
  if (mediaCount && !imageCount) throw new Error('使用参考视频或参考音频时，必须同时提供至少 1 张参考图片');
  return body;
}
function bridge() {
  if (!window.electronAPI?.unmau) throw new Error('接口组件未加载，请完全退出并重新打开软件');
  return window.electronAPI.unmau;
}
function aborted(signal) { if (signal?.aborted) throw new DOMException('已取消', 'AbortError'); }
function unpack(result) {
  if (!result?.ok) {
    const error = new Error(result?.error || 'New API 请求失败');
    error.retryable = !!result?.retryable;
    throw error;
  }
  return result.data;
}
export function mapUnmauTask(raw) {
  const data = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
  const status = String(data?.status || '').toLowerCase();
  const states = {queued:'pending',pending:'pending',in_progress:'processing',processing:'processing',running:'processing',completed:'completed',succeeded:'completed',success:'completed',done:'completed',failed:'failed',error:'failed',canceled:'failed',cancelled:'failed',timeout:'failed'};
  const progress = Number.parseFloat(String(data?.progress ?? '').replace('%',''));
  return {status:states[status] || 'processing', progress:Number.isFinite(progress) ? Math.min(100,Math.max(0,progress)) : undefined,
    error: typeof data?.error === 'string' ? data.error : data?.error?.message || data?.message || data?.failure_reason};
}
export class UnmauProvider {
  constructor(apiKey = '', baseUrl = UNMAU_BASE) { this.canResumeTask = true; this.setApiKey(apiKey); this.setBaseUrl(baseUrl); }
  setApiKey(key) { this.apiKey = key || ''; }
  setBaseUrl(url) { this.baseUrl = (url || UNMAU_BASE).trim().replace(/\/+$/, '').replace(/\/v1$/, ''); }
  validate() {
    if (this.baseUrl !== UNMAU_BASE) throw new Error('New API 中转地址应为 https://newapis.unmau.com');
    if (!this.apiKey.trim()) throw new Error('请在设置中填写 New API 的 API Key');
  }
  async request(path, body) {
    this.validate();
    return unpack(await bridge().request({apiKey:this.apiKey,path,...body ? {body} : {}}));
  }
  async testAuth(key) {
    const previous = this.apiKey; this.apiKey = key;
    try {
      const response = await this.request('/v1/models');
      const ids = (response.data || []).map(model => model.id);
      if (!ids.some(isUnmauModel)) return {success:false,error:'密钥验证成功，但未返回 Seedance 2.5 模型，请检查令牌分组或模型权限'};
      return {success:true};
    } catch (error) { return {success:false,error:error.message}; }
    finally { this.apiKey = previous; }
  }
  async uploadAsset(url, readFile, signal) {
    this.validate(); aborted(signal);
    if (/^https:\/\//i.test(url)) return url;
    const file = await readFile(url); aborted(signal);
    if (file.size > 20 * 1024 * 1024) throw new Error('单个参考素材不能超过 20 MB');
    const buffer = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < buffer.length; i += 32768) binary += String.fromCharCode(...buffer.subarray(i, i + 32768));
    aborted(signal);
    const raw = unpack(await bridge().upload({apiKey:this.apiKey,data:btoa(binary),fileName:file.name,mimeType:file.type}));
    aborted(signal);
    const uploaded = raw?.data || raw;
    if (!uploaded?.url) throw new Error('素材上传未返回 URL');
    const hosted = new URL(uploaded.url, UNMAU_BASE);
    if (hosted.protocol !== 'https:') throw new Error('素材上传返回了无效的 HTTPS 地址');
    return hosted.href;
  }
  async createTask(body) {
    const raw = await this.request('/v1/videos', body), data = raw?.data || raw;
    const taskId = data?.id || data?.task_id || data?.request_id;
    if (!taskId) throw new Error('创建任务未返回任务 ID，请先在平台确认任务状态，避免重复提交');
    return {taskId};
  }
  async getTaskStatus(id) { return mapUnmauTask(await this.request(`/v1/videos/${encodeURIComponent(id)}`)); }
  async download(id) {
    this.validate();
    const data = unpack(await bridge().download({apiKey:this.apiKey,taskId:id}));
    return 'local-upload:///' + data.path.replace(/\\/g, '/');
  }
}
const runs = new Map();
export function cancelUnmauNode(id) {
  const run = runs.get(id);
  if (run) { run.abort(); runs.delete(id); return true; }
  return false;
}
function delay(ms, signal) {
  return new Promise((resolve,reject) => {
    aborted(signal);
    const cancel = () => {clearTimeout(timer); reject(new DOMException('已取消','AbortError'));};
    const timer = setTimeout(() => {signal.removeEventListener('abort',cancel);resolve();},ms);
    signal.addEventListener('abort',cancel,{once:true});
  });
}
export async function runUnmauNode({id,data,nodes,edges,provider,readFile,update,complete,fail,isCurrent,persist,wait=delay,pollMs=10000,timeoutMs=60*60*1000}) {
  cancelUnmauNode(id);
  const controller = new AbortController(), signal = controller.signal;
  runs.set(id,controller);
  const current = () => !signal.aborted && runs.get(id) === controller && isCurrent();
  const check = () => { if (!current()) throw new DOMException('已取消','AbortError'); };
  try {
    const refs = collectReferences(data,nodes,edges,id), body = provider.buildBody ? provider.buildBody(data,refs) : buildUnmauBody(data,refs);
    const resumeTaskId = provider.canResumeTask && data.taskId ? String(data.taskId) : '';
    provider.validate();
    update({status:'running',progress:resumeTaskId ? 10 : 0,error:undefined,outputVideo:undefined,taskId:resumeTaskId || undefined});
    let taskId = resumeTaskId, directVideoUrl;
    if (!taskId) {
      for (const field of ['images','videos','audios','image_urls']) if (body[field]) {
        const uploaded = [];
        for (const url of body[field]) {check();uploaded.push(await provider.uploadAsset(url,readFile,signal,field));}
        body[field] = uploaded;
      }
      check();
      // Creation is never automatically retried: a lost response may still represent a billed task.
      const created = await provider.createTask(body);
      taskId = created.taskId; directVideoUrl = created.videoUrl;
      check(); update({taskId});
      if (persist) await persist();
    }
    const start = Date.now(); let transientErrors = 0, deliveryStarted = null;
    while (current()) {
      if(deliveryStarted !== null && Date.now()-deliveryStarted > provider.downloadTimeoutMs) throw new Error(`视频已生成，但 15 分钟内未取得完整成片，请保留任务 ID ${taskId} 并到平台下载；软件没有重新提交任务`);
      if (deliveryStarted === null && Date.now() - start > timeoutMs) throw new Error(`已等待 60 分钟，平台任务可能仍在运行。任务 ID：${taskId}；请到平台确认，避免重复付费提交`);
      await wait(Math.min(pollMs * 2 ** transientErrors,60000),signal); check();
      let state;
      try { state = directVideoUrl && !taskId ? {status:"completed",videoUrl:directVideoUrl} : await provider.getTaskStatus(taskId); transientErrors = 0; }
      catch (error) { if (error.retryable) {transientErrors=Math.min(transientErrors+1,3);continue;} throw error; }
      check();
      if (state.status === 'failed') {
        update({taskId:undefined});
        if (persist) await persist();
        throw new Error(state.error || '平台视频生成失败');
      }
      if (state.status === 'completed') {
        if(provider.downloadTimeoutMs && deliveryStarted === null){deliveryStarted=Date.now();update({progress:99});}
        let url;
        try {url=await provider.download(taskId,state.videoUrl);}
        catch(error) {if(error.retryable){transientErrors=Math.min(transientErrors+1,3);continue;}throw error;}
        check(); update({status:'completed',progress:100,outputVideo:url,error:undefined,taskId:undefined});
        if (persist) await persist();
        complete(url,provider.assetMeta ? provider.assetMeta(body,data) : body); return;
      }
      if (state.progress !== undefined) update({progress:Math.min(99,state.progress)});
    }
  } catch(error) { if(current() && error.name !== 'AbortError') fail(error.message || '视频生成失败'); }
  finally {if(runs.get(id)===controller)runs.delete(id);}
}
