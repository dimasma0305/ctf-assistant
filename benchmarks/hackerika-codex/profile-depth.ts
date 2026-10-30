import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeJob } from '../../scripts/codex-runner/executor';
import { INVESTIGATION_PROMPT, newJob } from '../../scripts/codex-runner/protocol';
import { ensureWorkerImage } from '../../scripts/codex-runner/workerImage';
import { WORKER_IMAGE } from '../../scripts/codex-runner/runtime';
import { githubReadFromReceipt } from './profile-evidence';

const index = process.argv.indexOf('--out');
const out = index >= 0 ? process.argv[index + 1] : '';
const traceIndex = process.argv.indexOf('--trace');
const trace = traceIndex >= 0 ? process.argv[traceIndex + 1] : '';
if (!out || await Bun.file(join(out, 'protocol.json')).exists()) throw Error('Use --out FRESH_PATH');
if (trace && await Bun.file(trace).exists()) throw Error('Use a fresh private trace path outside the repository');
const image = process.env.CODEX_WORKER_IMAGE || WORKER_IMAGE;
const seeds = ['https://hcs-team.com/members/', 'https://hcs-team.com/blog/cve-2026-1605/', 'https://ctftime.org/team/70159'];
const job = newJob({ kind: 'investigation', route: 'auto', scope: '555555555555555555:700000000000009002',
  guildId: '555555555555555555', channelId: '700000000000009002', messageId: '800000000000009002',
  userId: '663394727688798231', artifacts: [],
  question: 'Deepsearch profil publik/profesional @mirai (@miraicantsleep), apakah benar ada dia? Telusuri karya dan sumber terkait, bukan identitas privat.',
  context: JSON.stringify({ subject: { username: 'miraicantsleep', displayName: 'mirai' },
    previousAnswer: 'Riset sebelumnya hanya menyebut roster HCS, kredit pada artikel CVE-2026-1605, dan profil tim CTFtime.',
    candidateSources: seeds, attribution: 'Tiga URL ini petunjuk publik, belum bukti kendali akun Discord. Akun Discord benchmark sintetis; tidak ada izin menghubungi siapa pun.' }),
});
await mkdir(out, { recursive: true });
await writeFile(join(out, 'protocol.json'), JSON.stringify({ model: 'gpt-6-sol', image, date: new Date().toISOString(),
  question: job.packet.question, seeds, promptSha256: createHash('sha256').update(INVESTIGATION_PROMPT).digest('hex'),
  scope: 'Real worker and public web; synthetic Discord IDs, no controller job submission or Discord writes.',
  acceptance: 'Read both irai research references, inspect at least four distinct source pages including a discovered page beyond the three prior results, and produce a cited answer. These checks measure execution/depth only; human review must assess relevance, accuracy and attribution.' }, null, 2));
const runtime = await mkdtemp(join(tmpdir(), 'hr-profile-'));
let diagnostics = '';
const receipts: { command: string; exitCode: number; outputSha256: string }[] = [];
const skillReads = new Set<string>();
const terminalSources = new Set<string>();
const started = Date.now();
try {
  await ensureWorkerImage(image);
  const output = await executeJob(job, 'gpt-6-sol', runtime, AbortSignal.timeout(900_000), { image,
    onDiagnostic: text => { diagnostics = (diagnostics + text).slice(-3000); },
    onEvent: event => {
      if (event.type === 'item.completed' && event.item?.type === 'command_execution') {
        const command = String(event.item.command || ''), output = String(event.item.aggregated_output || '');
        const source = githubReadFromReceipt(command, event.item.exit_code, output);
        if (source) terminalSources.add(source);
        if (trace) appendFileSync(trace, JSON.stringify({ command, exitCode: event.item.exit_code,
          output: output.slice(0, 16000) }) + '\n', { mode: 0o600 });
        if (receipts.length < 200) receipts.push({ command: command.slice(0, 2500), exitCode: event.item.exit_code,
          outputSha256: createHash('sha256').update(output).digest('hex') });
        if (event.item.exit_code === 0 && output.trim() && /read|cat|sed|head|python/.test(command))
          for (const name of ['resourceful-solve/SKILL.md', 'person-osint.md'])
            if (command.includes(name)) skillReads.add(name);
        console.log(JSON.stringify({ commandCompleted: true, exit: event.item.exit_code, calls: job.stats.calls,
          searches: job.stats.searches, reads: job.stats.sourceReads }));
      }
    },
  });
  const sources = [...new Set([...output.sources.filter(source => source.content?.trim()).map(source => source.url), ...terminalSources])];
  const read = (name: string) => skillReads.has(name);
  const checks = { resourcefulRead: read('resourceful-solve/SKILL.md'), personOsintRead: read('person-osint.md'),
    distinctPages: sources.length >= 4, discoveredPage: sources.some(url => !seeds.includes(url)),
    citations: /https?:\/\//.test(output.result.summary), noFlags: output.result.flags.length === 0 };
  const pass = Object.values(checks).every(Boolean);
  await writeFile(join(out, 'result.json'), JSON.stringify({ pass, checks, stats: job.stats, elapsedMs: Date.now() - started,
    result: output.result, sources, terminalSources: [...terminalSources], receipts }, null, 2));
  console.log(JSON.stringify({ pass, checks, stats: job.stats, elapsedMs: Date.now() - started }));
  if (!pass) process.exitCode = 1;
} catch (error) {
  await writeFile(join(out, 'result.json'), JSON.stringify({ pass: false, error: String(error instanceof Error ? error.message : error),
    diagnostics, stats: job.stats, elapsedMs: Date.now() - started, sources: job.sources,
    receipts }, null, 2));
  throw error;
} finally { await rm(runtime, { recursive: true, force: true }); }
