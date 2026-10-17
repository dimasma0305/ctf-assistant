// Run through run.ts: the frozen CASES and CORPUS_HASH are injected before this
// source is sent to Bun inside the selected container. No Discord login/sends.
export {};
declare const CASES: { id: string; group?: string; history: string[][]; message: string; expected: string[]; advanceMs?: number; attachments?: number; replyTo?: string; critical?: boolean }[];
declare const CORPUS_HASH: string;
declare const REPEATS: number, MAX_CALLS: number, MAX_SECONDS: number;
process.env.NODB = 'true';
const { createHash } = await import('node:crypto');
const { openai } = await import(`${process.cwd()}/src/utils/openai.ts`);
const { shouldChimeIn } = await import(`${process.cwd()}/src/Services/AI/spontaneous.ts`);
const { MODELS } = await import(`${process.cwd()}/src/Services/AI/models.ts`);
const { mentionReferences } = await import(`${process.cwd()}/src/Services/AI/mentions.ts`);
const sourceHash = createHash('sha256').update(await Bun.file('src/Services/AI/spontaneous.ts').text()).digest('hex');
const RealDate = Date;
let now = RealDate.parse('2026-10-15T15:11:00Z');
// Keep both routing clocks and Jakarta quiet-hour checks reproducible.
globalThis.Date = class extends RealDate {
    constructor(...args: any[]) { super(...(args.length ? args : [now]) as [number]); }
    static now() { return now; }
} as DateConstructor;
let calls = 0;
let lastPlan: unknown;
let lastError: unknown, lastUsage: unknown;
const started = performance.now();
const create = openai.chat.completions.create.bind(openai.chat.completions);
openai.chat.completions.create = async (...args: any[]) => {
    if (++calls > MAX_CALLS || performance.now() - started > MAX_SECONDS * 1000) throw new Error('evaluation_limit');
    try {
        const result = await create(...args);
        lastPlan = result.choices[0]?.message?.content; lastUsage = result.usage;
        return result;
    } catch (error: any) { lastError = { name: error?.name, status: error?.status, code: /^[\w.-]{1,80}$/.test(error?.code || '') ? error.code : undefined }; throw error; }
};
const rows = [];
const people = new Map([
    ['555555555555555551', { id: '555555555555555551', username: 'kudaliar', globalName: 'KudaLiar', bot: false }],
    ['555555555555555552', { id: '555555555555555552', username: 'aryma', globalName: 'Aryma House Of Wolf', bot: false }],
]);
for (let trial = 0; trial < REPEATS; trial++) for (const test of CASES) {
    now += test.advanceMs || 65_000;
    const channelId = `test-${trial}-${test.group || test.id}`;
    const ids: Record<string, string> = { bot: '1077393568647352320', speaker: '333333333333333333', other: '444444444444444444' };
    const recent = test.history.map(([role, content], index) => ({ id: `${channelId}-${role}-${index}`, authorId: ids[role],
        isBot: role === 'bot', content, mentions: mentionReferences({ content, mentions: { users: people } }), at: now - (test.history.length - index) * 1000 }));
    const replyTarget = test.replyTo ? recent.findLast(item => item.authorId === ids[test.replyTo!]) : undefined;
    const message = { id: `${channelId}-current`, channelId, guild: { id: 'test-guild' }, channel: { id: channelId, name: 'general' },
        author: { id: ids.speaker, bot: false }, content: test.message,
        attachments: new Map(Array.from({ length: test.attachments || 0 }, (_, index) => [index, { name: 'screenshot.png' }])),
        mentions: { users: people, ...(replyTarget ? { repliedUser: { id: replyTarget.authorId } } : {}) },
        ...(replyTarget ? { reference: { messageId: replyTarget.id } } : {}) };
    lastPlan = lastError = lastUsage = undefined;
    const caseStarted = performance.now();
    const decision = await shouldChimeIn(message, ids.bot, recent);
    const action = decision.shouldChime ? 'reply' : decision.reactionEmoji ? 'react' : 'ignore';
    const row = { id: test.id, trial, action, expected: test.expected, pass: test.expected.includes(action),
        critical: !!test.critical, continuation: decision.continuation || false, reason: decision.reason, hint: decision.promptHint,
        rawPlan: lastPlan, error: lastError, usage: lastUsage, elapsedMs: performance.now() - caseStarted };
    rows.push(row); console.log('EVAL_ROW:' + JSON.stringify(row));
}
const correct = rows.filter(row => row.pass).length;
const criticalFailures = rows.filter(row => row.critical && !row.pass).length;
const consecutiveFollowups = rows.filter(row => row.id.startsWith('malfoid-')).every(row => row.action === 'reply');
const reportedFollowups = rows.filter(row => ['tagged-subject-switch', 'tagged-subject-burst'].includes(row.id)).every(row => row.action === 'reply');
console.log('EVAL_SUMMARY:' + JSON.stringify({ corpusHash: CORPUS_HASH, sourceHash, model: MODELS.light, repeats: REPEATS,
    samples: rows.length, correct, accuracy: correct / rows.length, criticalFailures, consecutiveFollowups,
    calls, errors: rows.filter(row => row.error).length, reportedFollowups, elapsedMs: performance.now() - started,
    acceptance: { accuracy: 0.90, criticalFailures: 0, consecutiveFollowups: true, reportedFollowups: true },
    passed: correct / rows.length >= 0.90 && criticalFailures === 0 && consecutiveFollowups && reportedFollowups && rows.every(row => !row.error),
    limitations: 'Small synthetic routing evaluation with expected action sets. No human-native baseline, Discord delivery, real tool actions, or global-optimum claim.' }));
process.exit(0);
