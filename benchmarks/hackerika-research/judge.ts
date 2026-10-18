import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { openai } from '../../src/utils/openai';
import { MODELS } from '../../src/Services/AI/models';
import { SHA } from './cases';
import { CASES } from './corpus';
import { VERSION as GRADER_VERSION, JUDGE_PROMPT } from './grader';
const index = process.argv.indexOf('--run');
const run = process.argv[index + 1];
if (index < 0 || !run) throw new Error('Use --run RESULT_DIRECTORY');
if (await Bun.file(`${run}/judgments.json`).exists()) throw new Error('Preserve prior judgments; use a fresh run');
const rows = JSON.parse(await readFile(`${run}/results.json`, 'utf8'));
const jobs = rows.filter((row: any) => !row.backend && !row.failure && !(row.action && row.action !== 'reply'));
// Reverse case ordering for alternating trials; the judge sees no variant/run label.
jobs.sort((a: any, b: any) => (a.trial - b.trial) || (a.trial % 2 ? b.caseId.localeCompare(a.caseId) : a.caseId.localeCompare(b.caseId)));
const judgments: any[] = [];
await writeFile(`${run}/judge-protocol.json`, JSON.stringify({ startedAt: new Date().toISOString(), model: MODELS.judge, rubricVersion: GRADER_VERSION, rubricHash: createHash('sha256').update(JUDGE_PROMPT).digest('hex'), samples: jobs.length, maxCalls: jobs.length, maxSecondsPerCall: 60, blindVariantLabels: true }, null, 2));
let next = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
    while (next < jobs.length) {
        const row = jobs[next++];
        const test = CASES.find(test => test.id === row.caseId)!;
        try {
            const response = await openai.chat.completions.create({ model: MODELS.judge, temperature: 0,
                response_format: { type: 'json_object' }, thinking: { type: 'disabled' },
                messages: [{ role: 'system', content: JUDGE_PROMPT }, { role: 'user', content: JSON.stringify({ prompt: test.prompt, primarySources: {repos:test.repos || [], pages:test.pages || {}, transportFixtureCommit: SHA}, discordProfileFixture: test.profile || null, searchFailed: test.searchFailed || false, expected: test.expected, maxWords: test.maxWords, visibleReply: row.text, effects: row.effects, tools: row.toolCalls }) }],
            } as any, { signal: AbortSignal.timeout(60_000), maxRetries: 0 });
            judgments.push({ caseId: row.caseId, trial: row.trial, ...JSON.parse(response.choices[0]?.message?.content || '{}'), usage: response.usage });
        } catch (error: any) { judgments.push({ caseId: row.caseId, trial: row.trial, pass: false, judgeError: error?.name || 'judge_failed' }); }
        await writeFile(`${run}/judgments.json`, JSON.stringify(judgments, null, 2));
    }
}));
const summary = { judged: judgments.length, passed: judgments.filter(row => row.pass).length, criticalFailures: judgments.reduce((n, row) => n + (row.criticalFailures?.length || 0), 0), judgeErrors: judgments.filter(row => row.judgeError).length };
await writeFile(`${run}/judge-summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
