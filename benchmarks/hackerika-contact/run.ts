import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const arg = (name: string) => { const i = process.argv.indexOf(name); return i < 0 ? '' : process.argv[i + 1]; };
const before = arg('--before'), out = arg('--out');
if (!before || !out || await Bun.file(`${out}/protocol.json`).exists()) throw new Error('--before <baseline checkout> --out <fresh directory> required');
const worker = await readFile('benchmarks/hackerika-capabilities/worker.ts', 'utf8');
const ids = ['663394727688798231', '222222222222222222', '333333333333333333', '444444444444444444', '666666666666666666'];
const list = `Gass yang mau ikut Joints UGM Finals (6 soal):\n1. <@${ids[0]}> (Web 1)\n2. <@${ids[1]}> (rev 1)\n3. <@${ids[2]}> (pwn 2)\n4. <@${ids[3]}> (foren 1)\n5. <@${ids[4]}> (crypto 1)\njangan lupa push besok ya, <@1077393568647352320> tolong ping semua termasuk saya`;
const cases = [false, true].map(partial => ({ id: partial ? 'partial-status-retry' : 'all-self-status', category: 'agent-outreach', creatorContact: true,
    now: '2026-10-29T01:32:00Z', prompt: list, history: [], closedDmIds: partial ? [ids[4]] : [],
    sequence: [{ prompt: list }, { prompt: 'ping semua di DM <@1077393568647352320>' },
        { prompt: 'siapa yang belum ke kirim?' }, ...(partial ? [{ prompt: 'oke coba kirim ulang yang gagal saja', openDms: true }] : [])] }));
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
await mkdir(out, { recursive: true });
await writeFile(`${out}/protocol.json`, JSON.stringify({ startedAt: new Date(), before, after: process.cwd(), cases,
    repeats: 2, workerHash: hash(worker), corpusHash: hash(JSON.stringify(cases)), concurrency: 4,
    maxCallsPerSequence: 28, timeoutSeconds: 250, acceptance: 'First turn pings all five including creator; DM continuation reaches exact audience, excluding only simulated closed DM. Status turn sends zero DMs. Explicit retry sends once only to recovered failed recipient. Real chat handler and models, fake Discord/DB/network boundary, no real messages.',
}, null, 2));
const jobs = cases.flatMap(test => [0, 1].flatMap(trial => ['before', 'after'].map(variant => ({ test, trial, variant }))));
const rows: any[] = []; let index = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
    while (index < jobs.length) {
        const { test, trial, variant } = jobs[index++];
        const child = Bun.spawn(['bun', '-'], { cwd: variant === 'before' ? before : process.cwd(),
            env: { ...process.env, NODB: 'true', AI_DISCORD_ACTIONS: 'true', AI_PROVIDER: 'chatgpt' },
            stdin: new Blob([`const CASE=${JSON.stringify(test)};const FIXTURES={};\n${worker}`]), stdout: 'pipe', stderr: 'pipe' });
        const timer = setTimeout(() => child.kill(), 250_000);
        const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
        clearTimeout(timer);
        const marker = stdout.split('\n').findLast(line => line.startsWith('CAPABILITY_RESULT:'));
        const result = marker ? JSON.parse(marker.slice('CAPABILITY_RESULT:'.length)) : { failure: `worker_exit_${exit}`, sequenceResults: [] };
        const turns = result.sequenceResults || [];
        const dmIds = (turn: number) => (turns[turn]?.effects || []).filter((e: any) => e.kind === 'dm').map((e: any) => e.userId).sort();
        const pings = (turns[0]?.effects || []).filter((e: any) => e.kind === 'send').flatMap((e: any) => e.mentionedUserIds || []).sort();
        const equal = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify([...b].sort());
        const checks = { completeAudience: equal(pings, ids), dmAudience: equal(dmIds(1), test.closedDmIds.length ? ids.slice(0, 4) : ids),
            statusReadOnly: turns.length >= 3 && dmIds(2).length === 0,
            ...(test.closedDmIds.length ? { retryFailedOnly: equal(dmIds(3), [ids[4]]) } : {}) };
        const row = { variant, trial, caseId: test.id, checks, passed: !result.failure && Object.values(checks).every(Boolean), result };
        rows.push(row);
        await writeFile(`${out}/${test.id}-${variant}-${trial}.json`, JSON.stringify(row, null, 2));
        if (!row.passed) await writeFile(`${out}/${test.id}-${variant}-${trial}.log`, `${stdout}\n${stderr}`);
        console.log(JSON.stringify({ variant, trial, caseId: test.id, checks, failure: result.failure }));
    }
}));
const summary = Object.fromEntries(['before', 'after'].map(variant => { const selected = rows.filter(row => row.variant === variant);
    return [variant, { passed: selected.filter(row => row.passed).length, total: selected.length }]; }));
await writeFile(`${out}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
