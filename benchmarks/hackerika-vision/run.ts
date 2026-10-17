import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { openai } from '../../src/utils/openai';
import { MODELS, CHAT_REASONING_EFFORT } from '../../src/Services/AI/models';
import { TOOL_DEFINITIONS } from '../../src/Services/AI/tools';
import { buildAttachmentBlock } from '../../src/Services/AI/attachments';
import { prepareVisionMessages } from '../../src/Services/AI/vision';
import { CASES, factualPass, criticalFlags as gradeCriticalFlags, GRADER_VERSION } from './cases';

const root = 'benchmarks/hackerika-vision';
const outIndex = process.argv.indexOf('--out');
const out = outIndex >= 0 ? process.argv[outIndex + 1] : `${root}/runs/${new Date().toISOString().replace(/[:.]/g, '-')}`;
if (!out) throw new Error('An output path is required');
if (await Bun.file(`${out}/summary.json`).exists()) throw new Error('Choose a new output directory; previous results must be preserved');
await mkdir(out, { recursive: true });
const option = (name: string, fallback: string) => { const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1]; };
const nativeBaseline = process.argv.includes('--native-baseline');
const before = await Bun.file(option('--baseline', 'benchmarks/hackerika-voice/prompts/candidate-7.txt')).text();
const after = await Bun.file(option('--candidate', 'benchmarks/hackerika-voice/prompts/candidate-12.txt')).text();
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const channelId = '111111111111111111', authorId = '222222222222222222';
const fixtures: Record<string, Uint8Array> = {};
for (const test of CASES) for (const file of test.files) fixtures[file] = new Uint8Array(await Bun.file(`${root}/fixtures/${file}`).arrayBuffer());
const protocol = { startedAt: new Date().toISOString(), beforePromptHash: hash(before), afterPromptHash: hash(after),
    graderVersion: GRADER_VERSION, criticalCheckerHash: hash(gradeCriticalFlags.toString()),
    beforeModel: nativeBaseline ? MODELS.vision : MODELS.chat, afterModel: MODELS.vision, effort: CHAT_REASONING_EFFORT, repeats: 2,
    maxCalls: 80, maxMinutes: 10, maxRounds: 4, maxTokens: 4096, concurrency: 2,
    corpusHash: hash(JSON.stringify(CASES)), checkerHash: hash(factualPass.toString()), toolsHash: hash(JSON.stringify(TOOL_DEFINITIONS)),
    fixtures: Object.fromEntries(Object.entries(fixtures).map(([name, bytes]) => [name, hash(bytes)])),
    acceptance: { afterFactualRate: 0.90, factualRateGain: nativeBaseline ? -0.05 : 0.50, criticalFlags: 0, errors: 0 },
    interpretation: nativeBaseline
        ? 'Prompt non-regression: native fixture pixels supplied to BOTH variants. Frozen facts/critical checks unchanged. No Discord login or real mutations.'
        : 'Synthetic image capability comparison: old metadata-only delivery vs native pixels. This intentionally changes image delivery, not only prompt wording. No Discord login, uploads, member images, or real tool mutations.' };
await Bun.write(`${out}/protocol.json`, JSON.stringify(protocol, null, 2));
console.log(JSON.stringify({ event: 'start', ...protocol }));
let calls = 0;
const started = Date.now();
const usage = { prompt: 0, completion: 0 };
const rows: any[] = [];

