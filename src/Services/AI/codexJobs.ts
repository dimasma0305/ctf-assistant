import http from 'node:http';

export type CodexRoute = 'auto'|'luna'|'sol'|'daybreak';
export interface CodexArtifact { name:string;data:string;image:boolean;sourceMessageId:string }
export interface CodexPublicJob {
  id:string;kind?:'ctf'|'investigation';imageMode?:'auto'|'generative'|'vector';state:'pending'|'running'|'completed'|'failed'|'cancelled';createdAt:number;updatedAt:number;deliveredAt?:number;model?:string;
  result?:{summary:string;flags:string[];findings:string[];unresolved:string[];needsStrongerModel:boolean};error?:string;
  stats:{calls:number;searches:number;sourceReads:number;visionReads:number;inputChars:number;outputBytes:number;elapsedMs:number;attempts:number};receiptCount:number;
  guildId:string;channelId:string;messageId:string;userId:string;
  sources:{url:string;title:string}[];
  exportedFiles?:{index:number;name:string;size:number;sha256:string}[];
}
export interface CodexPacket {
  scope:string;guildId:string;channelId:string;messageId:string;userId:string;question:string;context:string;checkpoint?:unknown;kind?:'ctf'|'investigation';
  route:CodexRoute;imageMode?:'auto'|'generative'|'vector';artifacts:CodexArtifact[];
}
export interface CodexDiscordReadRequest {
  id:string;jobId:string;guildId:string;channelId:string;userId:string;sourceMessageId:string;
  kind:'recent'|'message';messageId?:string;before?:string;limit:number;includeImage:boolean;
  includeFile?:boolean;fileName?:string;
}
const socket=()=>process.env.CODEX_CONTROL_SOCKET||'/run/hackerika-codex/control.sock';
export const codexSolverEnabled=()=>['1','true','yes','on'].includes((process.env.CODEX_SOLVER_ENABLED||'').trim().toLowerCase());

