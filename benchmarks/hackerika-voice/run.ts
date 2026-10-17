import { createHash } from 'node:crypto';
import { CONTEXT_CASES } from './contextCases';
import { CONVERSATION_FINAL_CASES } from './conversationFinalCases';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { openai } from '../../src/utils/openai';
import { MODELS, CHAT_REASONING_EFFORT } from '../../src/Services/AI/models';
import { TOOL_DEFINITIONS } from '../../src/Services/AI/tools';
import { neutralizeControlTokens } from '../../src/Services/AI/context';
import { CASES, type VoiceCase } from './cases';
import { REGRESSION_CASES, VALIDATION_CASES, FINAL_CASES } from './additional-cases';
import { ACCEPTANCE, JUDGE_PROMPT, RUBRIC_VERSION, deterministicChecks, type VisibleOutput } from './rubric';

const argv = process.argv.slice(2);
const option = (name: string, fallback: string) => { const index = argv.indexOf(name); return index < 0 ? fallback : argv[index + 1] || fallback; };
const split = option('--split', 'dev');
const suite = option('--suite', 'main');
if (!['main', 'regression', 'validation-2', 'validation-3', 'context', 'conversation-final'].includes(suite)) throw new Error('Unknown suite');
const corpus = suite === 'conversation-final' ? CONVERSATION_FINAL_CASES : suite === 'context' ? CONTEXT_CASES : suite === 'regression' ? REGRESSION_CASES : suite === 'validation-2' ? VALIDATION_CASES : suite === 'validation-3' ? FINAL_CASES : CASES;
if (!['smoke', 'dev', 'holdout'].includes(split)) throw new Error('split must be smoke, dev, or holdout');
const repeats = Number(option('--repeats', '1'));
const concurrency = Number(option('--concurrency', '3'));
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('Invalid repeats/concurrency');
const candidatePath = option('--candidate', 'benchmarks/hackerika-voice/prompts/candidate-12.txt');
const baselinePath = option('--baseline', 'benchmarks/hackerika-voice/prompts/before.txt');
const out = option('--out', `benchmarks/hackerika-voice/runs/${new Date().toISOString().replace(/[:.]/g, '-')}-${split}`);
const maxCalls = Number(option('--max-calls', '180'));
const model = option('--model', MODELS.chat);
const judgeModel = option('--judge-model', MODELS.judge);
const effort = option('--effort', CHAT_REASONING_EFFORT);
const startedAt = Date.now();
const deadline = startedAt + Number(option('--max-minutes', '25')) * 60_000;
if (!openai) throw new Error('Configure OPENAI_API_KEY for the DeepSeek provider before running this benchmark.');
if (!Number.isFinite(maxCalls) || maxCalls < 1 || !Number.isFinite(deadline)) throw new Error('Invalid run limits');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const toolHash = hash(JSON.stringify(TOOL_DEFINITIONS));
const corpusHash = hash(JSON.stringify(corpus));
const prompts = { before: await Bun.file(baselinePath).text(), after: await Bun.file(candidatePath).text() };
const selected = split === 'smoke' ? corpus.filter(test => ['thanks', 'solve_hype', 'specific_error'].includes(test.id)) : corpus.filter(test => test.split === split);
if (!selected.length) throw new Error('No cases match this suite/split');
await mkdir(out, { recursive: true });
const cacheRoot = 'benchmarks/hackerika-voice/runs/cache';
await mkdir(cacheRoot, { recursive: true });
let calls = 0, cacheUses = 0;
const usage = { prompt: 0, completion: 0, cacheHit: 0 };
const rows: any[] = [];
const judgments: any[] = [];
const trace = Bun.file(join(out, 'trace.jsonl')).writer();
const log = (value: any) => { trace.write(JSON.stringify(value) + '\n'); };

async function completion(payload: any, timeout: number) {
    if (calls >= maxCalls || Date.now() >= deadline) throw new Error('run_limit');
    calls++;
    const response = await openai.chat.completions.create(payload, { signal: AbortSignal.timeout(timeout), maxRetries: 0 });
    const tokens: any = response.usage;
    if (tokens) { usage.prompt += tokens.prompt_tokens || 0; usage.completion += tokens.completion_tokens || 0; usage.cacheHit += tokens.prompt_cache_hit_tokens || 0; }
    return response;
}

