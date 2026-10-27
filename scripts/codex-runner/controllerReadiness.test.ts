import { expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { codexRequest } from '../../src/Services/AI/codexJobs';

test('an unavailable worker is reported by health and rejected before creating a job',async()=>{
  const root=await mkdtemp(join(tmpdir(),'hr-ready-'));
  const bin=join(root,'bin'),state=join(root,'jobs'),socket=join(root,'control.sock');
  await mkdir(bin);
  // This controller fixture cannot talk to the real Docker daemon or launch
  // inference. Unexpected Docker operations fail rather than falling through.
  const docker=join(bin,'docker');
  await writeFile(docker,'#!/bin/sh\ncase "$1 $2" in\n  "ps -aq") exit 0 ;;\n  "image inspect") exit 1 ;;\n  *) exit 99 ;;\nesac\n');
  await chmod(docker,0o700);
  const child=Bun.spawn([process.execPath,join(import.meta.dir,'controller.ts')],{stdout:'ignore',stderr:'ignore',env:{...process.env,
    PATH:`${bin}:${process.env.PATH}`,CODEX_CONTROL_SOCKET:socket,CODEX_JOB_STATE_ROOT:state,CODEX_JOB_RUNTIME_ROOT:join(root,'runtime'),
    CODEX_WORKER_IMAGE:'missing:test-fixture'}});
  try{
    let health:Response|undefined;
    for(let attempt=0;attempt<50;attempt++){
      health=await fetch('http://localhost/health',{unix:socket}).catch(()=>undefined);
      if(health?.status===503&&(await health.clone().json()).worker?.state==='unavailable')break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    expect(health?.status).toBe(503);
    expect(await health!.json()).toMatchObject({ok:false,queued:0,running:false,worker:{ready:false,state:'unavailable'}});
    const packet={scope:'555555555555555555:700000000000000001',guildId:'555555555555555555',channelId:'700000000000000001',
      messageId:'800000000000000001',userId:'663394727688798231',question:'Riset situasi ekonomi terkini',context:'public research',kind:'investigation',route:'auto',artifacts:[]};
    await expect(codexRequest('/jobs',packet,{socketPath:socket})).rejects.toMatchObject({message:'worker_image_unavailable',status:503});
    expect((await readdir(state)).filter(name=>name.endsWith('.json'))).toEqual([]);
  }finally{child.kill('SIGTERM');await child.exited;await rm(root,{recursive:true,force:true});}
},10_000);
