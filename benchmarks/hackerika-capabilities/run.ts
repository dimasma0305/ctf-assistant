import { chatGPTMountArgs } from '../chatgpt-runtime';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { CASES, VALIDATION_CASES } from './corpus';
import { deterministicGrade, GRADER_VERSION, JUDGE_PROMPT } from './grader';
const option = (key: string, fallback = '') => { const i = process.argv.indexOf(key); return i < 0 ? fallback : process.argv[i + 1]; };
const container = option('--container'), image = option('--image'), envFile = option('--env-file'), out = option('--out');
const split = option('--split', 'dev'), repeats = Number(option('--repeats', '1')), concurrency = Number(option('--concurrency', '3'));
const onlyCase = option('--case');
const authMountArgs = await chatGPTMountArgs(image, envFile);
if (!out || (!!container === !!image) || (image && !envFile) || !['dev', 'holdout', 'validation', 'smoke', 'backend'].includes(split)
    || !Number.isInteger(repeats) || repeats < 1 || repeats > 2 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('Use --container NAME or --image TAG --env-file PRIVATE; --out FRESH_PATH; --split dev|holdout|validation|smoke|backend');
if (await Bun.file(`${out}/protocol.json`).exists()) throw new Error('Output exists; retain earlier runs and choose a fresh path');
await mkdir(out, { recursive: true });
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const worker = await readFile('benchmarks/hackerika-capabilities/worker.ts', 'utf8');
const freshIds = new Set(VALIDATION_CASES.map(test => test.id));
const selected = CASES.filter(test => split === 'smoke' ? ['ctr-facts', 'backend-native-send', 'reply-image-table'].includes(test.id) : split === 'backend' ? !!test.backend : split === 'validation' ? freshIds.has(test.id) : test.split === split && !freshIds.has(test.id)).filter(test => !onlyCase || test.id === onlyCase);
if (!selected.length) throw new Error('No matching cases');
const fixtures: Record<string, string> = {};
for (const test of selected) for (const name of test.images || []) fixtures[name] = (await readFile(`benchmarks/hackerika-capabilities/fixtures/${name}`)).toString('base64');
const started = performance.now(), deadline = started + 15 * 60_000;
const protocol = { startedAt: new Date().toISOString(), runtime: container || image, split, repeats, concurrency, corpusHash: hash(JSON.stringify(CASES)),
    workerHash: hash(worker), selectedIds: selected.map(test => test.id), graderVersion: GRADER_VERSION, graderHash: hash(await readFile('benchmarks/hackerika-capabilities/grader.ts')),
    fixtures: Object.fromEntries(Object.entries(fixtures).map(([name, base64]) => [name, hash(Buffer.from(base64, 'base64'))])),
    limits: { maxCompletionsPerCase: 6, maxCaseSeconds: 155, maxMinutes: 15 },
    acceptance: { deterministicBackendFailures: 0, criticalFailures: 0, semanticPassRate: 0.90, noRegressionAgainstMatchedBaseline: true },
    scope: 'Real handleAIChat, native tool dispatcher, vision download/inline transport and model calls. Discord and database are in-process fakes; web search/page content are controlled synthetic fixtures. No real Discord sends, DMs, roles, database mutations or search-engine calls.' };
await writeFile(`${out}/protocol.json`, JSON.stringify(protocol, null, 2));
const rows: any[] = [];
const jobs = selected.flatMap(test => Array.from({ length: repeats }, (_, trial) => ({ test, trial })));
let index = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
    while (index < jobs.length) {
        const { test, trial } = jobs[index++];
        if (performance.now() >= deadline) throw new Error('suite_deadline');
        const source = `const CASE=${JSON.stringify(test)};const FIXTURES=${JSON.stringify(fixtures)};\n${worker}`;
        const command = container ? ['docker', 'exec', '-i', container, 'bun', '-'] : ['docker', 'run', '--rm', '-i', '--network', 'traefik', '--env-file', envFile, ...authMountArgs, '--entrypoint', 'bun', image, '-'];
        const child = Bun.spawn(command, { stdin: new Blob([source]), stdout: 'pipe', stderr: 'pipe' });
        const timer = setTimeout(() => child.kill(), 155_000);
        const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
        clearTimeout(timer);
        const marker = stdout.split('\n').findLast(line => line.startsWith('CAPABILITY_RESULT:'));
        const row = marker ? JSON.parse(marker.slice('CAPABILITY_RESULT:'.length)) : { caseId: test.id, category: test.category, failure: `worker_exit_${exit}`, text: '', effects: [], completions: [], toolCalls: [], interactionWrites: 0, profileWrites: [], memory: [] };
        if ((!marker || row.failure) && process.env.BENCH_PRIVATE_LOG_DIR) { await mkdir(process.env.BENCH_PRIVATE_LOG_DIR, { recursive: true, mode: 0o700 }); await writeFile(`${process.env.BENCH_PRIVATE_LOG_DIR}/${test.id}-${trial}.log`, stdout + '\n' + stderr, { mode: 0o600 }); }
        row.trial = trial; row.deterministicFailures = deterministicGrade(test, row); row.deterministicPass = row.deterministicFailures.length === 0;
        rows.push(row); await writeFile(`${out}/results.json`, JSON.stringify(rows, null, 2));
        console.log(JSON.stringify({ completed: rows.length, total: jobs.length, caseId: test.id, deterministicPass: row.deterministicPass, failure: row.failure || '' }));
    }
}));
const latencies = rows.filter(row => !row.backend && !row.failure).map(row => row.elapsedMs).sort((a, b) => a - b);
const percentile = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] || 0;
const summary = { samples: rows.length, deterministicPasses: rows.filter(row => row.deterministicPass).length,
    backendSamples: rows.filter(row => row.backend).length, backendPasses: rows.filter(row => row.backend && row.deterministicPass).length,
    errors: rows.filter(row => row.failure).length, actualModelCalls: rows.filter(row => !row.backend).reduce((n, row) => n + row.modelCalls, 0),
    elapsedMs: performance.now() - started, latencyMs: { p50: percentile(0.5), p95: percentile(0.95), includesTypingAndImport: true },
    usage: rows.flatMap(row => row.completions).reduce((sum, completion) => ({ prompt: sum.prompt + (completion.usage?.prompt_tokens || 0), completion: sum.completion + (completion.usage?.completion_tokens || 0) }), { prompt: 0, completion: 0 }),
    note: 'Deterministic checks are necessary, not a semantic quality score. Run judge.ts and inspect critical/failed outputs before selecting a candidate.' };
await writeFile(`${out}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
