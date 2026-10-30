import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { CASES, VALIDATION_CASES } from './cases';
const arg = (key: string) => { const i = process.argv.indexOf(key); return i < 0 ? '' : process.argv[i + 1]; };
const root = arg('--root') || process.cwd(), out = arg('--out');
const cases = arg('--suite') === 'validation' ? VALIDATION_CASES : CASES;
if (!out || await Bun.file(`${out}/protocol.json`).exists()) throw new Error('--out <fresh directory> required');
const worker = await readFile('benchmarks/hackerika-capabilities/worker.ts', 'utf8');
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
await mkdir(out, { recursive: true });
await writeFile(`${out}/protocol.json`, JSON.stringify({ startedAt: new Date(), root, repeats: 2, concurrency: 3,
    cases, workerHash: hash(worker), corpusHash: hash(JSON.stringify(cases)),
    acceptance: 'Manual semantic review against each frozen expected behavior; report failures and provider errors separately. Real chat/model, simulated Discord and DB; no real messaging. No keyword score substitutes for source attribution.' }, null, 2));
const jobs = cases.flatMap(test => [0, 1].map(trial => ({ test, trial }))); let next = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
    while (next < jobs.length) {
        const { test, trial } = jobs[next++];
        const child = Bun.spawn(['bun', '-'], { cwd: root, env: { ...process.env, NODB: 'true', AI_DISCORD_ACTIONS: 'true' },
            stdin: new Blob([`const CASE=${JSON.stringify(test)};const FIXTURES={};\n${worker}`]), stdout: 'pipe', stderr: 'pipe' });
        const timer = setTimeout(() => child.kill(), 155_000);
        const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
        clearTimeout(timer);
        const marker = stdout.split('\n').findLast(line => line.startsWith('CAPABILITY_RESULT:'));
        const row = marker ? JSON.parse(marker.slice('CAPABILITY_RESULT:'.length)) : { failure: `exit_${exit}` };
        row.trial = trial;
        await writeFile(`${out}/${test.id}-${trial}.json`, JSON.stringify(row, null, 2));
        if (row.failure) await writeFile(`${out}/${test.id}-${trial}.log`, `${stdout}\n${stderr}`.trimEnd() + '\n');
        console.log(JSON.stringify({ id: test.id, trial, text: row.text, failure: row.failure }));
    }
}));