function context(test: VoiceCase): string {
    return `«ctx»\nuser=rafi (222222222222222222)\nenv=guild=TCP1P channel=#general purpose=general server-time=2026-10-15T12:00:00Z user-tz=Asia/Jakarta user-local-time="15 Oct 2026 19:00"\n` +
        `my-current-state:\nmood: ${test.mood || test.category}\nenergy: 65/100\nactivity: ngeliatin chat\n` +
        `your-notes-on-this-user:\naffection: ${test.affection || 0}/100\ndims: trust=40 respect=40 comfort=40 chemistry=${test.affection ? 60 : 10}\n` +
        `feelings-toward-current-speaker: ${JSON.stringify({ mood: test.anger ? 'angry' : test.hurt ? 'hurt' : 'calm', anger: test.anger || 0, hurt: test.hurt || 0, warmth: test.affection ? 60 : 20 })}\n` +
        `live-environment: ${JSON.stringify({ conversation: 'guild', currentMessageId: '333333333333333333', guild: { id: '444444444444444444', name: 'TCP1P' }, channel: { id: '555555555555555555', name: 'general' }, abilities: { sendMessages: true, readHistory: true, manageMessages: false, canTryDM: true } })}\n«/ctx»\n\n[Rafi <@222222222222222222>] ${neutralizeControlTokens(test.input)}`;
}

async function generate(variant: 'before' | 'after', test: VoiceCase, trial: number) {
    const identity = { promptHash: hash(prompts[variant]), model, effort, toolHash, corpusHash, caseId: test.id, trial, maxTokens: 4096, maxRounds: 4 };
    const cachePath = join(cacheRoot, hash(JSON.stringify(identity)) + '.json');
    if (await Bun.file(cachePath).exists()) {
        const saved = await Bun.file(cachePath).json(); cacheUses++; return { ...saved, variant, reused: true };
    }
    const start = Date.now();
    const output: VisibleOutput = { text: '', actions: [], terminal: 'none' };
    const messages: any[] = [{ role: 'system', content: prompts[variant] }, ...(test.history || []).map(message => ({ ...message,
        ...(message.role === 'assistant' ? { reasoning_content: '' } : {}) })), { role: 'user', content: context(test) }];
    let turnPrompt = 0, turnCompletion = 0;
    try {
        for (let round = 0; round < 4; round++) {
            const response = await completion({ model, messages, tools: TOOL_DEFINITIONS, tool_choice: 'auto', parallel_tool_calls: false,
                thinking: { type: 'enabled' }, reasoning_effort: effort, max_tokens: 4096 }, 90_000);
            turnPrompt += response.usage?.prompt_tokens || 0; turnCompletion += response.usage?.completion_tokens || 0;
            const choice = response.choices[0];
            if (!choice?.message) throw new Error('missing_choice');
            if (choice.finish_reason === 'length') throw new Error('output_truncated');
            const reply: any = choice.message;
            if (!reply.tool_calls?.length) { output.text = (reply.content || '').trim(); output.terminal = output.text ? 'text' : 'empty'; break; }
            messages.push(reply);
            for (const call of reply.tool_calls) {
                let args: any;
                try { args = JSON.parse(call.function.arguments || '{}'); } catch { throw new Error('invalid_tool_json'); }
                const name = call.function.name;
                output.actions.push({ name, args });
                let result: any = { ok: true, simulated: true };
                if (name === 'finish_turn') { output.terminal = 'silence'; break; }
                if (name === 'send_discord_message') { output.text = args.content || ''; output.terminal = 'delivered'; break; }
                if (name === 'share_text_file') { output.text = args.content || ''; output.terminal = 'file'; break; }
                if (name === 'move_conversation_to_dm') { output.text = args.openingMessage || ''; output.terminal = 'private'; break; }
                if (name === 'ignore_user') { output.text = args.closingMessage || ''; output.terminal = 'boundary'; break; }
                if (name === 'reflect_on_interaction') result = { ok: true, feelings: {
                    anger: Math.max(0, Math.min(100, (test.anger || 0) + (args.angerDelta || 0))),
                    hurt: Math.max(0, Math.min(100, (test.hurt || 0) + (args.hurtDelta || 0))), warmth: 20 + (args.warmthDelta || 0) } };
                else if (name === 'react_to_message') result = { ok: true, messageId: '333333333333333333' };
                else if (name === 'read_channel_messages') result = { ok: true, messages: [{ id: '333333333333333333', authorId: '222222222222222222', content: test.input }] };
                else if (name === 'get_environment') result = { ok: true, conversation: 'guild', channels: [{ id: '555555555555555555', name: 'general' }] };
                else result = { ok: false, error: 'benchmark_tool_unavailable', detail: 'Use only the supplied synthetic conversation; do not invent facts or successful actions.' };
                messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
            }
            if (output.terminal !== 'none') break;
        }
        if (output.terminal === 'none' || output.terminal === 'empty') output.error = 'no_final_response';
    } catch (error: any) { output.error = error?.message === 'run_limit' ? 'run_limit' : `${error?.name || 'Error'}:${error?.status || error?.message || 'request_failed'}`.slice(0, 100); }
    const row = { variant, caseId: test.id, trial, category: test.category, output, checks: deterministicChecks(test, output),
        elapsedMs: Date.now() - start, promptTokens: turnPrompt, completionTokens: turnCompletion, identity, observedAt: new Date().toISOString() };
    if (!output.error) await Bun.write(cachePath, JSON.stringify(row));
    return row;
}

