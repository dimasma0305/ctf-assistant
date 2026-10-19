import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chooseModel, newJob, promoteReceiptCandidates, publicJob, resultFromText, validatePacket } from './protocol';
import { workerArgs } from './executor';
import { startGateway } from './gateway';
import { DiscordContextBroker } from './discordBroker';
import { ensureWorkerImage } from './workerImage';
import { codexRequest, formatCodexResult } from '../../src/Services/AI/codexJobs';

const packet=()=>({scope:'555555555555555555:700000000000000001',guildId:'555555555555555555',channelId:'700000000000000001',
  messageId:'800000000000000001',userId:'663394727688798231',question:'solve pwn exploit ini',context:'thread evidence',route:'auto' as const,artifacts:[]});

test('job packet validation and routing keep Daybreak owner-gated and Luna economical',()=>{
  const valid=validatePacket(packet());
  expect(chooseModel(valid,new Set(),new Set(['gpt-6-luna']))).toBe('gpt-6-luna');
  expect(chooseModel(valid,new Set([valid.userId]),new Set(['gpt-6-luna','gpt-daybreak-blue-latest']))).toBe('gpt-daybreak-blue-latest');
  expect(()=>chooseModel({...valid,route:'daybreak'},new Set(),new Set(['gpt-6-luna','gpt-daybreak-blue-latest']))).toThrow('daybreak_not_enabled');
  expect(()=>validatePacket({...packet(),scope:'other'})).toThrow('invalid_job_packet');
  expect(()=>validatePacket({...packet(),artifacts:[{name:'x',data:'not base64!',image:false,sourceMessageId:packet().messageId}]})).toThrow('invalid_artifact');
});

test('Docker worker arguments expose only disposable tmpfs and one inference socket',()=>{
  const args=workerArgs('worker:fixture','/run/jobs/model.sock','hackerika-solver-fixture');
  const joined=args.join(' ');
  for(const required of ['--network none','--read-only','--cap-drop ALL','no-new-privileges:true','--user 1000:1000','--pids-limit 128','/run/inference.sock'])expect(joined).toContain(required);
  expect(joined).not.toContain('/var/run/docker.sock');expect(joined).not.toContain('/root/app');expect(joined).not.toContain('credentials.json');
  expect(joined).toContain('/workspace:rw,exec,nosuid,nodev');
});

test('a missing pinned worker image is repaired before a job, while custom images are never built implicitly',async()=>{
  let present=false,builds=0;
  const dependencies={inspect:async()=>present,build:async()=>{builds++;present=true;return true;}};
  await ensureWorkerImage('hackerika-codex-worker:0.163.0-1',dependencies);
  expect(present).toBe(true);expect(builds).toBe(1);
  await ensureWorkerImage('hackerika-codex-worker:0.163.0-1',dependencies);
  expect(builds).toBe(1);
  present=false;
  await expect(ensureWorkerImage('custom:fixture',dependencies)).rejects.toThrow('worker_image_unavailable');
  expect(builds).toBe(1);
});

test('public job output hides challenge bytes and formats only validated solver fields',()=>{
  const job=newJob(validatePacket({...packet(),context:'PRIVATE-CONTEXT',artifacts:[{name:'x.txt',data:Buffer.from('PRIVATE-BYTES').toString('base64'),image:false,sourceMessageId:packet().messageId}]}));
  job.state='completed';job.model='gpt-6-luna';job.result=resultFromText(JSON.stringify({summary:'selesai',flags:['LabCTF{ok}','not-a-flag'],findings:['python verified'],unresolved:[],needsStrongerModel:false}));
  const exposed=JSON.stringify(publicJob(job));expect(exposed).not.toContain('PRIVATE');expect(exposed).not.toContain('data');
  const rendered=formatCodexResult(publicJob(job));expect(rendered).toContain('LabCTF{ok}');expect(rendered).not.toContain('not-a-flag');expect(rendered).toContain('belum dicek remote');
});

test('omitted flag is recovered only from explanatory prose and a successful proof command',()=>{
  const result=resultFromText(JSON.stringify({summary:'hasil LabCTF{pixel_compute_42}',flags:[],findings:[],unresolved:[],needsStrongerModel:false}));
  expect(promoteReceiptCandidates(result,[{command:'python',exitCode:1,output:'LabCTF{pixel_compute_42}'}]).flags).toEqual([]);
  expect(promoteReceiptCandidates(result,[{command:'python',exitCode:0,output:'LabCTF{other}'}]).flags).toEqual([]);
  expect(promoteReceiptCandidates(result,[{command:'python',exitCode:0,output:'LabCTF{pixel_compute_42}'}]).flags).toEqual(['LabCTF{pixel_compute_42}']);
});

test('bot control client communicates over a Unix socket without a TCP listener',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'codex-control-test-')),socket=join(directory,'control.sock');
  const server=Bun.serve({unix:socket,fetch:async request=>Response.json({ok:true,body:await request.json()})});
  try{expect(await codexRequest('/fixture',{scope:'local'},{socketPath:socket})).toEqual({ok:true,body:{scope:'local'}});}
  finally{server.stop(true);await rm(directory,{recursive:true,force:true});}
});

