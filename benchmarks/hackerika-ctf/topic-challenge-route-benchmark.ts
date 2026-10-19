import { readFile, writeFile } from 'node:fs/promises';

type Case = { id: string; prompt: string; shouldForceSolver: boolean };
const cases: Case[] = [
  { id: 'live_wordpress_request', prompt: '<@1077393568647352320> solve challenge ku yang tentang wordpress, yang mana aja', shouldForceSolver: true },
  { id: 'indonesian_verb', prompt: 'tolong pecahkan challenge WordPress punyaku', shouldForceSolver: true },
  { id: 'reverse_order', prompt: 'challenge WordPress ini, tolong solve', shouldForceSolver: true },
  { id: 'different_topic', prompt: 'solve challenge web yang dibuat timku', shouldForceSolver: true },
  { id: 'wordpress_support', prompt: 'tolong cek plugin WordPress ku', shouldForceSolver: false },
  { id: 'ctf_recommendation', prompt: 'saran platform CTF yang bisa deploy', shouldForceSolver: false },
  { id: 'challenge_banter', prompt: 'challenge menulis harian ini seru', shouldForceSolver: false },
  { id: 'math_homework', prompt: 'bantu solve soal matematika ini', shouldForceSolver: false },
];
const option = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : ''; };
const baselineImage = option('--baseline'), candidateImage = option('--candidate'), output = option('--out');
if (!baselineImage || !candidateImage || !output || await Bun.file(output).exists())
  throw new Error('Use --baseline IMAGE --candidate IMAGE --out FRESH_JSON');

const routeSource = `const cases=${JSON.stringify(cases)};
const {requiresCTFSolve,ctfToolAvailable}=await import('./src/Services/AI/ctf.ts');
console.log(JSON.stringify(cases.map(item=>({id:item.id,required:requiresCTFSolve(item.prompt),available:ctfToolAvailable(item.prompt)}))));`;
type Route = { id: string; required: boolean; available: boolean };
async function runRoute(image: string): Promise<Route[]> {
  const child = Bun.spawn(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'bun', image, '-e', routeSource],
    { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code) throw new Error(`${image}: ${stderr}`);
  return JSON.parse(stdout.trim());
}

const worker = await readFile('benchmarks/hackerika-ctf/worker.ts', 'utf8');
const instrumented = worker.replace('completions.push({ model: payload.model,',
  'completions.push({ toolChoice: payload.tool_choice, model: payload.model,');
if (instrumented === worker) throw new Error('worker_instrumentation_missing');
const chatCase = { id: 'live-wordpress-tool-choice', category: 'routing', backend: 'native-send', prompt: cases[0].prompt };
const chatSource = `const CASE=${JSON.stringify(chatCase)};const FIXTURES={};\n${instrumented}`;
async function runChat(image: string): Promise<unknown> {
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

const baseline = await runRoute(baselineImage), candidate = await runRoute(candidateImage);
const correct = (routes: Route[]) => routes.filter((row, index) => row.required === cases[index].shouldForceSolver
  && (cases[index].shouldForceSolver ? row.available : true)).length;
const chatToolChoice = { baseline: await runChat(baselineImage), candidate: await runChat(candidateImage) };
const report = { at: new Date().toISOString(), baselineImage, candidateImage, cases, baseline, candidate,
  correct: { baseline: correct(baseline), candidate: correct(candidate), total: cases.length }, chatToolChoice,
  method: 'Production TypeScript in isolated images, real chat handler with stubbed completion. No network, Discord send, Codex job or checker call.' };
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.correct));
if (correct(candidate) !== cases.length || JSON.stringify(chatToolChoice.candidate)
    !== JSON.stringify({ type: 'function', function: { name: 'solve_ctf' } })) process.exitCode = 2;
