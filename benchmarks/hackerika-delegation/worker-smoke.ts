import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeJob } from '../../scripts/codex-runner/executor';
import { newJob, validatePacket } from '../../scripts/codex-runner/protocol';

const out = process.argv[process.argv.indexOf('--out') + 1];
if (!out || await Bun.file(`${out}/worker-smoke.json`).exists()) throw Error('Use --out FRESH_PATH');
await mkdir(out, { recursive: true });
const runtime = await mkdtemp(join(tmpdir(), 'hackerika-investigation-smoke-'));
const messageId = '800000000000000101';
const csv = 'variant,latency_ms\nA,10\nA,11\nA,12\nB,4\nB,5\nB,6\n';
const job = newJob(validatePacket({ kind: 'investigation', scope: '555555555555555555:700000000000000101',
    guildId: '555555555555555555', channelId: '700000000000000101', messageId, userId: '663394727688798231',
    question: 'Analisis CSV terlampir. Hitung median latency A dan B dengan kode, rasio A/B, lalu jawab singkat dengan bukti perhitungan. Jangan gunakan web.',
    context: 'Eksperimen sintetis dan terotorisasi. File CSV adalah satu-satunya sumber angka.', route: 'luna',
    artifacts: [{ name: 'latencies.csv', data: Buffer.from(csv).toString('base64'), image: false, sourceMessageId: messageId }] }));
let diagnostics = '';
try {
    const solved = await executeJob(job, 'gpt-6-luna', runtime, AbortSignal.timeout(180_000), {
        onDiagnostic: text => { diagnostics = (diagnostics + text).slice(-3000); },
    });
    const receipt = job.receipts.some(row => row.exitCode === 0 && /2\.2/.test(row.output));
    const answer = [solved.result.summary, ...solved.result.findings].join(' ');
    const pass = /2[.,]2/.test(answer) && /11/.test(answer) && /5/.test(answer) && receipt;
    await Bun.write(`${out}/worker-smoke.json`, JSON.stringify({ pass, result: solved.result, stats: job.stats,
        receipts: job.receipts.map(row => ({ command: row.command.slice(0, 200), exitCode: row.exitCode, output: row.output.slice(0, 500) })) }, null, 2));
    console.log(JSON.stringify({ pass, calls: job.stats.calls, receipt }));
    if (!pass) process.exitCode = 1;
} catch (error: any) {
    await Bun.write(`${out}/worker-smoke.json`, JSON.stringify({ pass: false, error: String(error?.message || error), diagnostics,
        stats: job.stats, receipts: job.receipts }, null, 2));
    throw error;
} finally { await rm(runtime, { recursive: true, force: true }); }
