import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WORKER_IMAGE } from '../../scripts/codex-runner/runtime';

const index = process.argv.indexOf('--out');
const out = index >= 0 ? process.argv[index + 1] : '';
if (!out || await Bun.file(join(out, 'result.json')).exists()) throw Error('Use --out FRESH_PATH');
// Controller startup reaps abandoned solver containers. Never run this smoke
// while any real job or another worker benchmark is running.
const workers = Bun.spawn(['docker', 'ps', '-q', '--filter', 'label=hackerika.solver=true'], { stdout: 'pipe' });
if ((await new Response(workers.stdout).text()).trim() || await workers.exited !== 0) throw Error('workers_must_be_idle');
const prod = await fetch('http://localhost/health', { unix: '/run/hackerika-codex/control.sock' }).then(r => r.json());
if (prod.running || prod.queued) throw Error('production_must_be_idle');
if (prod.ok) throw Error('run_during_worker_maintenance_only');
await mkdir(out, { recursive: true });
const root = await mkdtemp(join(tmpdir(), 'hr-controller-'));
const socket = join(root, 'control.sock');
const log = Bun.file(join(root, 'controller.log'));
const child = Bun.spawn([process.execPath, 'scripts/codex-runner/controller.ts'], {
  stdout: log, stderr: log,
  env: { ...process.env, CODEX_CONTROL_SOCKET: socket, CODEX_JOB_STATE_ROOT: join(root, 'state'),
    CODEX_JOB_RUNTIME_ROOT: join(root, 'run'), CODEX_WORKER_IMAGE: WORKER_IMAGE, CODEX_VERIFIED_MODELS: 'gpt-6-sol' },
});
let job: any;
const started = Date.now();
const post = async (path: string, body: unknown) => {
  const response = await fetch(`http://localhost${path}`, { unix: socket, method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};
try {
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    ready = await fetch('http://localhost/health', { unix: socket }).then(r => r.ok).catch(() => false);
    if (!ready) await Bun.sleep(200);
  }
  if (!ready) throw Error('controller_not_ready');
  const packet = { kind: 'investigation', route: 'auto', scope: '555555555555555555:700000000000009003',
    guildId: '555555555555555555', channelId: '700000000000009003', messageId: '800000000000009003',
    userId: '663394727688798231',
    question: 'Analisis CSV terlampir. Hitung median latency A, median B, dan rasio A/B dengan kode, lalu jawab ringkas. Tidak perlu web atau data Discord tambahan.',
    context: 'Uji integrasi sintetis; latency dalam milidetik.',
    artifacts: [{ name: 'latency.csv', sourceMessageId: '800000000000009003', image: false,
      data: Buffer.from('group,latency\nA,9\nA,11\nA,13\nB,3\nB,5\nB,7\n').toString('base64') }] };
  const queued = await post('/jobs', packet);
  if (queued.status !== 202 || !queued.body.ok) throw Error(`submission_failed:${queued.body.error}`);
  job = queued.body.job;
  while (['pending', 'running'].includes(job.state) && Date.now() - started < 240_000) {
    await Bun.sleep(1000);
    const state = await post('/jobs/get', { jobId: job.id, scope: packet.scope, userId: packet.userId });
    if (!state.body.ok) throw Error('job_disappeared');
    job = state.body.job;
  }
  const persisted = JSON.parse(await readFile(join(root, 'state', `${job.id}.json`), 'utf8'));
  const answer = job.result?.summary || '';
  const checks = { accepted: queued.status === 202, completed: job.state === 'completed', defaultSol: job.model === 'gpt-6-sol',
    executed: persisted.receipts.some((row: any) => row.exitCode === 0),
    skillRead: persisted.receipts.some((row: any) => row.exitCode === 0 && row.command.includes('resourceful-solve/SKILL.md')),
    calculated: /11/.test(answer) && /5/.test(answer) && /2[.,]2/.test(answer) };
  const pass = Object.values(checks).every(Boolean);
  await writeFile(join(out, 'result.json'), JSON.stringify({ pass, checks, elapsedMs: Date.now() - started, job,
    scope: 'Private controller/socket/state with synthetic IDs; no Discord poller or messages.' }, null, 2));
  console.log(JSON.stringify({ pass, checks, elapsedMs: Date.now() - started }));
  if (!pass) process.exitCode = 1;
} finally {
  child.kill('SIGTERM'); await child.exited;
  if (job?.id) await Bun.spawn(['docker', 'rm', '-f', `hackerika-solver-${job.id}`], { stdout: 'ignore', stderr: 'ignore' }).exited;
  await rm(root, { recursive: true, force: true });
}
