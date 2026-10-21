import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeJob } from '../../scripts/codex-runner/executor';
import { INVESTIGATION_PROMPT, newJob } from '../../scripts/codex-runner/protocol';

const outIndex = process.argv.indexOf('--out');
const out = outIndex < 0 ? undefined : process.argv[outIndex + 1];
const modelIndex = process.argv.indexOf('--model');
const model = modelIndex < 0 ? 'gpt-6-sol' : process.argv[modelIndex + 1];
if (!['gpt-6-sol', 'gpt-6-luna'].includes(model)) throw Error('Unsupported benchmark model');
if (!out || out === '--out' || await Bun.file(join(out, 'result.json')).exists()) throw Error('Use --out FRESH_PATH');
await mkdir(out, { recursive: true });
const root = await mkdtemp(join(tmpdir(), 'hackerika-repro-benchmark-'));
const source = `#include <stdlib.h>\n#include <string.h>\n#include <stdio.h>\nint main(void) { char *value = malloc(16); if (!value) return 2; strcpy(value, "hello"); free(value); volatile char first = value[0]; printf("%c\\n", first); return 0; }\n`;
const messageId = '800000000000001001';
const job = newJob({
  scope: '555555555555555555:700000000000001001', guildId: '555555555555555555',
  channelId: '700000000000001001', messageId, userId: '663394727688798231',
  route: model === 'gpt-6-luna' ? 'luna' : 'auto', kind: 'investigation',
  question: 'Periksa kode C yang aku kirim. Apakah benar ada heap use-after-free? Reproduksi di lab lokalmu, jalankan tesnya, lalu jelaskan hasil nyata atau error spesifik. Jangan menyimpulkan hanya dari web search.',
  context: 'Ini contoh sintetis untuk mengukur alur riset dan eksperimen lokal; tidak ada target jarak jauh.',
  artifacts: [{ name: 'sample.c', data: Buffer.from(source).toString('base64'), image: false, sourceMessageId: messageId }],
});
try {
  const started = Date.now();
  const signal = AbortSignal.timeout(180_000);
  let result: Awaited<ReturnType<typeof executeJob>> | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      result = await executeJob(job, model, root, signal, {
        image: process.env.CODEX_WORKER_IMAGE || 'hackerika-codex-worker:0.163.0-8', evidenceRetry: attempt === 1,
      });
      break;
    } catch (error: any) {
      if (attempt || String(error?.message) !== 'investigation_without_execution_receipt') throw error;
    }
  }
  if (!result) throw Error('missing_benchmark_result');
  // A sanitizer finding with a stack frame in the generated local binary is
  // stronger evidence than a shell wrapper's exit status (the test must fail).
  const compile = job.receipts.some(receipt => /\b(?:gcc|cc|clang)\b/.test(receipt.command) && receipt.exitCode === 0)
    || job.receipts.some(receipt => /heap-use-after-free/i.test(receipt.output)
      && /\/workspace\/(?:[\w.-]+-asan|A\d+-sample\.c:\d+)/.test(receipt.output));
  const observed = job.receipts.some(receipt => /heap-use-after-free/i.test(receipt.output));
  const pass = compile && observed && /use.after.free|setelah.*free|dibebaskan/i.test(result.result.summary);
  const report = {
    pass, model, image: process.env.CODEX_WORKER_IMAGE || 'hackerika-codex-worker:0.163.0-8',
    promptSha256: createHash('sha256').update(INVESTIGATION_PROMPT).digest('hex'),
    fixtureSha256: createHash('sha256').update(source).digest('hex'),
    elapsedMs: Date.now() - started, stats: job.stats, result: result.result,
    compile, observed, receipts: job.receipts.map(receipt => ({ command: receipt.command, exitCode: receipt.exitCode, output: receipt.output.slice(0, 1200) })),
  };
  await writeFile(join(out, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass, compile, observed, elapsedMs: report.elapsedMs, stats: job.stats, summary: result.result.summary }));
  if (!pass) process.exitCode = 1;
} finally {
  await rm(root, { recursive: true, force: true });
}
