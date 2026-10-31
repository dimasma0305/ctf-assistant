import {expect,test} from 'bun:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {codexRequest,normalizeCodexJobList,type CodexPublicJob} from './codexJobs';

const job=(id:string,state:CodexPublicJob['state']):CodexPublicJob=>({id,state,createdAt:1,updatedAt:1,objective:id,progress:[],steering:[],sources:[]});

test('legacy controller job lists are filtered and counted in the bot',()=>{
  const response={ok:true as const,jobs:[job('done','completed'),job('queued','pending'),job('live','running')]};
  expect(normalizeCodexJobList(response,'running')).toEqual({ok:true,state:'running',count:1,jobs:[response.jobs[2]]});
  expect(normalizeCodexJobList(response,'active')).toEqual({ok:true,state:'active',count:2,jobs:[response.jobs[1],response.jobs[2]]});
});

test('controller count is retained when pagination hides older matching jobs',()=>{
  const response={ok:true as const,state:'running' as const,count:3,jobs:[job('live','running')]};
  expect(normalizeCodexJobList(response,'running').count).toBe(3);
});

test('a controller startup race is recovered before reporting failure',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'hackerika-controller-recovery-')),socket=join(directory,'control.sock');
  let server:ReturnType<typeof Bun.serve>|undefined,requests=0;
  const start=setTimeout(()=>{server=Bun.serve({unix:socket,fetch(){requests++;return Response.json({ok:true});}});},20);
  try{
    expect(await codexRequest('/jobs',{scope:'fixture'},{socketPath:socket,recoveryDelays:[40]})).toEqual({ok:true});
    expect(requests).toBe(1);
  }finally{clearTimeout(start);server?.stop(true);await rm(directory,{recursive:true,force:true});}
});

test('an absent controller becomes a stable internal error instead of a URL hint',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'hackerika-controller-absent-')),socket=join(directory,'control.sock');
  try{await expect(codexRequest('/jobs',{scope:'fixture'},{socketPath:socket,recoveryDelays:[1]})).rejects.toMatchObject({message:'codex_controller_unavailable',code:'CODEX_CONTROLLER_UNAVAILABLE'});}
  finally{await rm(directory,{recursive:true,force:true});}
});
