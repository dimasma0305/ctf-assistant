import { chmod, chown, mkdir, open, readdir, readFile, rename, rm, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { chooseModel, hourlyLimitRetryAfterSeconds, newJob, publicJob, validateInvestigationBatch, validatePacket, type Job } from './protocol';
import { executeJob } from './executor';
import { DiscordContextBroker } from './discordBroker';
import { ensureWorkerImage } from './workerImage';
import { deleteExportedFiles, readExportedFile, saveExportedFiles } from './exports';

const socket = process.env.CODEX_CONTROL_SOCKET || '/run/hackerika-codex/control.sock';
const stateRoot = process.env.CODEX_JOB_STATE_ROOT || '/var/lib/hackerika-codex/jobs';
const runtimeRoot = process.env.CODEX_JOB_RUNTIME_ROOT || '/run/hackerika-codex-jobs';
const image = process.env.CODEX_WORKER_IMAGE || 'hackerika-codex-worker:0.163.0-5';
const maxQueued = Math.max(1, Math.min(16, Number(process.env.CODEX_MAX_QUEUED) || 8));
const hourlyLimit = Math.max(3, Math.min(30, Number(process.env.CODEX_JOBS_PER_USER_HOUR) || 3));
const trustedHourlyLimit = Math.max(3, Math.min(30, Number(process.env.CODEX_TRUSTED_JOBS_PER_USER_HOUR) || 12));
const ttlMs = 24 * 60 * 60_000;
const daybreakUsers = new Set((process.env.CODEX_DAYBREAK_USER_IDS || '').split(',').map(s=>s.trim()).filter(Boolean));
const verified = new Set((process.env.CODEX_VERIFIED_MODELS || 'gpt-6-luna').split(',').map(s=>s.trim()).filter(Boolean));
const jobs = new Map<string, Job>();
const queue: string[] = [];
const aborters = new Map<string, AbortController>();
const submissions = new Map<string, number[]>();
const discord = new DiscordContextBroker();
let running = false;

function file(id: string) { return join(stateRoot, `${id}.json`); }
async function persist(job: Job) {
  job.updatedAt = Date.now();
  const target=file(job.id), temporary=`${target}.${process.pid}.${randomUUID()}.tmp`;
  const handle=await open(temporary,'wx',0o600);
  try { await handle.writeFile(JSON.stringify(job)); await handle.sync(); } finally { await handle.close(); }
  try { await rename(temporary,target); await chmod(target,0o600); } finally { await unlink(temporary).catch(()=>{}); }
}
async function load() {
  await mkdir(stateRoot,{recursive:true,mode:0o700});await chmod(stateRoot,0o700);
  await mkdir(runtimeRoot,{recursive:true,mode:0o700});await chmod(runtimeRoot,0o700);
  for(const name of await readdir(stateRoot).catch(()=>[])) {
    if(!/^[0-9a-f-]{36}\.json$/.test(name)) continue;
    try {
      const job=JSON.parse(await readFile(join(stateRoot,name),'utf8')) as Job;
      if(Date.now()-job.updatedAt>ttlMs){await rm(join(stateRoot,name),{force:true});await deleteExportedFiles(stateRoot,name.slice(0,-5));continue;}
      if(job.state==='pending'||job.state==='running'){
        job.state='failed';job.error='controller_restarted';job.packet.artifacts=[];await persist(job);
      }
      jobs.set(job.id,job);
    } catch { await rm(join(stateRoot,name),{force:true}); }
  }
  for(const name of await readdir(stateRoot).catch(()=>[])){
    const match=/^([0-9a-f-]{36})\.files$/.exec(name);
    if(match&&(!jobs.has(match[1])||jobs.get(match[1])?.deliveredAt))await rm(join(stateRoot,name),{recursive:true,force:true});
  }
  const ps=Bun.spawn(['docker','ps','-aq','--filter','label=hackerika.solver=true'],{stdout:'pipe',stderr:'ignore'});
  const ids=(await new Response(ps.stdout).text()).trim().split(/\s+/).filter(Boolean);await ps.exited;
  if(ids.length) await Bun.spawn(['docker','rm','-f',...ids],{stdout:'ignore',stderr:'ignore'}).exited;
}
function response(value: unknown, status=200) { return Response.json(value,{status,headers:{'Cache-Control':'no-store'}}); }
async function json(request:Request){const text=await request.text();if(text.length>30*1024*1024)throw Error('body_too_large');return JSON.parse(text||'{}');}
function owner(body:any,job:Job){return body?.scope===job.packet.scope&&body?.userId===job.packet.userId;}
async function cleanup(){
  const cutoff=Date.now()-ttlMs;
  for(const [id,job] of jobs) if(job.updatedAt<cutoff&&!['pending','running'].includes(job.state)){
    jobs.delete(id);await rm(file(id),{force:true});await deleteExportedFiles(stateRoot,id);
  }
  for(const [key,times] of submissions){const fresh=times.filter(t=>t>Date.now()-60*60_000);fresh.length?submissions.set(key,fresh):submissions.delete(key);}
}
function schedule(){if(!running)void runNext().catch(error=>console.error('[CodexController] scheduler failed:',String(error?.message||error).slice(0,120)));}
async function runNext(){
  const id=queue.shift();if(!id){running=false;return;}running=true;
  const job=jobs.get(id);if(!job||job.state!=='pending'){running=false;schedule();return;}
  const controller=new AbortController();aborters.set(id,controller);job.state='running';
  const started=Date.now();
  try{
    await persist(job);
    const model=chooseModel(job.packet,daybreakUsers,verified);
    await ensureWorkerImage(image);
    const deadline=AbortSignal.any([controller.signal,AbortSignal.timeout(300_000)]);
    let result:Awaited<ReturnType<typeof executeJob>>|undefined;
    for(let attempt=0;attempt<2;attempt++){
      try{result=await executeJob(job,model,runtimeRoot,deadline,{image,verificationRetry:attempt===1,
        gateway:{discordRead:query=>discord.ask(job,query,deadline)}});break;}
      catch(error:any){if(attempt!==0||String(error?.message)!=='flag_without_matching_execution_receipt'||deadline.aborted||job.stats.calls>=8)throw error;}
    }
    if(!result)throw Error('solver_result_missing');
    job.result=result.result;
    if(result.files.length){
      try{
        job.exportedFiles=await saveExportedFiles(stateRoot,job.id,result.files);
      }catch{
        job.result.summary=`${job.result.summary}\nFile hasil agent tidak bisa disimpan untuk dikirim.`.slice(0,1800);
      }
    }
    job.state='completed';
  }catch(error:any){job.state=controller.signal.aborted?'cancelled':'failed';job.error=String(error?.message||'solver_failed').slice(0,120);}
  finally{
    discord.clearJob(id);job.stats.elapsedMs+=Date.now()-started;job.packet.artifacts=[];aborters.delete(id);
    try{await persist(job);await cleanup();}finally{running=false;schedule();}
  }
}
await load();await rm(socket,{force:true});await mkdir(dirname(socket),{recursive:true,mode:0o750});await chmod(dirname(socket),0o750);
const socketGid=Math.max(0,Number(process.env.CODEX_SOCKET_GID)||1000);if(process.getuid?.()===0)await chown(dirname(socket),0,socketGid);
const server=Bun.serve({unix:socket,maxRequestBodySize:30*1024*1024,async fetch(request){
  try{
    const path=new URL(request.url).pathname;
    if(request.method==='GET'&&path==='/health')return response({ok:true,queued:queue.length,running,verified:[...verified]});
    if(request.method!=='POST')return response({ok:false,error:'method_not_allowed'},405);
    const body=await json(request);
    if(path==='/jobs/context/pending')return response({ok:true,requests:discord.list()});
    if(path==='/jobs/context/respond')return typeof body?.id==='string'&&typeof body?.jobId==='string'&&discord.respond(body.id,body.jobId,body.result)
      ?response({ok:true}):response({ok:false,error:'request_expired'},404);
    if(path==='/jobs/file'){
      const job=typeof body?.jobId==='string'?jobs.get(body.jobId):undefined;
      const index=body?.index;
      if(!job||!owner(body,job)||job.state!=='completed'||job.deliveredAt||!Number.isInteger(index)||index<0||index>1)
        return response({ok:false,error:'file_not_found'},404);
      const item=job.exportedFiles?.find(file=>file.index===index);
      if(!item)return response({ok:false,error:'file_not_found'},404);
      let data:Buffer;
      try{data=await readExportedFile(stateRoot,job.id,item);}catch{return response({ok:false,error:'file_corrupt'},409);}
      return response({ok:true,name:item.name,size:item.size,sha256:item.sha256,data:data.toString('base64')});
    }
    if(path==='/jobs'||path==='/jobs/batch'){
      const packets=path==='/jobs/batch'?validateInvestigationBatch(body):[validatePacket(body)];
      const packet=packets[0];await cleanup();
      const outstanding=[...jobs.values()].filter(j=>j.packet.scope===packet.scope&&['pending','running'].includes(j.state));
      if(outstanding.length)return response({ok:false,error:'channel_job_active',job:publicJob(outstanding[0])},409);
      if(queue.length+(running?1:0)+packets.length>maxQueued)return response({ok:false,error:'queue_full'},429);
      const key=`${packet.guildId}:${packet.userId}`,recent=(submissions.get(key)||[]).filter(t=>t>Date.now()-60*60_000);
      const limit=daybreakUsers.has(packet.userId)?trustedHourlyLimit:hourlyLimit;
      const retryAfterSeconds=hourlyLimitRetryAfterSeconds(recent,packets.length,limit,Date.now());
      if(retryAfterSeconds!==null){
        return response({ok:false,error:'user_hourly_limit',limit,retryAfterSeconds},429);
      }
      for(const entry of packets)chooseModel(entry,daybreakUsers,verified);
      const created=packets.map(newJob);
      for(const job of created){jobs.set(job.id,job);queue.push(job.id);}
      submissions.set(key,[...recent,...created.map(job=>job.createdAt)]);
      try{await Promise.all(created.map(persist));}
      catch(error){
        for(const job of created){jobs.delete(job.id);const index=queue.indexOf(job.id);if(index>=0)queue.splice(index,1);await rm(file(job.id),{force:true});}
        recent.length?submissions.set(key,recent):submissions.delete(key);
        throw error;
      }
      schedule();
      return response(path==='/jobs/batch'?{ok:true,jobs:created.map(publicJob)}:{ok:true,job:publicJob(created[0])},202);
    }
    const matching=[...jobs.values()].filter(candidate=>owner(body,candidate)).sort((a,b)=>b.createdAt-a.createdAt);
    const job=typeof body?.jobId==='string'&&body.jobId?jobs.get(body.jobId)
      :path==='/jobs/cancel'?matching.find(candidate=>['pending','running'].includes(candidate.state)):matching[0];
    if(path==='/jobs/get')return job&&owner(body,job)?response({ok:true,job:publicJob(job)}):response({ok:false,error:'not_found'},404);
    if(path==='/jobs/cancel'){
      if(!job||!owner(body,job))return response({ok:false,error:'not_found'},404);
      if(job.state==='pending'){job.state='cancelled';job.packet.artifacts=[];const i=queue.indexOf(job.id);if(i>=0)queue.splice(i,1);await persist(job);return response({ok:true,job:publicJob(job)});}
      if(job.state==='running'){aborters.get(job.id)?.abort();return response({ok:true,job:publicJob(job)},202);}
      return response({ok:false,error:'not_active',job:publicJob(job)},409);
    }
    if(path==='/jobs/completed')return response({ok:true,jobs:[...jobs.values()].filter(j=>['completed','failed','cancelled'].includes(j.state)&&!j.deliveredAt).map(publicJob).slice(0,20)});
    if(path==='/jobs/delivered'){
      if(!job)return response({ok:false,error:'not_found'},404);
      job.deliveredAt=Date.now();await persist(job);await deleteExportedFiles(stateRoot,job.id);return response({ok:true});
    }
    return response({ok:false,error:'not_found'},404);
  }catch(error:any){return response({ok:false,error:String(error?.message||'request_failed').slice(0,120)},400);}
}});
await chmod(socket,0o660);if(process.getuid?.()===0)await chown(socket,0,socketGid);
setInterval(()=>void cleanup().catch(error=>console.warn('[CodexController] cleanup failed:',String(error?.message||error).slice(0,120))),60*60_000).unref?.();
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{for(const abort of aborters.values())abort.abort();server.stop(true);process.exit(0);});
console.log(`[CodexController] ready socket=${socket} verified=${[...verified].join(',')}`);
