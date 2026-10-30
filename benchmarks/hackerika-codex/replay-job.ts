import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { executeJob } from '../../scripts/codex-runner/executor';
import { newJob, validatePacket } from '../../scripts/codex-runner/protocol';

const option=(name:string)=>{const i=process.argv.indexOf(name);return i<0?'':process.argv[i+1];};
const source=option('--job-file'),out=option('--out');
if(!source||!out||await Bun.file(join(out,'result.json')).exists())throw Error('Use --job-file PRIVATE_JOB_JSON --out FRESH_PATH');
const original=JSON.parse(await readFile(source,'utf8'));
const job=newJob(validatePacket(original.packet));
const root=await mkdtemp('/tmp/hr-job-replay-');await mkdir(out,{recursive:true});
const started=Date.now(),skillReads=new Set<string>();
let result:Awaited<ReturnType<typeof executeJob>>|undefined, error:string|undefined;
try{
  result=await executeJob(job,'gpt-6-sol',root,AbortSignal.timeout(900_000),{
    onEvent:event=>{
      if(event.type!=='item.completed'||event.item?.type!=='command_execution')return;
      const item=event.item;
      if(item.exit_code===0&&item.aggregated_output)for(const name of ['resourceful-solve/SKILL.md','person-osint.md'])
        if(String(item.command).includes(name))skillReads.add(name);
      console.log(JSON.stringify({command:true,exit:item.exit_code,calls:job.stats.calls,searches:job.stats.searches,reads:job.stats.sourceReads}));
    },
  });
}catch(caught){error=String(caught instanceof Error?caught.message:caught);}
finally{await rm(root,{recursive:true,force:true});job.stats.elapsedMs=Date.now()-started;}
const checks={completed:!!result,peerCompatibilityUsed:(job.stats.peerMessagesAdapted||0)>0,
  researchSkillRead:skillReads.has('resourceful-solve/SKILL.md'),profileReferenceRead:skillReads.has('person-osint.md'),
  sources:job.sources.length>=3,citedAnswer:/https?:\/\//.test(result?.result.summary||''),modelCallsRecorded:job.stats.calls>0};
const pass=Object.values(checks).every(Boolean);
// Do not publish the original Discord packet, private chat, provider bodies,
// or internal reasoning. The report identifies the unchanged input by hash.
await writeFile(join(out,'result.json'),JSON.stringify({pass,checks,error,
  packetSha256:createHash('sha256').update(JSON.stringify(original.packet)).digest('hex'),
  scope:'Direct isolated worker replay; no production queue submission, Discord reads or Discord writes.',
  model:'gpt-6-sol',elapsedMs:Date.now()-started,stats:job.stats,inferenceFailure:job.inferenceFailure,
  sources:job.sources,summarySha256:result?createHash('sha256').update(result.result.summary).digest('hex'):undefined,
  unresolvedCount:result?.result.unresolved.length},null,2));
console.log(JSON.stringify({pass,checks,error,stats:job.stats}));
if(!pass)process.exitCode=1;