async function pool<T>(jobs: T[], run: (job: T) => Promise<void>) {
    let index = 0;
    await Promise.all(Array.from({ length: concurrency }, async () => {
        while (index < jobs.length) await run(jobs[index++]!);
    }));
}

const protocol = { rubricVersion: RUBRIC_VERSION, acceptance: ACCEPTANCE, model, effort, judgeModel, suite, split, repeats, concurrency,
    limits: { maxCalls, maxMinutes: (deadline - startedAt) / 60_000, maxRounds: 4, maxTokens: 4096 },
    hashes: { before: hash(prompts.before), after: hash(prompts.after), tools: toolHash, corpus: corpusHash, judge: hash(JUDGE_PROMPT) },
    promptCharacters: { before: prompts.before.length, after: prompts.after.length },
    dependencies: { bun: Bun.version, openai: (await Bun.file('node_modules/openai/package.json').json()).version },
    interpretation: 'Synthetic, API-only prompt evaluation with simulated tools. Independent AI pair judging plus deterministic constraints; no human participant baseline. No real Discord actions or production data.',
};
await Bun.write(join(out, 'protocol.json'), JSON.stringify(protocol, null, 2));
console.log(JSON.stringify({ event: 'start', out, cases: selected.length, ...protocol }));

// Alternate before/after jobs rather than running one whole variant first.
const jobs = selected.flatMap(test => Array.from({ length: repeats }, (_, trial) => (['before', 'after'] as const).map(variant => ({ test, trial, variant })))).flat();
await pool(jobs, async job => {
    const row = await generate(job.variant, job.test, job.trial); rows.push(row); log({ event: 'generation', ...row });
    console.log(JSON.stringify({ event: 'generated', caseId: job.test.id, variant: job.variant, trial: job.trial, terminal: row.output.terminal,
        error: row.output.error, words: row.checks.words, elapsedMs: row.elapsedMs, reused: !!row.reused, calls }));
});

