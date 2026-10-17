import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chooseModel, newJob, promoteReceiptCandidates, publicJob, resultFromText, validatePacket } from './protocol';
import { workerArgs } from './executor';
import { startGateway } from './gateway';
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
