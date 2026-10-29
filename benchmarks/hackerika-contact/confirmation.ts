import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { CASES } from '../hackerika-capabilities/corpus';
import { deterministicGrade } from '../hackerika-capabilities/grader';
const i = process.argv.indexOf('--out'), out = i < 0 ? '' : process.argv[i + 1];
if (!out || await Bun.file(`${out}/protocol.json`).exists()) throw new Error('--out <fresh directory> required');
const test = CASES.find(c => c.id === 'creator-followup-contact')!;
const worker = await readFile('benchmarks/hackerika-capabilities/worker.ts', 'utf8');
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
await mkdir(out, { recursive: true });
await writeFile(`${out}/protocol.json`, JSON.stringify({ startedAt: new Date(), repeats: 2, case: test,
    workerHash: hash(worker), graderHash: hash(await readFile('benchmarks/hackerika-capabilities/grader.ts', 'utf8')),
    scope: 'Existing frozen confirmation-exclusion regression, real model/chat handler, simulated Discord and DB only.' }, null, 2));
await Promise.all([0, 1].map(async trial => {
    const child = Bun.spawn(['bun', '-'], { env: { ...process.env, NODB: 'true', AI_DISCORD_ACTIONS: 'true' },
        stdin: new Blob([`const CASE=${JSON.stringify(test)};const FIXTURES={};\n${worker}`]), stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    const marker = stdout.split('\n').findLast(line => line.startsWith('CAPABILITY_RESULT:'));
    const row = marker ? JSON.parse(marker.slice('CAPABILITY_RESULT:'.length)) : { failure: `exit_${exit}` };
    row.trial = trial; row.checks = marker ? deterministicGrade(test, row) : ['missing_result'];
    await writeFile(`${out}/${trial}.json`, JSON.stringify(row, null, 2));
    if (row.failure || row.checks.length) await writeFile(`${out}/${trial}.log`, `${stdout}\n${stderr}`);
    console.log(JSON.stringify({ trial, failure: row.failure, checks: row.checks, effects: row.effects }));
}));
