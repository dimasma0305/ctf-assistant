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
const cases={
  hint:{
    question:'Buat file meme CTF pakai template asli Two Buttons tentang gengsi minta hint padahal 4 jam stuck di warmup. Caption singkat bahasa Indonesia; pilih sendiri punchline-nya. Jangan pakai AI image generator. Template: https://i.imgflip.com/1g8my4.jpg',
    context:'Percakapan sintetis untuk uji fitur: peserta merasa malu meminta hint secara langsung. Tidak ada anggota Discord nyata yang menjadi sasaran. Kirim gambar jadi, bukan prompt.',
    asset:'1g8my4.jpg',animated:false,
  },
  variety:{
    question:'Buat meme baru soal menjilat atasan. Contoh situasi fiktif: aku bilang ide bos jenius sebelum dengerin penjelasannya, ternyata bos sendiri bilang idenya jelek. Cari ekspresi/aksi yang bikin punchline-nya nyampe. Template sebelumnya Drake terus; aku mau referensi visual lain, boleh reaction atau anime nonseksual. Jangan pakai Drake atau Two Buttons kali ini. Kirim satu file jadi.',
    context:'Percakapan sintetis. Dua meme sebelumnya menggunakan Drake untuk semua topik; user mengeluhkan template berulang dan meminta eksplorasi. Tidak ada orang nyata menjadi sasaran. Pilih sendiri template, caption dan layout; telusuri referensi publik, jangan hanya ambil pilihan pertama katalog populer.',
    asset:'',animated:false,
  },
  'reaction-gif':{
    question:'Buat meme GIF pakai reaksi Bakushin chibi nonseksual ini: https://media1.tenor.com/m/S_m7BzKVChwAAAAC/bakushin-sakura-bakushin-o.gif . Konteks fiktif: di grup kerja jawab siap pak, padahal batin kesal karena revisi datang pas mau pulang. Pilih caption Indonesia singkat, jangan menutupi ekspresinya, gerakan tetap GIF. Kirim satu file jadi.',
    context:'Uji sintetis caption reaksi GIF, bukan ilustrasi AI. Sumber publik: https://tenor.com/view/bakushin-sakura-bakushin-o-umamusume-chibi-bakushin-gif-5474612461633341980 . Tidak ada peserta Discord nyata atau data pribadi.',
    asset:'bakushin-sakura-bakushin-o.gif',animated:true,
  },
};
const caseName=process.argv[3]||'hint';
if(!(caseName in cases))throw Error('Unknown meme case');
const scenario=cases[caseName as keyof typeof cases];
await mkdir(out,{recursive:true});
const root=await mkdtemp(join(tmpdir(),'hr-meme-'));
const job=newJob({scope:'555555555555555555:700000000000009002',guildId:'555555555555555555',channelId:'700000000000009002',
  messageId:'800000000000009002',userId:'663394727688798231',kind:'investigation',route:'gpt-6.1-sol',imageMode:'template',
  question:scenario.question,context:scenario.context,artifacts:[]});
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
    templateAcquired:/curl|urllib|requests/.test(commands)&&(!scenario.asset||commands.includes(scenario.asset)),
    discoveredBeyondCatalog:caseName!=='variety'||commands.includes('/sources/search'),
    renderedLocally:/caption\.py|PIL|Pillow/.test(commands),
    noGenerator:!job.receipts.some(receipt=>receipt.command.includes('/images/generate')),
    actualImage:output.files.length===1&&output.files.every(file=>validImageExport(file.name,file.data)),
    requestedFormat:!scenario.animated||output.files.every(file=>file.name.toLowerCase().endsWith('.gif')),
    deliveredName:output.files.some(file=>output.result.summary.includes(file.name))};
  for(const file of output.files)await writeFile(join(out,file.name),file.data);
  await writeFile(join(out,'result.json'),JSON.stringify({checks,pass:Object.values(checks).every(Boolean),
    caseName,image:WORKER_IMAGE,model:'gpt-6.1-sol',stats:job.stats,result:output.result,
    commands:job.receipts.map(({command,exitCode})=>({command,exitCode})),
    note:'Synthetic IDs; no Discord sends. Human visual/humor review required.'},null,2));
  console.log(JSON.stringify({checks,summary:output.result.summary,files:output.files.map(file=>file.name)}));
  if(!Object.values(checks).every(Boolean))process.exitCode=1;
}catch(error){
  await writeFile(join(out,'result.json'),JSON.stringify({pass:false,error:String(error),diagnostics,stats:job.stats},null,2));
  console.error(String(error));process.exitCode=1;
}finally{await rm(root,{recursive:true,force:true});}
