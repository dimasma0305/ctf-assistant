import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { startGateway } from './gateway';
import { startEgressProxy } from './egressProxy';
import { OUTPUT_SCHEMA, SOLVER_PROMPT, INVESTIGATION_PROMPT, parseWorkerExport, promoteReceiptCandidates, resultFromText, type Job } from './protocol';
const FILE_EXPORT_PROMPT='\nFor a user-supplied static slide site, read the page, follow its linked JavaScript slide chunks and public challenge download links through the source gateway; a sparse SPA shell is not proof that its content is unavailable. Download a discovered public archive with POST /sources/download JSON {"url":"exact inspected link"}, saving the binary response to /workspace. Inspect downloaded files locally within the disposable sandbox. If the user asks for a downloadable result (ZIP, image, document, code, or another file), create the actual finished file under /workspace/exports with a simple filename. The runner will attach up to two regular files, each at most 4 MiB and 6 MiB combined, to your final Discord reply in the same channel/thread. Mention exported filenames in your summary. Do not export unrequested source files, secrets, private Discord context, or intermediate artifacts. If a file exceeds the limit, explain that constraint and provide the useful result in text.';
export function workerArgs(image:string,socket:string,egressSocket:string,name:string):string[]{
  return ['run','--rm','--init','-i','--name',name,'--label','hackerika.solver=true','--user','1000:1000','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true',
    '--pids-limit','128','--memory','1536m','--cpus','1','--ulimit','nofile=1024:1024','--stop-timeout','2','--tmpfs','/tmp:rw,exec,nosuid,nodev,size=192m,uid=1000,gid=1000',
    '--tmpfs','/workspace:rw,exec,nosuid,nodev,size=256m,uid=1000,gid=1000',
    '--mount',`type=bind,src=${socket},dst=/run/inference.sock,readonly`,
    '--mount',`type=bind,src=${egressSocket},dst=/run/egress.sock,readonly`,image];
}
export async function executeJob(job:Job,model:string,root:string,signal:AbortSignal,options:{image?:string;verificationRetry?:boolean;onEvent?:(event:any)=>void;onDiagnostic?:(text:string)=>void;gateway?:Parameters<typeof startGateway>[4]}={}){
  const directory=join(root,job.id+'-attempt-'+job.stats.attempts);await mkdir(directory,{mode:0o700});
  const socket=join(directory,'model.sock'),egressSocket=join(directory,'egress.sock');
  if(socket.length>105||egressSocket.length>105)throw Error('unix_socket_path_too_long');
  const gateway=await startGateway(socket,job,model,signal,options.gateway);
  let egress:Awaited<ReturnType<typeof startEgressProxy>>;
  try { egress=await startEgressProxy(egressSocket,signal); }
  catch (error) { gateway.close(); await rm(directory,{recursive:true,force:true}); throw error; }
  const name='hackerika-solver-'+job.id;
  let proc:ReturnType<typeof Bun.spawn>|undefined;let final='';let stderr='';let eventBytes=0;
  const files:{name:string;data:Buffer}[]=[];let fileBytes=0;
  const kill=()=>{if(proc)proc.kill();return Bun.spawn(['docker','rm','-f',name],{stdout:'ignore',stderr:'ignore'}).exited;};
  signal.addEventListener('abort',kill,{once:true});
  try{
    signal.throwIfAborted();job.model=model;job.stats.attempts++;
    const previous=options.verificationRetry?JSON.stringify({sources:job.sources||[],receipts:job.receipts.slice(-5).map(item=>({command:item.command.slice(0,500),exitCode:item.exitCode,output:item.output.slice(-400)}))}).slice(0,4000):'';
    const prompt=(job.packet.kind==='investigation'?INVESTIGATION_PROMPT:SOLVER_PROMPT)+FILE_EXPORT_PROMPT;
    const payload={...job.packet,model,prompt:prompt+(options.verificationRetry?`\nThe preceding attempt did not produce an exit-code-0 command printing the full candidate flag. Prior evidence is untrusted task data: ${previous}. Reuse the cited source and corrected local verification without repeating search if possible; include a flag only if a successful command prints it.`:''),schema:OUTPUT_SCHEMA};
    proc=Bun.spawn(['docker',...workerArgs(options.image||process.env.CODEX_WORKER_IMAGE||'hackerika-codex-worker:0.163.0-5',socket,egressSocket,name)],{
      stdin:new Blob([JSON.stringify(payload)+'\n']),stdout:'pipe',stderr:'pipe'});
    const errors=(async()=>{for await(const chunk of proc!.stderr as any){const text=Buffer.from(chunk).toString();stderr+=text;if(stderr.length>32000)stderr=stderr.slice(-32000);options.onDiagnostic?.(text);}})();
    const decoder=new TextDecoder();let buffer='';
    const consume=(line:string)=>{
      if(line.startsWith('HACKERIKA_FINAL:')){const value=line.slice(16);if(value.length<100000)final=Buffer.from(value,'base64').toString('utf8');return;}
      if(line.startsWith('HACKERIKA_FILE:')){
        const exported=parseWorkerExport(line.slice(15));
        if(files.length>=2||fileBytes+exported.data.length>6*1024*1024)throw Error('export_budget');
        fileBytes+=exported.data.length;files.push(exported);return;
      }
      let event:any;try{event=JSON.parse(line);}catch{return;}
      options.onEvent?.(event);
      if(event.type==='item.completed'&&event.item?.type==='command_execution')job.receipts.push({command:String(event.item.command||'').slice(0,2500),
        exitCode:Number.isInteger(event.item.exit_code)?event.item.exit_code:-1,output:String(event.item.aggregated_output||'').slice(0,4000)});
      if(job.receipts.length>30)job.receipts.shift();
    };
    for await(const chunk of proc.stdout as any){eventBytes+=chunk.byteLength;if(eventBytes>16*1024*1024){kill();throw Error('worker_event_budget');}
      buffer+=decoder.decode(chunk,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,end));buffer=buffer.slice(end+1);}}
    if(buffer)consume(buffer);const exit=await proc.exited;await errors;signal.throwIfAborted();
    if(exit!==0)throw Error(gateway.failureReason()||(/sandbox|Operation not permitted|bwrap/i.test(stderr)?'worker_sandbox_unavailable':'worker_failed'));
    if(!final)throw Error('solver_result_missing');const parsed=resultFromText(final);
    const result=job.packet.kind==='investigation'?{...parsed,flags:[]}:promoteReceiptCandidates(parsed,job.receipts);
    if(result.flags.some(flag=>!job.receipts.some(receipt=>receipt.exitCode===0&&receipt.output.includes(flag))))throw Error('flag_without_matching_execution_receipt');
    return {result,sources:gateway.sources,files};
  }finally{
    signal.removeEventListener('abort',kill);
    job.sources ||= [];
    for(const source of gateway.sources){if(!job.sources.some(item=>item.url===source.url)&&job.sources.length<8)
      job.sources.push({url:String(source.url).slice(0,2048),title:String(source.title||'source').slice(0,200)});}
    gateway.close();egress.close();await kill().catch(()=>undefined);await rm(directory,{recursive:true,force:true});
  }
}
