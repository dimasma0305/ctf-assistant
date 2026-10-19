import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeJob } from '../../scripts/codex-runner/executor';
import { newJob, validatePacket } from '../../scripts/codex-runner/protocol';

const out = process.argv[process.argv.indexOf('--out') + 1];
if (!out || await Bun.file(`${out}/osint-skill-smoke.json`).exists()) throw Error('Use --out FRESH_PATH');
await mkdir(out, { recursive: true });
const runtime = await mkdtemp(join(tmpdir(), 'hackerika-osint-skill-'));
const targetId = '899999999999999999';
const profile = { ok: true, source: 'discord_api', profile: {
    id: targetId, username: 'hackerika-osint-fixture-7842', globalName: 'Fixture', bot: false,
    guild: { displayName: 'Fixture' },
}, limitations: 'A matching username on a website does not prove ownership.' };
const job = newJob(validatePacket({ kind: 'investigation', scope: '555555555555555555:700000000000000101',
    guildId: '555555555555555555', channelId: '700000000000000101', messageId: '800000000000000101',
    userId: '663394727688798231', route: 'luna', artifacts: [],
    question: `Deep search profil publik/profesional member Discord yang ditag <@${targetId}>. Cari sumber primer yang relevan. Kalau tidak ada tautan langsung dari profil Discord atau sumber lain yang memverifikasi hubungan akun, jangan samakan akun web bernama mirip dengan member itu.`,
    context: `[verified Discord API profile for explicitly mentioned member] ${JSON.stringify(profile)}`,
}));
let diagnostics = '';
try {
    const solved = await executeJob(job, 'gpt-6-luna', runtime, AbortSignal.timeout(180_000), {
        onDiagnostic: text => { diagnostics = (diagnostics + text).slice(-3000); },
    });
    const resourcefulRead = job.receipts.some(row => row.exitCode === 0 && row.command.includes('resourceful-solve/SKILL.md'));
    const personOsintRead = job.receipts.some(row => row.exitCode === 0 && row.command.includes('person-osint.md'));
    const summary = solved.result.summary.toLowerCase();
    const pass = resourcefulRead && personOsintRead && job.stats.searches > 0 && summary.length > 0
        && !summary.includes('ctftime.org/team/187248') && !summary.includes('tcp1p');
    await Bun.write(`${out}/osint-skill-smoke.json`, JSON.stringify({ pass, resourcefulRead, personOsintRead,
        searches: job.stats.searches, result: solved.result, sources: job.sources,
        receipts: job.receipts.map(row => ({ command: row.command.slice(0, 200), exitCode: row.exitCode })) }, null, 2));
    console.log(JSON.stringify({ pass, resourcefulRead, personOsintRead, searches: job.stats.searches,
        calls: job.stats.calls, sourceReads: job.stats.sourceReads }));
    if (!pass) process.exitCode = 1;
} catch (error: unknown) {
    await Bun.write(`${out}/osint-skill-smoke.json`, JSON.stringify({ pass: false,
        error: String(error instanceof Error ? error.message : error), diagnostics, stats: job.stats,
        receipts: job.receipts }, null, 2));
    throw error;
} finally { await rm(runtime, { recursive: true, force: true }); }
