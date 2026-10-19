import { readFile, writeFile } from 'node:fs/promises';

const index = process.argv.indexOf('--out');
const output = index >= 0 ? process.argv[index + 1] : '';
if (!output || await Bun.file(output).exists()) throw new Error('Use --out FRESH_JSON');
const worker = await readFile('benchmarks/hackerika-ctf/worker.ts', 'utf8');
const instrumented = worker
  .replace('completions.push({ model: payload.model,', 'completions.push({ toolChoice: payload.tool_choice, model: payload.model,')
  .replace('    if (CASE.backend) {\n        const name =',
    `    if (payload.messages?.[0]?.content?.startsWith('Classify the CURRENT Discord request')) {
        if (CASE.classifierError) throw Error('fixture_classifier_unavailable');
        response = {choices:[{message:{content:JSON.stringify({intent:CASE.classifierIntent,confidence:0.96})}}]};
    } else if (CASE.backend) {
        const name =`);
if (!instrumented.includes('fixture_classifier_unavailable') || !instrumented.includes('toolChoice: payload.tool_choice'))
  throw new Error('worker_instrumentation_missing');
const cases = [
  { id: 'ambiguous_challenge', prompt: 'bantu soal web yang kemarin', history: [
    { who: 'other', name: 'W', text: 'challenge CTF web TCP1P ini perlu di-solve' }], classifierIntent: 'ctf_solve', want: 'solve_ctf' },
  { id: 'person_osint', prompt: 'bantu osint tentang <@123456789012345678>', classifierIntent: 'research', want: 'research_topic' },
  { id: 'classifier_unavailable', prompt: 'bantu soal web yang kemarin', classifierError: true, want: 'auto' },
] as const;
async function run(image: string, item: typeof cases[number]) {
  const source = `const CASE=${JSON.stringify({ ...item, backend: 'native-send', category: 'routing' })};const FIXTURES={};\n${instrumented}`;
  const child = Bun.spawn(['docker', 'run', '--rm', '-i', '--network', 'none', '-e', 'AI_PROVIDER=deepseek',
    '-e', 'OPENAI_API_KEY=fixture-no-network', '--entrypoint', 'bun', image, '-'],
  { stdin: new Blob([source]), stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  const marker = stdout.split('\n').findLast(line => line.startsWith('CAPABILITY_RESULT:'));
  if (code || !marker) throw new Error(`${image}/${item.id}: ${stderr.slice(-500)}`);
  const row = JSON.parse(marker.slice('CAPABILITY_RESULT:'.length));
  if (row.failure || !row.completions?.length) throw new Error(`${image}/${item.id}: handler did not complete`);
  const classifier = row.completions.some((completion: {toolChoice: unknown}) => completion.toolChoice === undefined);
  const firstChat = row.completions.find((completion: {toolChoice: unknown}) => completion.toolChoice !== undefined);
  return { classifier, toolChoice: firstChat?.toolChoice || 'missing' };
}
const rows = [];
for (const item of cases) {
  const baseline = await run('ctf-assistant:c1f7b3b', item);
  const candidate = await run('ctf-assistant:semantic-router-candidate', item);
  rows.push({ id: item.id, want: item.want, baseline, candidate });
}
const selected = (value: unknown) => typeof value === 'string' ? value : (value as {function?:{name?:string}})?.function?.name || 'missing';
const correct = (key: 'baseline' | 'candidate') => rows.filter(row => selected(row[key].toolChoice) === row.want).length;
const report = { at: new Date().toISOString(), method: 'Real chat handler in isolated images; classifier and response model stubbed, no Discord sends or Codex jobs.',
  rows, correct: { baseline: correct('baseline'), candidate: correct('candidate'), total: cases.length } };
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.correct));
if (correct('candidate') !== cases.length) process.exitCode = 2;
