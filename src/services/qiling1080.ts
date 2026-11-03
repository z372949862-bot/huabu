import type { CreateTaskParams } from './ai-provider'
import type { ModelTemplate } from './modelTemplates'
import { readMediaDuration } from './providers/piapi'

// Based on Qiling public documentation read on 2026-11-03.
export const Qiling1080JS = 'SD2.5-满血-JS-1080P';
export const Qiling1080GF = 'SD2.5-满血-GF-1080P';
export function Qiling1080Supported(model: string) { return model === Qiling1080JS || model === Qiling1080GF; }
export function Qiling1080Body(input: CreateTaskParams): Record<string, any> {
  const js = input.model === Qiling1080JS;
  if (!Qiling1080Supported(input.model)) throw new Error('不支持的器灵1080P型号');
  const prompt = String(input.prompt || '').trim();
  if (!prompt) throw new Error('请输入视频提示词');
  const duration = Number(input.duration ?? 5);
  if (!Number.isInteger(duration) || duration < 4 || duration > 30) throw new Error('时长必须是4–30秒的整数');
  const ratio = !input.ratio || input.ratio === 'auto' ? '16:9' : input.ratio;
  const ratios = js ? ['16:9','9:16','1:1','4:3','3:4','21:9'] : ['16:9','4:3','1:1','3:4','9:16'];
  if (!ratios.includes(ratio)) throw new Error('该模型不支持所选画幅：' + ratio);
  const refs: Record<string, string[]> = { images: [], videos: [], audios: [] };
  const add = (kind: string, value?: string) => {
    if (!value) return;
    let parsed; try { parsed = new URL(value); } catch { throw new Error('参考素材必须是已上传的HTTPS链接'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('参考素材必须是已上传的HTTPS链接');
    if (!refs[kind].includes(value)) refs[kind].push(value);
  };
  add('images', input.image_url);
  for (const value of input.image_urls || []) add('images', value);
  for (const item of input.content || []) {
    const kind = ({ image_url:'images', video_url:'videos', audio_url:'audios' } as Record<string,string>)[item.type];
    const value = item.type === 'image_url' ? item.image_url : item.type === 'video_url' ? item.video_url : item.type === 'audio_url' ? item.audio_url : undefined;
    if (kind) add(kind, typeof value === 'string' ? value : value?.url);
  }
  const limits: Record<string, number> = js ? {images:30,videos:10,audios:10} : {images:10,videos:5,audios:5};
  for (const kind of Object.keys(refs)) if (refs[kind].length > limits[kind]) throw new Error(input.model + ' 的' + kind + '素材超过上限' + limits[kind]);
  const frame = input.qilingFrameMode;
  if (js && frame) throw new Error('JS-1080P不支持首帧或首尾帧模式，请使用参考生视频');
  if (!js && frame && (!['first_frame','first_last_frame'].includes(frame) || refs.images.length !== (frame === 'first_frame' ? 1 : 2) || refs.videos.length || refs.audios.length)) throw new Error('首帧需恰好1张图，首尾帧需恰好2张图，不能混入音视频');
  const body: Record<string, any> = {model:input.model,prompt,resolution:'1080p'};
  if (js) { body.duration=duration; body.ratio=ratio; }
  else {
    body.seconds=duration; body.aspect_ratio=ratio;
    body.mode=frame === 'first_frame' ? '首帧生视频' : frame === 'first_last_frame' ? '首尾帧' : Object.values(refs).some(x=>x.length) ? '参考生视频' : '文生视频';
  }
  for (const kind of Object.keys(refs)) if (refs[kind].length) body[kind]=refs[kind];
  return body;
}
export async function Qiling1080Create(request: (path: string, init: RequestInit, legacy: boolean) => Promise<any>, input: CreateTaskParams) {
  const body=Qiling1080Body(input);
  if(input.model===Qiling1080GF) {
    for(const kind of ['videos','audios']) {
      let total=0;
      for(const url of body[kind]||[]) {
        const seconds=await readMediaDuration(url,kind,undefined);
        if(!Number.isFinite(seconds)||seconds<=0) throw new Error('无法读取参考素材时长');
        total+=seconds;
      }
      if(total>15.05) throw new Error('GF参考'+(kind==='videos'?'视频':'音频')+'总时长不能超过15秒');
    }
  }
  const response=await request('/v1/videos',{method:'POST',body:JSON.stringify(body)},input.model===Qiling1080JS);
  const id=response?.id||response?.task_id||response?.request_id||response?.data?.id||response?.data?.task_id||response?.data?.request_id;
  if(!id) throw new Error('器灵未返回任务ID，请先到平台核对任务，避免重复生成');
  return {taskId:String(id)};
}
export const Qiling1080Models: ModelTemplate[] = [
  {id:Qiling1080JS,name:'SD2.5 满血 JS · 1080P',description:'1080P自带超分；4–30秒；30图/10视频/10音频；仅文生或参考生视频，不支持首尾帧。音视频请提供HTTPS链接。',capabilities:{ratios:['16:9','9:16','1:1','4:3','3:4','21:9'],resolutions:['1080p'],durationRange:{min:4,max:30},durationOptions:Array.from({length:27},(_,i)=>i+4),audioGeneration:false,maxImages:30,maxVideos:10,maxAudios:10}},
  {id:Qiling1080GF,name:'SD2.5 满血 GF · 1080P（Wan3.0）',description:'实际模型Wan3.0；4–30秒；10图/5视频/5音频；支持首尾帧。音视频分别合计≤15秒，须提供HTTPS链接。',capabilities:{ratios:['16:9','4:3','1:1','3:4','9:16'],resolutions:['1080p'],durationRange:{min:4,max:30},durationOptions:Array.from({length:27},(_,i)=>i+4),audioGeneration:false,maxImages:10,maxVideos:5,maxAudios:5}}
];