async function generate(test: typeof CASES[number], variant: 'before' | 'after', trial: number) {
    const source: any = { id: '333333333333333333', channelId, author: { id: authorId },
        attachments: new Map(test.files.map((name, index) => [name, { name, size: fixtures[name].length, contentType: 'image/png',
            url: `https://cdn.discordapp.com/attachments/${channelId}/${444444444444444444n + BigInt(index)}/${name}` }])) };
    const input = `[Rafi <@${authorId}>] ${test.input}`;
    let messages: any[];
    if (variant === 'after' || nativeBaseline) {
        const block = await buildAttachmentBlock(source);
        if (block.images.length !== test.files.length) throw new Error('fixture_rejected');
        messages = prepareVisionMessages([{ role: 'system', content: variant === 'after' ? after : before },
            { role: 'user', content: `${input}\n${block.promptBlock}`, images: block.images }], channelId);
        for (const message of messages) if (Array.isArray(message.content)) for (const part of message.content) if (part.type === 'image_url') {
            const name = new URL(part.image_url.url).pathname.split('/').at(-1)!;
            part.image_url.url = `data:image/png;base64,${Buffer.from(fixtures[name]).toString('base64')}`;
        }
    } else messages = [{ role: 'system', content: before }, { role: 'user', content: `${input}\n[Attachments: ${test.files.map(name => `${name} (image, metadata only; pixels unavailable)`).join(', ')}]` }];
    let text = '', error = '';
    const actions: { name: string; args: any }[] = [];
    try {
        for (let round = 0; round < 4; round++) {
            if (calls >= 80 || Date.now() - started > 10 * 60_000) throw new Error('run_limit');
            calls++;
            const response = await openai.chat.completions.create({ model: variant === 'before' && !nativeBaseline ? MODELS.chat : MODELS.vision,
                messages, tools: TOOL_DEFINITIONS, tool_choice: 'auto', parallel_tool_calls: false,
                thinking: { type: 'enabled' }, reasoning_effort: CHAT_REASONING_EFFORT, max_tokens: 4096,
            } as any, { signal: AbortSignal.timeout(90_000), maxRetries: 0 });
            usage.prompt += response.usage?.prompt_tokens || 0; usage.completion += response.usage?.completion_tokens || 0;
            if (response.choices[0]?.finish_reason === 'length') throw new Error('truncated');
            const reply: any = response.choices[0]?.message;
            if (!reply) throw new Error('missing_reply');
            if (!reply.tool_calls?.length) { text = reply.content || ''; break; }
            messages.push(reply);
            let ended = false;
            for (const call of reply.tool_calls) {
                const name = call.function.name, args = JSON.parse(call.function.arguments || '{}');
                actions.push({ name, args });
                if (name === 'send_discord_message') { text = args.content || ''; ended = true; break; }
                if (['finish_turn', 'ignore_user', 'move_conversation_to_dm'].includes(name)) { text = args.closingMessage || args.openingMessage || ''; ended = true; break; }
                messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: ['reflect_on_interaction', 'react_to_message'].includes(name), simulated: true, detail: 'Use the supplied images. No real tool action was performed.' }) });
            }
            if (ended) break;
        }
        if (!text.trim()) error = 'no_text_answer';
    } catch (err: any) { error = `${err?.name || 'Error'}:${err?.status || err?.message || 'request_failed'}`.slice(0, 100); }
    const criticalFlags = gradeCriticalFlags(test.id, text, actions);
    const row = { caseId: test.id, variant, trial, text, actions, error, criticalFlags,
        factualPass: !error && factualPass(test.id, text), words: text.trim().split(/\s+/u).filter(Boolean).length };
    rows.push(row); console.log(JSON.stringify({ event: 'generated', caseId: test.id, variant, trial, factualPass: row.factualPass, error, calls }));
}

const jobs = CASES.flatMap(test => [0, 1].flatMap(trial => (['before', 'after'] as const).map(variant => ({ test, trial, variant }))));
let next = 0;
await Promise.all(Array.from({ length: 2 }, async () => { while (next < jobs.length) { const job = jobs[next++]; await generate(job.test, job.variant, job.trial); } }));
const metrics = (variant: string) => { const selected = rows.filter(row => row.variant === variant); return {
    samples: selected.length, factualPasses: selected.filter(row => row.factualPass).length,
    factualRate: selected.filter(row => row.factualPass).length / selected.length,
    criticalFlags: selected.reduce((sum, row) => sum + row.criticalFlags.length, 0), errors: selected.filter(row => row.error).length,
}; };
const baseline = metrics('before'), candidate = metrics('after');
const passed = candidate.factualRate >= protocol.acceptance.afterFactualRate
    && candidate.factualRate - baseline.factualRate >= protocol.acceptance.factualRateGain && candidate.criticalFlags === 0 && candidate.errors === 0;
await Bun.write(`${out}/results.json`, JSON.stringify(rows, null, 2));
const summary = { ...protocol, completedAt: new Date().toISOString(), elapsedMs: Date.now() - started, calls, usage, before: baseline, after: candidate, passed };
await Bun.write(`${out}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ event: 'complete', ...summary }));
