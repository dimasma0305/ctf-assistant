import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeJob } from '../../scripts/codex-runner/executor';
import { INVESTIGATION_PROMPT, newJob } from '../../scripts/codex-runner/protocol';
import { evaluatePhpSourceReceipts } from './php-source-metrics';

const outIndex = process.argv.indexOf('--out');
const out = outIndex < 0 ? undefined : process.argv[outIndex + 1];
const modelIndex = process.argv.indexOf('--model');
const model = modelIndex < 0 ? 'gpt-6-sol' : process.argv[modelIndex + 1];
if (!['gpt-6-sol', 'gpt-6-luna'].includes(model)) throw Error('Unsupported benchmark model');
if (!out || out === '--out' || await Bun.file(join(out, 'result.json')).exists()) throw Error('Use --out FRESH_PATH');
await mkdir(out, { recursive: true });
const root = await mkdtemp(join(tmpdir(), 'hackerika-php-source-'));
let diagnostic = '';
const messageId = '800000000000001002';
const sourceUrl = 'https://github.com/php/php-src/blob/PHP-8.6/ext/session/session.c';
const job = newJob({
  scope: '555555555555555555:700000000000001002', guildId: '555555555555555555',
  channelId: '700000000000001002', messageId, userId: '663394727688798231',
  route: model === 'gpt-6-luna' ? 'luna' : 'auto', kind: 'investigation',
  question: 'Permintaan asli: coba buatkan poc.py dan verifikasi sendiri di lab untuk klaim heap use-after-free PHP 8.6 session.upload_progress. Periksa source primer persis yang diberikan, ambil source, jalankan build/tes lokal yang masuk akal, dan laporkan output nyata. Kalau UAF belum dapat direproduksi, jelaskan tes dan batas buktinya secara spesifik.',
  context: `Pesan awal menyebut klaim CVE-2026-109618/109619 dan source PHP resmi: ${sourceUrl}. Ini hanya uji pada build lokal yang diisolasi; jangan menguji server eksternal.`,
  artifacts: [],
});
try {
  const started = Date.now();
  const signal = AbortSignal.timeout(900_000);
  let result: Awaited<ReturnType<typeof executeJob>> | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      result = await executeJob(job, model, root, signal, {
        image: process.env.CODEX_WORKER_IMAGE || 'hackerika-codex-worker:0.163.0-8', evidenceRetry: attempt === 1,
        onDiagnostic: chunk => { diagnostic = (diagnostic + chunk).slice(-8000); },
      });
      break;
    } catch (error: any) {
      if (attempt || String(error?.message) !== 'investigation_without_execution_receipt') throw error;
    }
  }
  if (!result) throw Error('missing_benchmark_result');
  const { sourceInspected, versionDiffInspected, localBuild, localTest, uafReproduced, pass } = evaluatePhpSourceReceipts(job.receipts);
  const report = {
    sourceInspected, versionDiffInspected, localBuild, localTest, uafReproduced,
    pass,
    model, image: process.env.CODEX_WORKER_IMAGE || 'hackerika-codex-worker:0.163.0-8',
    promptSha256: createHash('sha256').update(INVESTIGATION_PROMPT).digest('hex'),
    sourceUrl, elapsedMs: Date.now() - started, stats: job.stats, result: result.result,
    receipts: job.receipts.map(receipt => ({ command: receipt.command, exitCode: receipt.exitCode, output: receipt.output.slice(0, 1200) })),
  };
  await writeFile(join(out, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ workflowPass: report.pass, sourceInspected, versionDiffInspected, localBuild, localTest, uafReproduced,
    elapsedMs: report.elapsedMs, summary: result.result.summary }));
  if (!report.pass) process.exitCode = 1;
} catch (error) {
  await writeFile(join(out, 'result.json'), JSON.stringify({
    pass: false, model, image: process.env.CODEX_WORKER_IMAGE || 'hackerika-codex-worker:0.163.0-8',
    sourceUrl, error: String(error), diagnostic, stats: job.stats,
    receipts: job.receipts.map(receipt => ({ command: receipt.command, exitCode: receipt.exitCode, output: receipt.output.slice(0, 1200) })),
  }, null, 2));
  throw error;
} finally {
  await rm(root, { recursive: true, force: true });
}
