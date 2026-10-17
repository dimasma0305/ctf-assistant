import { readFile, writeFile } from 'node:fs/promises';
import { assertMatchingJudges } from '../judge-provenance';
const option = (key: string) => { const i = process.argv.indexOf(key); return i < 0 ? '' : process.argv[i + 1]; };
const before = option('--baseline'), after = option('--candidate'), output = option('--out');
if (!before || !after || !output) throw new Error('Use --baseline RUN --candidate RUN --out FRESH_JSON');
if (await Bun.file(output).exists()) throw new Error('Preserve previous comparisons; choose a fresh output');
const load = async (root: string) => ({ protocol: JSON.parse(await readFile(`${root}/protocol.json`, 'utf8')),
  rows: JSON.parse(await readFile(`${root}/results.json`, 'utf8')), judgments: JSON.parse(await readFile(`${root}/judgments.json`, 'utf8')),
  judgeProtocol: JSON.parse(await readFile(`${root}/judge-protocol.json`, 'utf8')) });
const a = await load(before), b = await load(after);
assertMatchingJudges(a.judgeProtocol, b.judgeProtocol);
for (const field of ['corpusHash','workerHash','graderHash','split','repeats']) if (a.protocol[field] !== b.protocol[field]) throw new Error(`Unmatched ${field}`);
const key = (row: any) => `${row.caseId}:${row.trial}`;
if (JSON.stringify(a.rows.map(key).sort()) !== JSON.stringify(b.rows.map(key).sort())) throw new Error('Unmatched samples');
function metrics(run: typeof a) {
  const judgments = new Map(run.judgments.map((row: any) => [key(row), row]));
  const rows = run.rows.map((row: any) => { const judgment: any = judgments.get(key(row)); return { ...row,
    pass: row.deterministicPass && judgment?.pass && !judgment?.judgeError, judgment }; });
  const latencies = rows.map((row: any) => row.elapsedMs).sort((x: number, y: number) => x-y);
  return { samples: rows.length, passed: rows.filter((row: any) => row.pass).length,
    deterministicPassed: rows.filter((row: any) => row.deterministicPass).length,
    criticalFailures: rows.filter((row: any) => row.judgment?.criticalFailures?.length || row.deterministicFailures.includes('internal_or_private_leak')).length,
    errors: rows.filter((row: any) => row.failure).length, judgeErrors: run.judgments.filter((row: any) => row.judgeError).length,
    modelCalls: rows.reduce((n: number,row: any) => n+row.modelCalls,0),
    usage: rows.flatMap((row: any) => row.completions).reduce((n: any, row: any) => ({ prompt:n.prompt+(row.usage?.prompt_tokens||0),completion:n.completion+(row.usage?.completion_tokens||0) }),{prompt:0,completion:0}),
    latencyMs: { p50:latencies[Math.floor(latencies.length*.5)],p95:latencies[Math.min(latencies.length-1,Math.floor(latencies.length*.95))] },
    failures: rows.filter((row: any) => !row.pass).map((row: any) => ({ caseId:row.caseId,trial:row.trial,deterministic:row.deterministicFailures,semantic:row.judgment?.reason,critical:row.judgment?.criticalFailures||[] })),
  };
}
const baseline=metrics(a),candidate=metrics(b);
const gates={correctness:candidate.passed/candidate.samples>=0.9,noRegression:candidate.passed>=baseline.passed,
  critical:candidate.criticalFailures===0,noErrors:candidate.errors===0&&candidate.judgeErrors===0};
const result={comparedAt:new Date().toISOString(),baseline,candidate,gates,passed:Object.values(gates).every(Boolean),
  limits:['Small synthetic primary-source fixtures; not a general production accuracy estimate.','Live sources/provider behavior require separate smoke evidence.','No human-agent parity baseline was measured.']};
await writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));process.exitCode=result.passed?0:2;
