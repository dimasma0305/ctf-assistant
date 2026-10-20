import http from 'node:http';

export type CodexRoute = 'auto'|'luna'|'sol'|'daybreak';
export interface CodexArtifact { name:string;data:string;image:boolean;sourceMessageId:string }
export interface CodexPublicJob {
  id:string;kind?:'ctf'|'investigation';state:'pending'|'running'|'completed'|'failed'|'cancelled';createdAt:number;updatedAt:number;deliveredAt?:number;model?:string;
  result?:{summary:string;flags:string[];findings:string[];unresolved:string[];needsStrongerModel:boolean};error?:string;
  stats:{calls:number;searches:number;sourceReads:number;visionReads:number;inputChars:number;outputBytes:number;elapsedMs:number;attempts:number};receiptCount:number;
  guildId:string;channelId:string;messageId:string;userId:string;
  sources:{url:string;title:string}[];
}
export interface CodexPacket {
  scope:string;guildId:string;channelId:string;messageId:string;userId:string;question:string;context:string;checkpoint?:unknown;kind?:'ctf'|'investigation';
  route:CodexRoute;artifacts:CodexArtifact[];
}
export interface CodexDiscordReadRequest {
  id:string;jobId:string;guildId:string;channelId:string;userId:string;sourceMessageId:string;
  kind:'recent'|'message';messageId?:string;before?:string;limit:number;includeImage:boolean;
}
const socket=()=>process.env.CODEX_CONTROL_SOCKET||'/run/hackerika-codex/control.sock';
export const codexSolverEnabled=()=>['1','true','yes','on'].includes((process.env.CODEX_SOLVER_ENABLED||'').trim().toLowerCase());

export async function codexRequest<T>(path:string,body:unknown,options:{socketPath?:string;signal?:AbortSignal}={}):Promise<T>{
  const payload=Buffer.from(JSON.stringify(body));
  if(payload.length>30*1024*1024)throw Error('codex_request_too_large');
  return await new Promise<T>((resolve,reject)=>{
    const request=http.request({socketPath:options.socketPath||socket(),path,method:'POST',headers:{'Content-Type':'application/json','Content-Length':payload.length}},response=>{
      const chunks:Buffer[]=[];let bytes=0;
      response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>512*1024){request.destroy(Error('codex_response_too_large'));return;}chunks.push(chunk);});
      response.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');if((response.statusCode||500)>=400)reject(Object.assign(Error(value.error||'codex_request_failed'),{status:response.statusCode,job:value.job}));else resolve(value);}catch(error){reject(error);}});
    });
    const timeout=setTimeout(()=>request.destroy(Error('codex_controller_timeout')),10_000);timeout.unref?.();
    const abort=()=>request.destroy(options.signal?.reason instanceof Error?options.signal.reason:Error('codex_request_aborted'));
    options.signal?.addEventListener('abort',abort,{once:true});
    request.on('close',()=>{clearTimeout(timeout);options.signal?.removeEventListener('abort',abort);});request.on('error',reject);request.end(payload);
  });
}
export const submitCodexJob=(packet:CodexPacket,signal?:AbortSignal)=>codexRequest<{ok:true;job:CodexPublicJob}>('/jobs',packet,{signal});
export const submitCodexJobBatch=(packets:CodexPacket[],signal?:AbortSignal)=>codexRequest<{ok:true;jobs:CodexPublicJob[]}>('/jobs/batch',{packets},{signal});
export const getCodexJob=(jobId:string|undefined,scope:string,userId:string,signal?:AbortSignal)=>codexRequest<{ok:true;job:CodexPublicJob}>('/jobs/get',{jobId,scope,userId},{signal});
export const cancelCodexJob=(jobId:string|undefined,scope:string,userId:string,signal?:AbortSignal)=>codexRequest<{ok:true;job:CodexPublicJob}>('/jobs/cancel',{jobId,scope,userId},{signal});
export const completedCodexJobs=()=>codexRequest<{ok:true;jobs:CodexPublicJob[]}>('/jobs/completed',{});
export const markCodexJobDelivered=(jobId:string)=>codexRequest<{ok:true}>('/jobs/delivered',{jobId});
export const pendingCodexDiscordReads=()=>codexRequest<{ok:true;requests:CodexDiscordReadRequest[]}>('/jobs/context/pending',{});
export const respondCodexDiscordRead=(id:string,jobId:string,result:unknown)=>codexRequest<{ok:true}>('/jobs/context/respond',{id,jobId,result});

export function formatCodexResult(job:CodexPublicJob):string{
  const label=job.kind==='investigation'?'riset':'CTF';
  if(job.state==='failed')return ['model_call_budget','input_budget'].includes(job.error||'')
    ? `${label==='CTF'?'Penyelidikan CTF':'Riset'} tadi kepotong sebelum kesimpulannya siap. Minta aku lanjutkan nanti ya; aku belum mau nebak dari bukti yang belum tuntas.`
    : `${label==='CTF'?'Penyelidikan CTF':'Riset'} tadi belum berhasil. Coba lagi sebentar ya.`;
  if(job.state==='cancelled')return `${label==='CTF'?'Penyelidikan CTF':'Riset'} tadi dibatalkan.`;
  const result=job.result;if(!result)return `${label==='CTF'?'Penyelidikan CTF':'Riset'} tadi belum menghasilkan jawaban yang bisa kupastikan.`;
  // The worker's findings and unresolved fields are internal evidence notes.
  // Only its explicitly user-facing answer belongs in the channel.
  const parts=[result.summary.trim()];
  if(result.flags.length)parts.push(`kandidat flag (belum dicek remote):\n${result.flags.map(flag=>`\`${flag.replace(/`/g,'')}\``).join('\n')}`);
  const sources=(job.sources||[]).map(source=>source.url).filter(url=>!result.summary.includes(url)).slice(0,2);
  if(sources.length)parts.push(`Sumber: ${sources.join(' · ')}`);
  return parts.join('\n\n').slice(0,1950);
}

export function isDeliveredCodexReply(message:{author?:{id?:string};reference?:{messageId?:string|null}|null;content?:string},
  botId:string|undefined,originalMessageId:string,content:string):boolean {
  return !!botId&&message.author?.id===botId&&message.reference?.messageId===originalMessageId&&message.content===content;
}
