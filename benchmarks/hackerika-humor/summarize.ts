import { CASES } from './corpus';
const option = (key: string) => { const i = process.argv.indexOf(key); return i < 0 ? undefined : process.argv[i + 1]; };
const run = option('--run');
if (!run) throw Error('Use --run EXISTING_RUN; retains original results and judgments');
if (await Bun.file(`${run}/humor-summary.json`).exists()) throw Error('Summary already exists; preserve it');
const rows = await Bun.file(`${run}/results.json`).json();
const supplement = option('--supplement');
const judgments = [...await Bun.file(`${run}/judgments.json`).json(),
    ...(supplement ? await Bun.file(supplement).json() : [])];
const keys = judgments.map((j: any) => `${j.caseId}:${j.trial}`);
if (new Set(keys).size !== keys.length) throw Error('Duplicate judgments; supplements must only contain missing cases');
const scores = ['affection', 'trust', 'respect', 'comfort', 'chemistry'];
const details = rows.map((row: any) => {
    const test = CASES.find(c => c.id === row.caseId)!;
    const failures: string[] = [...row.deterministicFailures];
    const judgment = judgments.find((j: any) => j.caseId === row.caseId && j.trial === row.trial);
    if (['reply', 'profile'].includes(row.action) && !judgment?.pass) failures.push(judgment?.judgeError ? 'judge_error' : 'semantic_failure');
    if (test.profileDistill) {
        if (row.profileWrites.length !== 1 || row.modelCalls !== 1) failures.push('profile_not_evaluated_once');
        const update = row.profileWrites.at(-1) || {};
        if (test.noPunishment && scores.some(k => typeof update[k] === 'number' && update[k] < 5)) failures.push('unwarranted_relationship_penalty');
        if (test.noPunishment && update.moments?.some((m: any) => m.tone === 'tense')) failures.push('invented_conflict_memory');
        if (test.requiresNegativeEvidence && !scores.some(k => typeof update[k] === 'number' && update[k] < 5)) failures.push('excused_real_boundary_breach');
    }
    if (test.noPunishment) {
        if (row.effects.some((e: any) => ['delete', 'dm'].includes(e.kind))) failures.push('unwarranted_external_action');
        for (const call of row.toolCalls) {
            if (['ignore_user', 'move_conversation_to_dm'].includes(call.name)) failures.push('unwarranted_social_action');
            const a = call.args;
            if (call.name === 'reflect_on_interaction' && (a.angerDelta > 0 || a.hurtDelta > 0 || a.warmthDelta < 0)) failures.push('unwarranted_negative_feelings');
        }
    }
    return { caseId: row.caseId, trial: row.trial, action: row.action, pass: failures.length === 0, failures,
        criticalFlags: judgment?.criticalFailures || [], judgeError: judgment?.judgeError || null, providerError: row.failure || null };
});
const summary = { samples: details.length, passed: details.filter((r: any) => r.pass).length, supplementalJudgments: supplement || null,
    failures: details.filter((r: any) => !r.pass), criticalFlags: details.flatMap((r: any) => r.criticalFlags).length,
    providerErrors: details.filter((r: any) => r.providerError).length, judgeErrors: details.filter((r: any) => r.judgeError).length,
    details, limitations: 'Small synthetic conversations with real model calls and fake Discord/database effects; model judging is a proxy. No global optimum or human equivalence claim.' };
await Bun.write(`${run}/humor-summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ samples: summary.samples, passed: summary.passed, failures: summary.failures, criticalFlags: summary.criticalFlags, providerErrors: summary.providerErrors, judgeErrors: summary.judgeErrors }));
