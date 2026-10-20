import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeJob } from '../../scripts/codex-runner/executor';
import { newJob, SOLVER_PROMPT } from '../../scripts/codex-runner/protocol';

const option=(name:string)=>{const index=process.argv.indexOf(name);return index<0?'':process.argv[index+1];};
const out=option('--out'),filter=option('--case');if(!out||await Bun.file(join(out,'protocol.json')).exists())throw Error('Use --out FRESH_PATH');
await mkdir(out,{recursive:true});const runtime=await mkdtemp(join(tmpdir(),'hackerika-codex-benchmark-'));
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const c=`#include <stdio.h>\n#include <unistd.h>\n__attribute__((noinline)) void win(void){puts("BlueCTF{ret2win_local_0x41}");}\n__attribute__((noinline)) void vuln(void){char x[64];read(0,x,200);}\nint main(void){setbuf(stdout,NULL);vuln();return 0;}\n`;
try{
  const source=join(runtime,'ret2win.c'),binary=join(runtime,'ret2win');await writeFile(source,c);
  const compile=Bun.spawn(['gcc','-O0','-fno-stack-protector','-no-pie','-Wno-stringop-overflow','-o',binary,source],{stdout:'ignore',stderr:'pipe'});
  if(await compile.exited!==0)throw Error('fixture_compile_failed:'+await new Response(compile.stderr).text());
  const image=await readFile('benchmarks/hackerika-ctf/vision-clue.png');
  const allCases=[
    {id:'luna-hex-execution',model:'gpt-6-luna',route:'luna' as const,expected:'LabCTF{isolated_python_731}',requireSkill:'ctf-deep-solve/SKILL.md',question:'Use the installed ctf-deep-solve skill. Decode the authorized toy CTF hex with Python and verify by re-encoding.',context:'Original hex: '+Buffer.from('LabCTF{isolated_python_731}').toString('hex'),artifacts:[]},
    {id:'luna-image-compute',model:'gpt-6-luna',route:'luna' as const,expected:'LabCTF{pixel_compute_42}',question:'Read the exact ciphertext from the supplied authorized CTF image, compute its decode with Python, verify it, and report the flag.',context:'The image is the original challenge clue.',artifacts:[{name:'vision-clue.png',data:image.toString('base64'),image:true}]},
    {id:'luna-public-source',model:'gpt-6-luna',route:'luna' as const,expected:'LabCTF{rot-13}',requireSource:'docs.python.org',question:'Use the local public search gateway to find official Python documentation for the ROT13 codec and read the cited source. Then use Python codecs.lookup to obtain the canonical runtime codec name and print the complete toy flag LabCTF{<canonical runtime codec name>} in a successful command. Preserve any hyphen in the canonical name; do not rely on memory alone.',context:'Authorized public documentation puzzle. No private material.',artifacts:[]},
    {id:'luna-discord-followup',model:'gpt-6-luna',route:'luna' as const,expected:'LabCTF{fresh_thread_clue_29}',requireDiscord:true,
      question:'Solve this authorized toy CTF. The exact new hex clue was posted in the same Discord thread after this job began; ask Hackerika for recent thread messages, decode the new hex with Python, verify the full flag by re-encoding, then report it.',
      context:'Starter: a teammate will post the exact hex shortly; do not guess it from this starter.',artifacts:[]},
    {id:'luna-discord-image',model:'gpt-6-luna',route:'luna' as const,expected:'LabCTF{pixel_compute_42}',requireDiscord:true,discordImage:true,
      question:'Solve this authorized toy CTF. A teammate posted the original image clue in the same Discord thread after this job began. Ask Hackerika for its actual image bytes and imageObservation (set includeImage and describeImage true), save the bytes as a file, inspect the observed text, compute and verify the full flag with Python.',
      context:'Starter has no image or ciphertext. The later Discord upload is the only original clue.',artifacts:[]},
    {id:'daybreak-ret2win',model:'gpt-daybreak-blue-latest',route:'daybreak' as const,expected:'BlueCTF{ret2win_local_0x41}',question:'Solve this authorized local pwn ELF. Derive and execute a ret2win payload, then report the printed flag.',context:'Deliberately vulnerable local CTF binary. No remote target or checker.',artifacts:[{name:'ret2win',data:(await readFile(binary)).toString('base64'),image:false}]},
  ];
  const cases=filter?allCases.filter(test=>test.id===filter):allCases;if(!cases.length)throw Error('unknown_benchmark_case');
  const protocol={startedAt:new Date().toISOString(),workerImage:process.env.CODEX_WORKER_IMAGE||'hackerika-codex-worker:0.163.0-4',codexVersion:'0.163.0',
    promptHash:hash(SOLVER_PROMPT),caseIds:cases.map(test=>test.id),fixtureHashes:{image:hash(image),ret2win:hash(await readFile(binary))},
    limits:{sequential:true,maxSecondsPerCase:180,maxModelCalls:10,maxInputChars:1_200_000},
    acceptance:'Exact expected flag must appear in final structured output and in stdout of a successful local command receipt. The public-source case additionally requires a primary source read through the gateway.',
    scope:'Real ChatGPT-plan inference through the credential broker and fresh network-none Docker workers. The host gateway may search and read public sources; workers have no direct network. Synthetic authorized fixtures only; no Discord sends, remote targets, or checker submissions.'};
  await writeFile(join(out,'protocol.json'),JSON.stringify(protocol,null,2));const results:any[]=[];
  for(const [index,test] of cases.entries()){
    const messageId=String(800000000000000100n+BigInt(index)),channelId=String(700000000000000100n+BigInt(index));
    const job=newJob({scope:`555555555555555555:${channelId}`,guildId:'555555555555555555',channelId,messageId,userId:'663394727688798231',
      route:test.route,question:test.question,context:test.context,artifacts:test.artifacts.map(artifact=>({...artifact,sourceMessageId:messageId}))});
    const started=performance.now();let row:any,diagnostics='',discordReads=0;
    try{
      const signal=AbortSignal.timeout(180_000);let solved:Awaited<ReturnType<typeof executeJob>>|undefined;
      for(let attempt=0;attempt<2;attempt++){
        try{solved=await executeJob(job,test.model,runtime,signal,{verificationRetry:attempt===1,onDiagnostic:text=>{diagnostics=(diagnostics+text).slice(-4000);},
          ...('requireDiscord' in test?{gateway:{discordRead:async()=>{discordReads++;return {ok:true,scope:{guildId:job.packet.guildId,channelId:job.packet.channelId},
            messages:[{id:'800000000000000999',channelId:job.packet.channelId,authorId:'663394727688798233',authorName:'teammate',isBot:false,
              sentAt:Date.now(),content:'discordImage' in test?'image clue uploaded':'new clue hex: '+Buffer.from('LabCTF{fresh_thread_clue_29}').toString('hex'),
              embeds:[],attachments:'discordImage' in test?[{name:'vision-clue.png',size:image.length,contentType:'image/png',image:true}]:[]}],
            images:'discordImage' in test?[{name:'vision-clue.png',data:image.toString('base64'),image:true,sourceMessageId:'800000000000000999'}]:[]};}}}:{})});break;}
        catch(error:any){if(attempt!==0||String(error?.message)!=='flag_without_matching_execution_receipt'||signal.aborted||job.stats.calls>=8)throw error;}
      }
      if(!solved)throw Error('solver_result_missing');
      const matching=job.receipts.some(receipt=>receipt.exitCode===0&&receipt.output.includes(test.expected));
      const sourceRead=!('requireSource' in test)||job.sources.some(source=>{try{return new URL(source.url).hostname===test.requireSource;}catch{return false;}});
      const skillRead=!('requireSkill' in test)||job.receipts.some(receipt=>receipt.exitCode===0&&receipt.command.includes(test.requireSkill));
      row={id:test.id,model:test.model,pass:solved.result.flags.includes(test.expected)&&matching&&sourceRead&&skillRead&&(!('requireDiscord' in test)||discordReads>0),expected:test.expected,result:solved.result,
        stats:job.stats,elapsedMs:performance.now()-started,receiptCount:job.receipts.length,matchingReceipt:matching,sourceRead,skillRead,discordReads};}
    catch(error:any){row={id:test.id,model:test.model,pass:false,expected:test.expected,error:String(error?.message||error),diagnostics:diagnostics.slice(-2000),receipts:job.receipts,stats:job.stats,elapsedMs:performance.now()-started,receiptCount:job.receipts.length};}
    results.push(row);await writeFile(join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({id:row.id,pass:row.pass,model:row.model,elapsedMs:Math.round(row.elapsedMs)}));
  }
  const summary={samples:results.length,passes:results.filter(row=>row.pass).length,failures:results.filter(row=>!row.pass).map(row=>row.id),
    modelCalls:results.reduce((sum,row)=>sum+(row.stats?.calls||0),0),elapsedMs:results.reduce((sum,row)=>sum+row.elapsedMs,0),
    comparison:{existingLegacyFrozenCorpus:'15/16 strict checks',isolatedExpansion:'adds raw artifact shell/ELF/image execution, live primary-source reads, and post-start Discord text/image retrieval; these probes are not the same corpus and are not a replacement score'}};
  await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));if(summary.failures.length)process.exitCode=1;
}finally{await rm(runtime,{recursive:true,force:true});}