export async function codexRequest<T>(path:string,body:unknown,options:{socketPath?:string;signal?:AbortSignal;maxResponseBytes?:number}={}):Promise<T>{
  const payload=Buffer.from(JSON.stringify(body));
  if(payload.length>30*1024*1024)throw Error('codex_request_too_large');
  return await new Promise<T>((resolve,reject)=>{
    const request=http.request({socketPath:options.socketPath||socket(),path,method:'POST',headers:{'Content-Type':'application/json','Content-Length':payload.length}},response=>{
      const chunks:Buffer[]=[];let bytes=0;
      response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>(options.maxResponseBytes||512*1024)){request.destroy(Error('codex_response_too_large'));return;}chunks.push(chunk);});
      response.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');if((response.statusCode||500)>=400)reject(Object.assign(Error(value.error||'codex_request_failed'),{status:response.statusCode,job:value.job,retryAfterSeconds:value.retryAfterSeconds,limit:value.limit}));else resolve(value);}catch(error){reject(error);}});
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
export const getCodexJobFile=(job:CodexPublicJob,index:number)=>codexRequest<{ok:true;name:string;size:number;sha256:string;data:string}>('/jobs/file',
  {jobId:job.id,index,scope:`${job.guildId}:${job.channelId}`,userId:job.userId},{maxResponseBytes:6*1024*1024});
export const markCodexJobDelivered=(jobId:string)=>codexRequest<{ok:true}>('/jobs/delivered',{jobId});
export const pendingCodexDiscordReads=()=>codexRequest<{ok:true;requests:CodexDiscordReadRequest[]}>('/jobs/context/pending',{});
export const respondCodexDiscordRead=(id:string,jobId:string,result:unknown)=>codexRequest<{ok:true}>('/jobs/context/respond',{id,jobId,result});

export function formatCodexResult(job:CodexPublicJob):string{
  const label=job.kind==='investigation'?'riset':'CTF';
  if(job.state==='failed'&&job.error==='worker_image_unavailable')
    return 'Lingkungan agenku gagal disiapkan, jadi pekerjaan tadi belum sempat berjalan. Ini gangguan di sisiku; belum ada hasil yang bisa kubagikan.';
  if(job.state==='failed'&&(job.imageMode||['image_generation_unavailable','image_api_key_invalid'].includes(job.error||''))){
    if(job.error==='image_generation_unavailable')return 'Belum bisa pakai image gen: kunci API gambar belum dikonfigurasi. Gambar kode yang tadi memang metode berbeda, dan aku nggak akan mengirimnya sebagai pengganti image gen.';
    if(job.error==='image_api_key_invalid')return 'Belum bisa pakai image gen: kunci API gambar yang terpasang ditolak layanan. Belum ada file gambar yang berhasil dibuat.';
    if(job.error==='image_api_limit')return 'Image gen sedang kena batas pemakaian. Belum ada file gambar yang berhasil dibuat.';
    if(job.error==='image_request_rejected')return 'Image gen menolak permintaan gambar ini. Belum ada file gambar yang berhasil dibuat.';
    return 'Gambar kali ini belum berhasil dibuat atau dikirim. Aku belum punya file jadi untuk ditunjukkan.';
  }
  if(job.state==='failed')return ['model_call_budget','input_budget'].includes(job.error||'')
    ? `${label==='CTF'?'Penyelidikan CTF':'Riset'} tadi kepotong sebelum kesimpulannya siap. Minta aku lanjutkan nanti ya; aku belum mau nebak dari bukti yang belum tuntas.`
    : ['subscription_sharing_unsupported_capability','subscription_agent_message_invalid'].includes(job.error||'')
    ? 'Agen sudah mulai, tetapi sambungan ke model menolak format pesan yang dikirim. Ini masalah integrasi di sisiku; pekerjaannya belum selesai.'
    : job.error==='subscription_sharing_usage_limit_exceeded'
    ? 'Pekerjaan agen terhenti karena batas pemakaian ChatGPT untuk koneksi ini tercapai. Hasilnya belum tuntas.'
    : `${label==='CTF'?'Penyelidikan CTF':'Riset'} tadi terhenti karena gangguan saat menjalankan agen. Aku belum punya kesimpulan yang terverifikasi dari pekerjaan ini.`;
  if(job.state==='cancelled')return `${label==='CTF'?'Penyelidikan CTF':'Riset'} tadi dibatalkan.`;
  const result=job.result;if(!result)return `${label==='CTF'?'Penyelidikan CTF':'Riset'} tadi belum menghasilkan jawaban yang bisa kupastikan.`;
  // The worker's findings and unresolved fields are internal evidence notes.
  // Only its explicitly user-facing answer belongs in the channel.
  const summary=result.summary.trim()
    .replace(/\[([^\]]+)\]\(<?(?:file:\/\/)?\/workspace\/exports\/[A-Za-z0-9._-]+>?\)/g,'$1')
    .replace(/(?:file:\/\/)?\/workspace\/exports\/([A-Za-z0-9._-]+)/g,'$1');
  const parts=[summary];
  if(result.flags.length)parts.push(`kandidat flag (belum dicek remote):\n${result.flags.map(flag=>`\`${flag.replace(/`/g,'')}\``).join('\n')}`);
  const sources=(job.sources||[]).map(source=>source.url).filter(url=>!result.summary.includes(url)).slice(0,2);
  if(sources.length)parts.push(`Sumber: ${sources.join(' · ')}`);
  return parts.join('\n\n');
}

/** Discord messages are bounded, but the answer is not discarded. Prefer
 * paragraph/word boundaries and keep ordinary citation links in one part. */
export function splitCodexReply(text:string,limit=1950):string[]{
  const parts:string[]=[];let remaining=text.trim(),fence:string|null=null;
  while(remaining){
    const prefix=fence===null?'':`\`\`\`${fence}\n`;
    const capacity=limit-prefix.length-8;
    let cut=Math.min(remaining.length,capacity);
    if(cut<remaining.length){
      const head=remaining.slice(0,cut);
      const paragraph=head.lastIndexOf('\n\n'),line=head.lastIndexOf('\n'),space=head.lastIndexOf(' ');
      cut=paragraph>capacity/3?paragraph:line>capacity/3?line:space>0?space:cut;
      // The split must precede a citation, including spaces in its label.
      for(const match of remaining.matchAll(/!?\[[^\]\n]*\]\([^\n]*?\)|https?:\/\/[^\s<>]+/g)){
        if(match.index!>=cut)break;
        if(match.index!<cut&&match.index!+match[0].length>cut&&match.index!>0){cut=match.index!;break;}
      }
      if(cut>0&&/[\uD800-\uDBFF]/.test(remaining[cut-1])&&/[\uDC00-\uDFFF]/.test(remaining[cut]))cut--;
    }
    const chunk=remaining.slice(0,cut).trimEnd();const tail=remaining.slice(cut);
    for(const match of chunk.matchAll(/^```([^\n]*)$/gm))fence=fence===null?match[1].trim().slice(0,80):null;
    remaining=fence===null?tail.trimStart():tail.replace(/^\r?\n/,'');
    parts.push(prefix+chunk+(fence===null?'':'\n```'));
  }
  return parts;
}

export function isDeliveredCodexReply(message:{author?:{id?:string};reference?:{messageId?:string|null}|null;content?:string},
  botId:string|undefined,originalMessageId:string,content:string):boolean {
  return !!botId&&message.author?.id===botId&&message.reference?.messageId===originalMessageId&&message.content===content;
}
