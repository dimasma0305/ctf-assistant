import { readFile, writeFile } from 'node:fs/promises';
import { CASES } from './corpus';
import { assertMatchingJudges } from '../judge-provenance';
const option = (key: string) => { const i = process.argv.indexOf(key); return i < 0 ? '' : process.argv[i + 1]; };
const beforePath = option('--baseline'), afterPath = option('--candidate'), out = option('--out');
if (!beforePath || !afterPath || !out) throw new Error('Use --baseline RUN --candidate RUN --out JSON_PATH');
const load = async (root: string) => ({ protocol: JSON.parse(await readFile(`${root}/protocol.json`, 'utf8')),
    rows: JSON.parse(await readFile(`${root}/results.json`, 'utf8')), judgments: JSON.parse(await readFile(`${root}/judgments.json`, 'utf8')),
    judgeProtocol: JSON.parse(await readFile(`${root}/judge-protocol.json`, 'utf8')) });
const before = await load(beforePath), after = await load(afterPath);
assertMatchingJudges(before.judgeProtocol, after.judgeProtocol);
for (const field of ['corpusHash', 'workerHash', 'graderHash', 'repeats', 'split']) {
    if (before.protocol[field] !== after.protocol[field]) throw new Error(`Invalid comparison: ${field} differs`);
}
const key = (row: any) => `${row.caseId}:${row.trial}`;
if (JSON.stringify(before.rows.map(key).sort()) !== JSON.stringify(after.rows.map(key).sort())) throw new Error('Invalid comparison: sample identities differ');
function metrics(run: typeof before) {
    const judgments = new Map(run.judgments.map((row: any) => [key(row), row]));
    const rows = run.rows.map((row: any) => {
        const judged: any = judgments.get(key(row));
        const permittedSilence = row.action && row.action !== 'reply';
        const semanticPass = row.backend || permittedSilence ? true : !!judged?.pass && !judged?.judgeError;
        return { ...row, judged, combinedPass: row.deterministicPass && semanticPass,
            critical: !row.deterministicPass && CASES.find(test => test.id === row.caseId)?.critical || !!judged?.criticalFailures?.length };
    });
    const live = rows.filter((row: any) => !row.backend);
    const mean = (field: string) => { const values = run.judgments.filter((r: any) => typeof r[field] === 'number').map((r: any) => r[field]); return values.length ? values.reduce((a: number, b: number) => a + b, 0) / values.length : null; };
    return { samples: rows.length, passed: rows.filter((r: any) => r.combinedPass).length,
        liveSamples: live.length, livePassed: live.filter((r: any) => r.combinedPass).length,
        backendSamples: rows.length - live.length, backendPassed: rows.filter((r: any) => r.backend && r.combinedPass).length,
        criticalFailures: rows.filter((r: any) => r.critical).length, errors: rows.filter((r: any) => r.failure).length,
        judgeErrors: run.judgments.filter((r: any) => r.judgeError).length,
        quality: { contextAccuracy: mean('contextAccuracy'), factualAccuracy: mean('factualAccuracy'), naturalness: mean('naturalness'), judgedSamples: run.judgments.length },
        failedCases: rows.filter((r: any) => !r.combinedPass).map((r: any) => ({ caseId: r.caseId, trial: r.trial, deterministic: r.deterministicFailures, semantic: r.judged?.reason || null })),
        nativeSearchRequests: Object.fromEntries(rows.filter((r: any) => r.caseId.startsWith('web-')).map((r: any) => [key(r), r.effects.filter((e: any) => e.kind === 'native-web-request').length])),
    };
}
const baseline = metrics(before), candidate = metrics(after);
const gates = { backend: candidate.backendPassed === candidate.backendSamples, critical: candidate.criticalFailures === 0,
    liveCorrectness: candidate.livePassed / candidate.liveSamples >= 0.9,
    noRegression: candidate.livePassed >= baseline.livePassed, noErrors: candidate.errors === 0 && candidate.judgeErrors === 0 };
const result = { comparedAt: new Date().toISOString(), before: baseline, after: candidate, gates, passed: Object.values(gates).every(Boolean),
    caveats: ['Small synthetic corpus; model/judge outputs vary.', 'Controlled web fixtures measure reasoning and tool use; live-provider search requires separate smoke evidence.', 'Reported judgments are not a human-native or global-optimum baseline.'] };
await writeFile(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
process.exitCode = result.passed ? 0 : 2;
