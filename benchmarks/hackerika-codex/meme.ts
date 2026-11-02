// Real isolated worker smoke; synthetic conversation only, never posts to Discord.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeJob } from '../../scripts/codex-runner/executor';
import { newJob, validImageExport } from '../../scripts/codex-runner/protocol';
import { ensureWorkerImage } from '../../scripts/codex-runner/workerImage';
import { WORKER_IMAGE } from '../../scripts/codex-runner/runtime';

const out=process.argv[2];
if(!out||await Bun.file(join(out,'result.json')).exists())throw Error('Provide a fresh output directory');
await mkdir(out,{recursive:true});
const root=await mkdtemp(join(tmpdir(),'hr-meme-'));
const job=newJob({scope:'555555555555555555:700000000000009002',guildId:'555555555555555555',channelId:'700000000000009002',
  messageId:'800000000000009002',userId:'663394727688798231',kind:'investigation',route:'gpt-6.1-sol',imageMode:'template',
  question:'Buat file meme CTF pakai template asli Two Buttons tentang gengsi minta hint padahal 4 jam stuck di warmup. Caption singkat bahasa Indonesia; pilih sendiri punchline-nya. Jangan pakai AI image generator. Template: https://i.imgflip.com/1g8my4.jpg',
  context:'Percakapan sintetis untuk uji fitur: peserta merasa malu meminta hint secara langsung. Tidak ada anggota Discord nyata yang menjadi sasaran. Kirim gambar jadi, bukan prompt.',artifacts:[]});
let diagnostics='';
const startedAt=Date.now();
try{
  await ensureWorkerImage(WORKER_IMAGE);
  const output=await executeJob(job,'gpt-6.1-sol',root,AbortSignal.timeout(420_000),{image:WORKER_IMAGE,
    onDiagnostic:text=>{diagnostics=(diagnostics+text).slice(-3000);},
    onEvent:event=>{if(event.type==='item.completed'&&event.item?.type==='command_execution')
      console.log(JSON.stringify({commandCompleted:true,exit:event.item.exit_code,calls:job.stats.calls}));}});
  job.stats.elapsedMs=Date.now()-startedAt;
  const commands=job.receipts.filter(receipt=>receipt.exitCode===0).map(receipt=>receipt.command).join('\n');
  const checks={skillRead:commands.includes('meme-craft/SKILL.md'),
    templateAcquired:/curl|urllib|requests/.test(commands)&&commands.includes('1g8my4.jpg'),
    renderedLocally:/caption\.py|PIL|Pillow/.test(commands),
    noGenerator:!job.receipts.some(receipt=>receipt.command.includes('/images/generate')),
    actualImage:output.files.length===1&&output.files.every(file=>validImageExport(file.name,file.data)),
    deliveredName:output.files.some(file=>output.result.summary.includes(file.name))};
  for(const file of output.files)await writeFile(join(out,file.name),file.data);
  await writeFile(join(out,'result.json'),JSON.stringify({checks,pass:Object.values(checks).every(Boolean),
    image:WORKER_IMAGE,model:'gpt-6.1-sol',stats:job.stats,result:output.result,
    commands:job.receipts.map(({command,exitCode})=>({command,exitCode})),
    note:'Synthetic IDs; no Discord sends. Human visual/humor review required.'},null,2));
  console.log(JSON.stringify({checks,summary:output.result.summary,files:output.files.map(file=>file.name)}));
  if(!Object.values(checks).every(Boolean))process.exitCode=1;
}catch(error){
  await writeFile(join(out,'result.json'),JSON.stringify({pass:false,error:String(error),diagnostics,stats:job.stats},null,2));
  console.error(String(error));process.exitCode=1;
}finally{await rm(root,{recursive:true,force:true});}
