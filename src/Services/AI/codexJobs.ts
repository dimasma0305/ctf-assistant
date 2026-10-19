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
export const getCodexJob=(jobId:string|undefined,scope:string,userId:string,signal?:AbortSignal)=>codexRequest<{ok:true;job:CodexPublicJob}>('/jobs/get',{jobId,scope,userId},{signal});
export const cancelCodexJob=(jobId:string|undefined,scope:string,userId:string,signal?:AbortSignal)=>codexRequest<{ok:true;job:CodexPublicJob}>('/jobs/cancel',{jobId,scope,userId},{signal});
export const completedCodexJobs=()=>codexRequest<{ok:true;jobs:CodexPublicJob[]}>('/jobs/completed',{});
export const markCodexJobDelivered=(jobId:string)=>codexRequest<{ok:true}>('/jobs/delivered',{jobId});
export const pendingCodexDiscordReads=()=>codexRequest<{ok:true;requests:CodexDiscordReadRequest[]}>('/jobs/context/pending',{});
export const respondCodexDiscordRead=(id:string,jobId:string,result:unknown)=>codexRequest<{ok:true}>('/jobs/context/respond',{id,jobId,result});

export function formatCodexResult(job:CodexPublicJob):string{
  const short=job.id.slice(0,8),model=job.model==='gpt-daybreak-blue-latest'?'Daybreak Blue':job.model==='gpt-6-luna'?'Luna':job.model==='gpt-6.1-sol'?'Sol':job.model||'Codex';
  const label=job.kind==='investigation'?'riset':'CTF';
  if(job.state==='failed')return `job ${label} \`${short}\` gagal di sandbox (${job.error||'worker_failed'}). kirim ulang kalau mau dicoba lagi.`;
  if(job.state==='cancelled')return `job ${label} \`${short}\` dibatalin.`;
  const result=job.result;if(!result)return `job ${label} \`${short}\` selesai tanpa hasil yang bisa dipakai.`;
  const parts=[`${job.kind==='investigation'?'🔎':'🧩'} **hasil ${model}** · job \`${short}\``,result.summary.trim()];
  if(result.flags.length)parts.push(`kandidat flag (belum dicek remote):\n${result.flags.map(flag=>`\`${flag.replace(/`/g,'')}\``).join('\n')}`);
  if(result.findings.length)parts.push(result.findings.slice(0,5).map(item=>`• ${item}`).join('\n'));
  if(job.sources?.length)parts.push(`sumber: ${job.sources.slice(0,2).map(source=>source.url).join(' · ')}`);
  if(result.unresolved.length)parts.push(`yang masih kebuka: ${result.unresolved.slice(0,3).join('; ')}`);
  return parts.join('\n\n').slice(0,1950);
}