test('isolated source gateway rejects flags and bounds public searches before network access',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'codex-source-test-')),socket=join(directory,'source.sock');
  const gateway=await startGateway(socket,newJob(validatePacket(packet())),'gpt-6-luna',new AbortController().signal);
  try{
    await expect(codexRequest('/sources/search',{query:'LabCTF{private_flag}'},{socketPath:socket})).rejects.toThrow('invalid_or_private_query');
    await expect(codexRequest('/sources/search',{query:'Bearer secret'},{socketPath:socket})).rejects.toThrow('invalid_or_private_query');
    await expect(codexRequest('/sources/search',{query:'public third query'},{socketPath:socket})).rejects.toThrow('search_budget');
  }finally{gateway.close();await rm(directory,{recursive:true,force:true});}
});

test('worker can repeatedly request only scoped Discord reads through the bot broker',async()=>{
  const job=newJob(validatePacket(packet()));job.state='running';
  const broker=new DiscordContextBroker(),signal=new AbortController();
  const wait=broker.ask(job,{kind:'message',messageId:'800000000000000003',includeImage:true},signal.signal);
  const queued=broker.list();
  expect(queued).toHaveLength(1);expect(queued[0].channelId).toBe(job.packet.channelId);
  expect(queued[0].userId).toBe(job.packet.userId);
  expect(broker.respond(queued[0].id,'wrong-job',{ok:true})).toBe(false);
  expect(broker.respond(queued[0].id,job.id,{ok:true,messages:[{id:'800000000000000003',content:'clue'}]})).toBe(true);
  expect(await wait).toEqual({ok:true,messages:[{id:'800000000000000003',content:'clue'}]});
  expect(broker.list()).toHaveLength(0);
  expect(await broker.ask(job,{kind:'message',messageId:'invalid'},signal.signal)).toEqual({ok:false,error:'invalid_message_id'});
  const aborted=broker.ask(job,{kind:'recent',limit:20},signal.signal);signal.abort();
  expect(await aborted).toEqual({ok:false,error:'job_closed'});
  broker.clearJob(job.id);
});

test('isolated gateway forwards a Discord read without exposing a Discord credential',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'codex-discord-test-')),socket=join(directory,'gateway.sock');
  const job=newJob(validatePacket(packet()));job.state='running';const seen:unknown[]=[];
  const gateway=await startGateway(socket,job,'gpt-6-luna',new AbortController().signal,{discordRead:async query=>{seen.push(query);return {ok:true,messages:[]};}});
  try{
    expect(await codexRequest('/discord/read',{kind:'recent',limit:10},{socketPath:socket})).toEqual({ok:true,messages:[]});
    expect(seen).toEqual([{kind:'recent',limit:10}]);
  }finally{gateway.close();await rm(directory,{recursive:true,force:true});}
});

test('an on-demand Discord image is described through bounded Luna vision',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'codex-vision-test-')),socket=join(directory,'gateway.sock');
  const job=newJob(validatePacket(packet()));job.state='running';
  const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
  let calls=0;
  const gateway=await startGateway(socket,job,'gpt-6-luna',new AbortController().signal,{
    discordRead:async()=>({ok:true,messages:[],images:[{name:'clue.png',data:png.toString('base64'),image:true,sourceMessageId:packet().messageId}]}),
    credentials:async()=>({access_token:'fixture'}),
    fetcher:(async(_url,options)=>{calls++;const body=JSON.parse(String(options?.body));
      expect(body.model).toBe('gpt-6-luna');expect(body.input[0].content[1].image_url.startsWith('data:image/png;base64,')).toBe(true);
      const event={type:'response.completed',response:{status:'completed',output:[{type:'message',phase:'final_answer',content:[{type:'output_text',text:'Visible text: 7 + 35'}]}]}};
      return new Response(`data: ${JSON.stringify(event)}\n\n`,{headers:{'Content-Type':'text/event-stream'}});
    }) as unknown as typeof fetch,
  });
  try{
    const result=await codexRequest<{imageObservation:{ok:boolean;text:string}}>('/discord/read',{kind:'message',messageId:packet().messageId,includeImage:true,describeImage:true},{socketPath:socket});
    expect(result.imageObservation).toEqual({ok:true,text:'Visible text: 7 + 35',model:'gpt-6-luna'});
    const repeated=await codexRequest<{imageObservation:{cached:boolean;text:string}}>('/discord/read',{kind:'message',messageId:packet().messageId,includeImage:true,describeImage:true},{socketPath:socket});
    expect(repeated.imageObservation.cached).toBe(true);expect(repeated.imageObservation.text).toBe(result.imageObservation.text);
    expect(calls).toBe(1);expect(job.stats.visionReads).toBe(1);
  }finally{gateway.close();await rm(directory,{recursive:true,force:true});}
});
