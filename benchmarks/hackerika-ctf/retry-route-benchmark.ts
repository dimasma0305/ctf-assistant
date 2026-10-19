import { readFile, writeFile } from 'node:fs/promises';

type Case = { id: string; prior: string; reply: string; ageMinutes: number; want: boolean;
  between?: string; after?: 'banter' | 'other_request' | 'later_bot' };
const failure = 'Pencarian belum memberiku sumber yang bisa kuperiksa, jadi aku belum bisa memverifikasi jawabannya sekarang.';
const cases: Case[] = [
  { id: 'incident_cross_speaker', prior: '<@1077393568647352320> solve 1 soal lagi yg ada di tcp1p', reply: failure, ageMinutes: 84, want: true },
  { id: 'banter_between', prior: 'solve 1 soal lagi yg ada di tcp1p', reply: failure, ageMinutes: 84, after: 'banter', want: true },
  { id: 'non_ctf_research', prior: 'tolong riset platform TCP1P', reply: failure, ageMinutes: 84, want: false },
  { id: 'new_request_before_failure', prior: 'solve 1 soal lagi yg ada di tcp1p', between: 'tolong riset platform TCP1P', reply: failure, ageMinutes: 84, want: false },
  { id: 'new_request_after_failure', prior: 'solve 1 soal lagi yg ada di tcp1p', reply: failure, ageMinutes: 84, after: 'other_request', want: false },
  { id: 'later_bot_answer', prior: 'solve 1 soal lagi yg ada di tcp1p', reply: failure, ageMinutes: 84, after: 'later_bot', want: false },
  { id: 'stale_ctf', prior: 'solve 1 soal lagi yg ada di tcp1p', reply: failure, ageMinutes: 180, want: false },
  { id: 'no_failure', prior: 'solve 1 soal lagi yg ada di tcp1p', reply: 'Oke, nanti kucoba.', ageMinutes: 84, want: false },
];
const option = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : ''; };
const baselineImage = option('--baseline'), candidateImage = option('--candidate'), output = option('--out');
if (!baselineImage || !candidateImage || !output || await Bun.file(output).exists())
  throw new Error('Use --baseline IMAGE --candidate IMAGE --out FRESH_JSON');

const source = `import {Collection} from 'discord.js';
const cases=${JSON.stringify(cases)};
const routing=await import('./src/Services/AI/ctf.ts');
const now=Date.parse('2026-10-19T08:59:00Z'),bot='1077393568647352320',speaker='734732163332964456';
const result=[];
for(const c of cases){
  const earlier=now-(c.ageMinutes+2)*60000,failed=now-c.ageMinutes*60000;
  const entries=[{id:'111111111111111111',content:c.prior,author:{id:speaker,bot:false},createdTimestamp:earlier},
    {id:'222222222222222222',content:c.reply,author:{id:bot,bot:true},createdTimestamp:failed}];
  if(c.between)entries.push({id:'444444444444444444',content:c.between,author:{id:speaker,bot:false},createdTimestamp:failed-60000});
  if(c.after==='other_request')entries.push({id:'555555555555555555',content:'tolong buat reminder besok',author:{id:speaker,bot:false},createdTimestamp:now-5*60000});
  if(c.after==='later_bot')entries.push({id:'666666666666666666',content:'Oke, reminder sudah dibuat.',author:{id:bot,bot:true},createdTimestamp:now-5*60000});
  if(c.after==='banter')for(let i=0;i<6;i++)entries.push({id:String(700000000000000000n+BigInt(i)),content:'wkwk',author:{id:speaker,bot:false},createdTimestamp:now-(20-i)*60000});
  const message={id:'333333333333333333',content:'<@'+bot+'> coba lagi',createdTimestamp:now,
    client:{user:{id:bot}},channel:{messages:{fetch:async()=>new Collection(entries.map(entry=>[entry.id,entry]))}}};
  const retry=typeof routing.isCTFRetryRequest==='function'?await routing.isCTFRetryRequest(message):false;
  result.push({id:c.id,ctfRequired:routing.requiresCTFSolve(message.content,'',false)||retry,
    ctfAvailable:routing.ctfToolAvailable(message.content,'',false)||retry});
}
console.log(JSON.stringify(result));`;
async function run(image: string): Promise<{ id: string; ctfRequired: boolean; ctfAvailable: boolean }[]> {
  const child = Bun.spawn(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'bun', image, '-e', source],
    { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code) throw new Error(`${image}: ${stderr}`);
  return JSON.parse(stdout.trim());
}
const baseline = await run(baselineImage), candidate = await run(candidateImage);
const correct = (rows: typeof baseline) => rows.filter((row, index) =>
  row.ctfRequired === cases[index].want && row.ctfAvailable === cases[index].want).length;
const worker = await readFile('benchmarks/hackerika-ctf/worker.ts', 'utf8');
const instrumented = worker.replace('completions.push({ model: payload.model,',
  'completions.push({ toolChoice: payload.tool_choice, model: payload.model,');
if (instrumented === worker) throw new Error('worker_instrumentation_missing');
const chatCase = { id: 'retry-tool-choice', category: 'routing', backend: 'native-send',
  prompt: '<@1077393568647352320> coba lagi', history: [
    { who: 'other', name: 'W', text: '<@1077393568647352320> solve 1 soal lagi yg ada di tcp1p' },
    { who: 'bot', name: 'Hackerika', text: failure },
  ] };
const chatSource = `const CASE=${JSON.stringify(chatCase)};const FIXTURES={};\n${instrumented}`;
async function chatToolChoice(image: string): Promise<unknown> {
  const child = Bun.spawn(['docker', 'run', '--rm', '-i', '--network', 'none', '-e', 'AI_PROVIDER=deepseek',
    '-e', 'OPENAI_API_KEY=fixture-no-network', '--entrypoint', 'bun', image, '-'],
  { stdin: new Blob([chatSource]), stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  const marker = stdout.split('\n').findLast(line => line.startsWith('CAPABILITY_RESULT:'));
  if (code || !marker) throw new Error(`${image}: chat worker failed: ${stderr.slice(-500)}`);
  const row = JSON.parse(marker.slice('CAPABILITY_RESULT:'.length));
  if (row.failure || !row.completions?.[0]) throw new Error(`${image}: chat worker did not reach first completion`);
  return row.completions[0].toolChoice;
}
const baselineToolChoice = await chatToolChoice(baselineImage);
const candidateToolChoice = await chatToolChoice(candidateImage);
const report = { at: new Date().toISOString(), method: 'Frozen same-channel Discord messages, production TypeScript from isolated images; no model or network calls.',
  baselineImage, candidateImage, cases, baseline, candidate,
  chatToolChoice: { baseline: baselineToolChoice, candidate: candidateToolChoice,
    method: 'Real handleAIChat with a stubbed completion; captures the first tool_choice without executing a Codex job.' },
  correct: { baseline: correct(baseline), candidate: correct(candidate), total: cases.length } };
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.correct));
if (correct(candidate) !== cases.length || JSON.stringify(candidateToolChoice) !== JSON.stringify({ type: 'function', function: { name: 'solve_ctf' } })) process.exitCode = 2;
