import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeJob } from '../../scripts/codex-runner/executor';
import { INVESTIGATION_PROMPT, newJob, publicJob } from '../../scripts/codex-runner/protocol';
import { ensureWorkerImage } from '../../scripts/codex-runner/workerImage';
import { WORKER_IMAGE } from '../../scripts/codex-runner/runtime';
import { formatCodexResult, splitCodexReply } from '../../src/Services/AI/codexJobs';

const option=(name:string)=>{const index=process.argv.indexOf(name);return index<0?'':process.argv[index+1];};
const out=option('--out');
if(!out||await Bun.file(join(out,'protocol.json')).exists())throw Error('Use --out FRESH_PATH');
const image=process.env.CODEX_WORKER_IMAGE||WORKER_IMAGE;
const question='Riset situasi Indonesia dan dunia sekarang, lebih baik pindah ke luar negeri atau tetap tinggal di sini? Jika pindah, apa yang harus disiapkan?';
const date=new Date().toISOString().slice(0,10);
const job=newJob({scope:'555555555555555555:700000000000009001',guildId:'555555555555555555',channelId:'700000000000009001',
  messageId:'800000000000009001',userId:'663394727688798231',kind:'investigation',route:'auto',question,
  context:`Tanggal permintaan: ${date}. User belum menyebut negara tujuan, pekerjaan, anggaran, atau tanggungan. Beri kerangka keputusan bersyarat dan persiapan praktis dari sumber primer yang diperiksa. Jangan mengasumsikan profil pribadi atau mengarang angka terkini.`,artifacts:[]});
await mkdir(out,{recursive:true});
await writeFile(join(out,'protocol.json'),JSON.stringify({date,model:'gpt-6-sol',image,question,
  promptSha256:createHash('sha256').update(INVESTIGATION_PROMPT).digest('hex'),
  scope:'Real isolated worker, inference and public web research; synthetic Discord IDs; no Discord sends or production job submission.',
  acceptance:'Completed research with successful evidence commands, at least three inspected source URLs across at least two domains, and a cited answer covering conditional stay/move tradeoffs and practical preparation. Human review required for factual quality.'},null,2));
const root=await mkdtemp(join(tmpdir(),'hr-research-'));const start=Date.now();let diagnostic='';
try{
  await ensureWorkerImage(image);
  const output=await executeJob(job,'gpt-6-sol',root,AbortSignal.timeout(900_000),{image,
    onDiagnostic:text=>{diagnostic=(diagnostic+text).slice(-3000);},
    onEvent:event=>{if(event.type==='item.completed'&&event.item?.type==='command_execution')
      console.log(JSON.stringify({commandCompleted:true,exit:event.item.exit_code,calls:job.stats.calls,searches:job.stats.searches,reads:job.stats.sourceReads}));}});
  job.result=output.result;job.state='completed';
  const rendered=formatCodexResult(publicJob(job)),parts=splitCodexReply(rendered);
  const sourceUrls=[...new Set(job.sources.map(source=>source.url))];
  const domains=new Set(sourceUrls.map(url=>new URL(url).hostname));
  const checks={execution:job.receipts.some(receipt=>receipt.exitCode===0),sources:sourceUrls.length>=3&&domains.size>=2,
    citations:/https?:\/\//.test(rendered),decision:/tinggal|pindah|migrasi/i.test(rendered),preparation:/visa|dokumen|paspor|bahasa/i.test(rendered),
    noGenericFailure:!/^Riset tadi belum berhasil|^Risetku belum cukup/i.test(rendered),
    completeDelivery:parts.every(part=>part.length<=2000)&&parts.join('').replace(/\s/g,'')===rendered.replace(/\s/g,'')};
  const pass=Object.values(checks).every(Boolean);
  await writeFile(join(out,'result.json'),JSON.stringify({pass,checks,elapsedMs:Date.now()-start,stats:job.stats,result:job.result,
    rendered,parts,sources:job.sources,receipts:job.receipts.map(({command,exitCode,output})=>({command,exitCode,
      outputSha256:createHash('sha256').update(output).digest('hex')}))},null,2));
  console.log(JSON.stringify({pass,checks,elapsedMs:Date.now()-start,stats:job.stats,summary:rendered}));
  if(!pass)process.exitCode=1;
}catch(error){
  const message=String(error instanceof Error?error.message:error);
  await writeFile(join(out,'result.json'),JSON.stringify({pass:false,error:message,diagnostic,elapsedMs:Date.now()-start,stats:job.stats,sources:job.sources,
    receipts:job.receipts.map(({command,exitCode,output})=>({command,exitCode,outputSha256:createHash('sha256').update(output).digest('hex')}))},null,2));
  console.error(JSON.stringify({pass:false,error:message,stats:job.stats}));process.exitCode=1;
}finally{await rm(root,{recursive:true,force:true});}