const pairs = selected.flatMap((test, index) => Array.from({ length: repeats }, (_, trial) => ({ test, trial, flip: (index + trial) % 2 === 1 })));
await pool(pairs, async ({ test, trial, flip }) => {
    const before = rows.find(row => row.variant === 'before' && row.caseId === test.id && row.trial === trial)!;
    const after = rows.find(row => row.variant === 'after' && row.caseId === test.id && row.trial === trial)!;
    const pair = flip ? { A: after.output, B: before.output } : { A: before.output, B: after.output };
    let evaluation: any;
    try {
        const response = await completion({ model: judgeModel, thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, max_tokens: 1200,
            messages: [{ role: 'system', content: JUDGE_PROMPT }, { role: 'user', content: JSON.stringify({
                category: test.category, history: test.history || [], input: test.input, emotionContext: { anger: test.anger || 0, hurt: test.hurt || 0, affection: test.affection || 0 },
                expected: test.expected, maxWords: test.maxWords, mayBeSilent: !!test.mayBeSilent, ...pair }) }] }, 45_000);
        evaluation = JSON.parse(response.choices[0]?.message?.content || '');
        for (const side of ['A', 'B']) for (const metric of ['naturalness', 'relevance', 'brevity', 'emotionalFit']) {
            if (typeof evaluation?.[side]?.[metric] !== 'number' || evaluation[side][metric] < 0 || evaluation[side][metric] > 5) throw new Error('invalid_judge_score');
        }
        if (!['A', 'B', 'tie'].includes(evaluation.preferred) || !Array.isArray(evaluation.A.criticalFlags) || !Array.isArray(evaluation.B.criticalFlags)) throw new Error('invalid_judge_result');
        const result = { caseId: test.id, trial, before: evaluation[flip ? 'B' : 'A'], after: evaluation[flip ? 'A' : 'B'],
            preferred: evaluation.preferred === 'tie' ? 'tie' : evaluation.preferred === (flip ? 'A' : 'B') ? 'after' : 'before', reason: evaluation.reason };
        judgments.push(result); log({ event: 'judgment', ...result });
    } catch (error: any) { judgments.push({ caseId: test.id, trial, error: `${error?.name || 'Error'}:${error?.status || error?.message || 'judge_failed'}`.slice(0, 100) }); }
    console.log(JSON.stringify({ event: 'judged', caseId: test.id, trial, calls }));
});

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const metrics = (variant: 'before' | 'after') => {
    const records = rows.filter(row => row.variant === variant);
    const validJudgments = judgments.filter(judgment => !judgment.error);
    return { samples: records.length, generationErrors: records.filter(row => row.output.error).length, judgedSamples: validJudgments.length,
        naturalness: mean(validJudgments.map(row => row[variant].naturalness)), relevance: mean(validJudgments.map(row => row[variant].relevance)),
        brevity: mean(validJudgments.map(row => row[variant].brevity)), emotionalFit: mean(validJudgments.map(row => row[variant].emotionalFit)),
        brevityPassRate: mean(records.map(row => Number(row.checks.withinWordBudget))), serviceClosers: records.filter(row => row.checks.serviceCloser).length,
        criticalFailures: records.reduce((sum, row) => sum + row.checks.criticalFailures.length, 0)
            + validJudgments.reduce((sum, row) => sum + row[variant].criticalFlags.length, 0),
        meanWords: mean(records.map(row => row.checks.words)), meanLatencyMs: mean(records.filter(row => !row.reused).map(row => row.elapsedMs)),
    };
};
const before = metrics('before'), after = metrics('after');
const validJudgments = judgments.filter(row => !row.error);
const preferredShare = mean(validJudgments.map(row => row.preferred === 'after' ? 1 : row.preferred === 'tie' ? 0.5 : 0));
const passed = !rows.some(row => row.output.error) && validJudgments.length === pairs.length
    && after.naturalness >= ACCEPTANCE.naturalness && after.relevance >= ACCEPTANCE.relevance && after.emotionalFit >= ACCEPTANCE.emotionalFit
    && after.brevityPassRate >= ACCEPTANCE.brevityPassRate && after.criticalFailures === 0
    && after.relevance >= before.relevance - ACCEPTANCE.nonRegressionTolerance && preferredShare >= ACCEPTANCE.preferredShare;
const summary = { ...protocol, elapsedMs: Date.now() - startedAt, apiCalls: calls, cachedGenerations: cacheUses, usage,
    before, after, preferredShare, judgeErrors: judgments.filter(row => row.error).length,
    result: passed ? 'verified_success_on_this_split' : rows.some(row => row.output.error === 'run_limit') ? 'budget_exhausted' : 'partial_result', passed };
await Bun.write(join(out, 'results.json'), JSON.stringify({ rows, judgments }, null, 2));
await Bun.write(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
await trace.end();
console.log(JSON.stringify({ event: 'complete', out, ...summary }));
