import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chatGPTMountArgs } from '../chatgpt-runtime';
const arg = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const container = arg('--container'), image = arg('--image'), envFile = arg('--env-file'), out = arg('--out');
const corpusFile = arg('--corpus') || 'benchmarks/hackerika-attention/cases.json';
const repeats = Number(arg('--repeats') || '2'), maxSeconds = Number(arg('--max-seconds') || '300');
if (!out || (!!container === !!image) || (image && !envFile)) throw new Error('Use --container NAME --out PATH, or --image TAG --env-file PRIVATE_PATH --out PATH');
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 2 || maxSeconds < 30 || maxSeconds > 600) throw Error('Use repeats1..2 and max-seconds30..600');
const mountArgs = await chatGPTMountArgs(image || '', envFile || '');
if (await Bun.file(`${out}/summary.json`).exists()) throw new Error('Use a fresh output directory');
await mkdir(out, { recursive: true });
const corpus = await Bun.file(corpusFile).text();
const cases = JSON.parse(corpus), maxCalls = cases.length * repeats;
if (!Array.isArray(cases) || !cases.length || maxCalls > 100) throw Error('Use a bounded corpus, at most100 planner calls');
const hash = createHash('sha256').update(corpus).digest('hex');
const worker = await Bun.file('benchmarks/hackerika-attention/scenario.ts').text();
const source = `const CASES=${corpus}; const CORPUS_HASH=${JSON.stringify(hash)};const REPEATS=${repeats};const MAX_CALLS=${maxCalls};const MAX_SECONDS=${maxSeconds};\n` + worker;
await Bun.write(`${out}/protocol.json`, JSON.stringify({ startedAt: new Date().toISOString(), corpusHash: hash,
    corpusFile, workerHash: createHash('sha256').update(worker).digest('hex'),
    runtime: container || image, maxCalls, maxSeconds, repeats, acceptance: { accuracy: 0.90, criticalFailures: 0, consecutiveFollowups: true, reportedFollowups: true } }, null, 2));
const command = container ? ['docker', 'exec', '-i', container, 'bun', '-']
    : ['docker', 'run', '--rm', '-i', '--network', 'traefik', '--env-file', envFile!, ...mountArgs, '--entrypoint', 'bun', image!, '-'];
const child = Bun.spawn(command, { stdin: new Blob([source]), stdout: 'pipe', stderr: 'pipe' });
const timer = setTimeout(() => child.kill(), (maxSeconds + 10) * 1000);
const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
clearTimeout(timer);
const rows = stdout.split('\n').filter(line => line.startsWith('EVAL_ROW:')).map(line => JSON.parse(line.slice('EVAL_ROW:'.length)));
await Bun.write(`${out}/results.json`, JSON.stringify(rows, null, 2));
const summary = stdout.split('\n').find(line => line.startsWith('EVAL_SUMMARY:'));
if (exit || !summary) throw new Error(`Evaluation failed with exit ${exit}; retained ${rows.length} rows. ${stderr.includes('SyntaxError') ? 'SyntaxError' : ''}`);
await Bun.write(`${out}/summary.json`, JSON.stringify(JSON.parse(summary.slice('EVAL_SUMMARY:'.length)), null, 2));
console.log(summary);
