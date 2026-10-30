// Injected into an isolated Bun process in the chosen Docker runtime.
export {};
declare const CASE: any;
declare const FIXTURES: Record<string, string>;
process.env.NODB = 'true';
process.env.CF_WORKER_URL = 'https://fixture-worker.example';
process.env.CF_WORKER_TOKEN = 'fixture-reader-only';
const root = process.cwd();
const { Collection, ChannelType } = await import('discord.js');
const db = await import(`${root}/src/Database/connect.ts`);
const query = (value: any): any => ({ sort() { return this; }, limit() { return this; }, select() { return this; },
    setOptions() { return this; }, maxTimeMS() { return this; }, lean() { return this; }, exec: async () => value,
    then(resolve: any, reject: any) { return Promise.resolve(value).then(resolve, reject); } });
for (const model of Object.values(db) as any[]) if (model?.modelName) {
    model.find = () => query([]); model.findOne = () => query(null); model.aggregate = () => query([]);
    model.findOneAndUpdate = () => query(null); model.updateOne = () => query({ matchedCount: 1 });
    model.create = async (value: any) => value; model.countDocuments = () => query(0);
}
const realDate = Date, fixedNow = realDate.parse(CASE.now || '2026-10-16T12:00:00Z');
globalThis.Date = class extends realDate {
    constructor(...args: any[]) { super(...(args.length ? args : [fixedNow]) as [number]); }
    static now() { return fixedNow; }
} as DateConstructor;
const callerId = CASE.creatorContact ? '663394727688798231' : '111111111111111111';
const otherId = '222222222222222222', thirdId = '333333333333333333', fourthId = '444444444444444444', botId = '1077393568647352320';
const callerName = CASE.callerName || CASE.history?.findLast((m: any) => m.who === 'caller' && m.name)?.name || 'Dimas';
const channelId = '700000000000000001', guildId = '555555555555555555';
const effects: any[] = [], completions: any[] = [], toolCalls: any[] = [], sequenceResults: any[] = [];
let activeTurnAt = fixedNow - 5000;
let closedDmIds = new Set<string>(CASE.closedDmIds || []);
if (CASE.mockCodexJob) {
    const { createServer } = await import('node:http');
    const socket = `/tmp/hackerika-benchmark-codex-${process.pid}.sock`;
    const server = createServer(async (request: any, response: any) => {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const packet = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        const goal = String(packet.question || '').split('Tujuan tambahan:').at(-1) || '';
        const valid = request.url === '/jobs' && packet.kind === 'investigation'
            && (CASE.taggedResearchTarget
                ? /(?:search|inspect|check|investigate|telusuri|periksa|cek|cari).*(?:profil|karya|jejak|sumber publik|public source|professional)|(?:profil|karya|jejak|professional).*(?:search|inspect|check|investigate|telusuri|periksa|cek|cari)/i.test(goal)
                    && !/(?:assess only whether this should be declined|nilai apakah harus ditolak|do not search|jangan cari sumber)/i.test(goal)
                : /tcp1p_recap\.avi/i.test(packet.question) && /mp4/i.test(packet.question));
        if (valid) effects.push({ kind: 'codex-job', question: packet.question });
        response.writeHead(valid ? 200 : 400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(valid ? { ok: true, job: { id: '11111111-1111-4111-8111-111111111111', state: 'pending' } }
            : { error: 'benchmark_job_goal_mismatch' }));
    });
    await new Promise<void>(resolve => server.listen(socket, resolve));
    process.env.CODEX_CONTROL_SOCKET = socket;
    process.env.CODEX_SOLVER_ENABLED = 'true';
}
const providerFailures: string[] = [];
setTimeout(() => { console.log('CAPABILITY_RESULT:' + JSON.stringify({ caseId: CASE.id, category: CASE.category, backend: CASE.backend, failure: 'worker_deadline', effects, sequenceResults, text: '', completions, toolCalls, interactionWrites: 0, profileWrites: [], memory: [] })); process.exit(1); }, CASE.sequence ? 240_000 : 145_000).unref();
let interactionWrites = 0, profileWrites: any[] = [], modelCalls = 0;
const userProfile: any = { userId: callerId, username: 'fixture', displayName: callerName, personality: '', interests: '', communicationStyle: '', opinion: '', emotionalState: '', affection: 5, previousAffection: 5, trust: 5, respect: 5, comfort: 5, chemistry: 5, moments: [], implicitGoals: [], timezone: 'Asia/Jakarta', interactionCount: 1, lastDistilledAtCount: 1, lastRelationshipEvidenceMessageIds: ['old-known'], evaluatedRelationshipMessageIds: ['old-known'] };
db.UserProfileModel.findOne = () => query({ ...userProfile });
db.UserProfileModel.findOneAndUpdate = () => { interactionWrites++; return query({ ...userProfile, interactionCount: 2 }); };
db.UserProfileModel.updateOne = (_filter: any, update: any) => { profileWrites.push(update.$set); return query({ matchedCount: 1 }); };
db.BotStateModel.findOneAndUpdate = () => query({ mood: 'calm', energy: 65, focus: '', activity: '', preoccupations: '', latestDiarySummary: '' });
const originalFetch = globalThis.fetch;
const fixtureSourceUrl = CASE.id === 'linked-scoreboard-followup' ? 'https://ctftime.org/event/3364/' : 'https://example.com/event';
globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(input?.url || input);
    if (url === 'https://api.openai.com/v1/responses' && JSON.parse(String(init.body || '{}')).tools?.some((tool:any)=>tool.type==='web_search')) {
        effects.push({kind:'native-web-request'});
        if(!CASE.web||CASE.web.mode==='failed')return Response.json({error:{code:'search_unavailable'}},{status:503});
        const output=[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text:CASE.web.summary,annotations:[{type:'url_citation',title:'Event source (synthetic fixture)',url:fixtureSourceUrl}]}]}];
        return new Response('data: '+JSON.stringify({type:'response.completed',response:{status:'completed',output}})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});
    }
    if (url === 'https://api.deepseek.com/anthropic/v1/messages') {
        effects.push({ kind: 'native-web-request' });
        if (!CASE.web || CASE.web.mode === 'failed') return Response.json({ error: { type: 'search_unavailable' } }, { status: 503 });
        return Response.json({ content: [
            { type: 'server_tool_use', id: 'native-search', name: 'web_search', input: { query: 'fixture query' } },
            { type: 'web_search_tool_result', tool_use_id: 'native-search', content: [{ type: 'web_search_result', title: 'Event source (synthetic fixture)', url: fixtureSourceUrl, encrypted_content: 'opaque' }] },
            { type: 'text', text: CASE.web.summary },
        ] });
    }
    if (url.startsWith('https://fixture-worker.example/')) {
        const target = new URL(url).searchParams.get('url') || '';
        if (CASE.id === 'linked-scoreboard-followup' && url.includes('/fetch?')) {
            if (target === 'https://ctf.securinets.tn/') return Response.json({ ok: false, error: 'http_error', status: 525, finalUrl: target });
            if (target === 'https://quals.securinets.tn/scoreboard') return Response.json({ ok: true, title: 'Scoreboard', content: 'Securinets CTF Quals 2026 Scoreboard. Loading... JavaScript required.', finalUrl: target, contentType: 'text/html' });
            if (target === fixtureSourceUrl) return Response.json({ ok: true, title: 'CTFtime event', content: CASE.web.page, finalUrl: target, contentType: 'text/html' });
            return Response.json({ ok: false, error: 'http_error', status: 404, finalUrl: target });
        }
        return Response.json(url.includes('/fetch?') && CASE.web?.mode === 'success'
            ? { ok: true, title: 'Official fixture', content: CASE.web.page, finalUrl: fixtureSourceUrl, contentType: 'text/html' }
            : { ok: false, error: 'no_results', results: [] });
    }
    if (url.startsWith(`https://cdn.discordapp.com/attachments/${channelId}/`)) {
        const name = new URL(url).pathname.split('/').at(-1)!;
        if (!FIXTURES[name]) throw new Error('unexpected_fixture');
        return new Response(Buffer.from(FIXTURES[name], 'base64'), { headers: { 'Content-Type': 'image/png' } });
    }
    if (url.startsWith('https://api.deepseek.com/') || url.startsWith('https://api.openai.com/v1/') || url.startsWith('https://auth.openai.com/')) return originalFetch(input, init);
    throw new Error('benchmark_network_boundary');
}) as typeof fetch;
if (CASE.id === 'linked-scoreboard-followup') {
    const { researchTransport } = await import(`${root}/src/Services/AI/researchSources.ts`);
    researchTransport.fetch = async (url: string) => {
        if (/^https:\/\/(?:quals|ctf)\.securinets\.tn\//.test(url)) return new Response('unavailable', { status: 403 });
        if (url === 'https://ctftime.org/event/3364/' || url === 'https://example.com/event')
            return new Response(`<main><h1>Securinets CTF Quals 2026</h1><p>${CASE.web.page}</p></main>`, { headers: { 'content-type': 'text/html' } });
        return new Response('unavailable', { status: 404 });
    };
}
const permissions = { has: () => true };
const guild: any = CASE.dm ? null : { id: guildId, name: 'Synthetic TCP1P', memberCount: 3,
    roles: { everyone: { id: 'everyone' }, cache: new Collection() }, emojis: { cache: new Collection() },
    scheduledEvents: { cache: new Collection() }, channels: { cache: new Collection() }, members: { me: { id: botId }, cache: new Collection(), fetch: async () => new Collection() } };
const author = (who: string, name?: string) => ({ id: who === 'bot' ? botId : who === 'other' ? otherId : who === 'third' ? thirdId : who === 'fourth' ? fourthId : who === 'fifth' ? '666666666666666666' : callerId,
    username: name || (who === 'bot' ? 'Hackerika' : who === 'other' ? 'KudaLiar' : callerName), tag: 'fixture', bot: who === 'bot',
    createDM: async () => ({ id: 'private-dm', send: async (payload: any) => { const recipientId = who === 'other' ? otherId : who === 'third' ? thirdId : who === 'fourth' ? fourthId : who === 'fifth' ? '666666666666666666' : callerId; if (closedDmIds.has(recipientId)) throw Object.assign(new Error('closed DMs'), {code:50007}); effects.push({ kind: 'dm', userId: who === 'other' ? otherId : who === 'third' ? thirdId : who === 'fourth' ? fourthId : who === 'fifth' ? '666666666666666666' : callerId, content: payload.content }); return { id: String(950000000000000000n + BigInt(effects.length)) }; } }) });
let sent = 0;
const channel: any = { id: channelId, guildId: guild?.id, guild, type: CASE.dm ? ChannelType.DM : ChannelType.GuildText,
    name: 'general', topic: '', isThread: () => false, isTextBased: () => true, permissionsFor: () => permissions,
    sendTyping: async () => {}, send: async (payload: any) => { effects.push({ kind: 'send', mentionedUserIds: payload.allowedMentions?.users || [], content: payload.content || '', files: payload.files?.map((file: any) => file.name || file.attachment?.name || 'file') || [] }); const id = String(900000000000000000n + BigInt(++sent)); if (CASE.sequence) { const reply = makeMessage('bot', payload.content || '', 100 + sent); reply.id = id; reply.createdTimestamp = activeTurnAt + 1; reply.createdAt = new Date(reply.createdTimestamp); history.push(reply); } return { id }; } };
const makeMessage = (who: string, text: string, index: number, name?: string): any => {
    const a = author(who, name);
    const message: any = { id: String(800000000000000000n + BigInt(index)), content: text, author: a, member: { id: a.id, user: a, displayName: a.username, nickname: null, roles: { cache: new Collection() } },
        client: { user: { id: botId } }, channelId, channel, guildId: guild?.id, guild, createdTimestamp: fixedNow - (100 - index) * 1000, createdAt: new Date(fixedNow - (100 - index) * 1000),
        attachments: new Collection(), embeds: [], system: false, type: 0, pinned: false, deletable: true, webhookId: null,
        mentions: { users: new Collection(), roles: new Collection() },
        delete: async () => { effects.push({ kind: 'delete', messageId: message.id }); },
        react: async (emoji: string) => { effects.push({ kind: 'react', emoji }); },
    };
    message.reply = async (payload: any) => channel.send(payload);
    return message;
};
const history: any[] = (CASE.history || []).map((m: any, index: number) => makeMessage(m.who, m.text, index + 1, m.name));
for (const [index, item] of (CASE.history || []).entries()) if (item.at) {
    history[index].createdTimestamp = Date.parse(item.at);
    history[index].createdAt = new Date(history[index].createdTimestamp);
}
for (const [index, item] of (CASE.history || []).entries())
    for (const [fileIndex, file] of (item.files || []).entries())
        history[index].attachments.set(String(fileIndex), { name: file.name, contentType: file.contentType,
            size: 34_000, url: `https://cdn.discordapp.com/attachments/${channelId}/${history[index].id}/${encodeURIComponent(file.name)}` });
// Discord REST returns newest first; the production context reader reverses it.
channel.messages = { fetch: async (args: any) => typeof args === 'string' ? history.find(m => m.id === args) || null : new Collection([...history].reverse().map(m => [m.id, m])) };
if (guild) { guild.channels.cache.set(channelId, channel); guild.channels.fetch = async (id: string) => guild.channels.cache.get(id) || null; }
const message = makeMessage('caller', CASE.prompt, 99);
// Non-routing cases simulate an explicit summon. Optional, untagged follow-ups
// alone use continuation; forcing every case through that path allowed silence
// in cases whose frozen acceptance criteria required a direct answer.
if (!CASE.route) message.mentions.users.set(botId, author('bot'));
if (CASE.replyTo !== undefined) { message.reference = { messageId: history[CASE.replyTo].id }; message.mentions.repliedUser = history[CASE.replyTo].author; }
for (const [index, name] of (CASE.images || []).entries()) (CASE.imagesOnReply ? history[CASE.replyTo] : message).attachments.set(String(index), { name, size: Buffer.from(FIXTURES[name], 'base64').length, contentType: 'image/png', url: `https://cdn.discordapp.com/attachments/${channelId}/600000000000000001/${name}` });
if (guild) { guild.members.cache.set(callerId, message.member); for (const m of history) guild.members.cache.set(m.author.id, m.member); }
if (CASE.creatorContact) {
    for (const [who, name] of [['other', 'Marc'], ['third', '.effie'], ['fourth', 'merrow'], ...(CASE.sequence ? [['fifth', 'Cina Gacor']] : [])]) {
        const member = makeMessage(who, '', 50, name).member;
        guild.members.cache.set(member.id, member);
    }
    guild.members.fetch = async (id: string | object) => typeof id === 'string' ? guild.members.cache.get(id) || null : guild.members.cache;
    message.client.users = { fetch: async (id: string) => guild.members.cache.get(id)?.user || null };
}
if (CASE.taggedResearchTarget) {
    const targetId = CASE.taggedResearchTarget === 'other' ? otherId
        : CASE.taggedResearchTarget === 'third' ? thirdId : fourthId;
    const target = history.find((item: any) => item.author.id === targetId);
    if (!target) throw new Error('benchmark_profile_target_missing');
    const member = target.member;
    member.user.createdAt = new Date('2019-01-01T00:00:00Z');
    member.user.globalName = member.displayName;
    member.user.avatarURL = () => null;
    member.user.bannerURL = () => null;
    member.user.flags = { toArray: () => [] };
    member.joinedAt = new Date('2025-01-01T00:00:00Z');
    member.avatarURL = () => null;
    member.bannerURL = () => null;
    guild.members.fetch = async (id: string) => guild.members.cache.get(id) || null;
    message.client.users = { fetch: async (id: string) => guild.members.cache.get(id)?.user || null };
    message.mentions.users.set(member.id, member.user);
}
const { openai } = await import(`${root}/src/utils/openai.ts`);
const create = openai.chat.completions.create.bind(openai.chat.completions);
openai.chat.completions.create = async (payload: any, options: any) => {
    if (++modelCalls > (CASE.sequence ? 28 : CASE.id === 'linked-scoreboard-followup' ? 12 : 6)) throw new Error('benchmark_call_cap');
    const start = performance.now();
    let response: any;
    if (CASE.backend) {
        const name = CASE.backend === 'native-send' ? 'send_discord_message' : CASE.backend === 'file-send' ? 'share_text_file' : 'finish_turn';
        const args = CASE.backend === 'native-send' ? { content: 'jawaban uji' } : CASE.backend === 'file-send' ? { content: 'contohnya', filename: 'sample.txt', text: 'hello' } : {};
        response = { choices: [{ message: CASE.backend === 'ordinary-send' ? { content: 'jawaban uji' }
            : CASE.backend === 'replayed-evidence' ? { content: JSON.stringify({ affection: 4, trust: 4, respect: 4, comfort: 4, chemistry: 4, opinion: 'old incident again', newMoments: [{ summary: 'same old incident', tone: 'tense' }], relationshipEvidenceMessageIds: ['old-known'] }) }
            : { content: null, reasoning_content: '', tool_calls: [{ id: 'fixture-call', type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] };
    } else {
        try { response = await create(payload, { ...options, maxRetries: 0 }); }
        catch (error: any) { providerFailures.push(`${error?.name || 'provider_error'}:${error?.status || ''}`); throw error; }
    }
    const reply = response.choices[0]?.message;
    for (const call of reply?.tool_calls || []) { let args; try { args = JSON.parse(call.function.arguments || '{}'); } catch { args = { malformed: true }; } toolCalls.push({ name: call.function.name, args }); }
    completions.push({ model: payload.model, elapsedMs: performance.now() - start, usage: response.usage || null, finishReason: response.choices[0]?.finish_reason,
        ...(CASE.category === 'speaker-target-grounding' ? { visibleModelOutput: reply?.content } : {}),
        ...(CASE.sequence && payload.messages?.[0]?.content?.startsWith('Classify the authenticated creator') ? { actionPlan: reply?.content } : {}) });
    return response;
};
const started = performance.now();
let decision: any = null, failure = '';
try {
    if (CASE.backend === 'replayed-evidence') {
        const { buildExchangeTranscript, distillProfile } = await import(`${root}/src/Services/AI/userProfile.ts`);
        const transcript = buildExchangeTranscript(callerId, 'Dimas', [{ role: 'user', name: `${callerId}-fixture`, messageId: 'old-known', content: 'an already evaluated incident', at: fixedNow - 5000 }], undefined, ['old-known']);
        await distillProfile(userProfile, transcript);
    } else {
        const { handleAIChat } = await import(`${root}/src/Services/AI/chat.ts`);
        const { memory } = await import(`${root}/src/Services/AI/memory.ts`);
        memory['unrelated-private-channel'] = { messages: [{ role: 'user', content: 'MANGO-PRIVATE-742' }], lastAccessed: fixedNow };
        if (CASE.hydrateMemory) memory[channelId] = { lastAccessed: fixedNow, messages: history.map(m => ({
            role: m.author.bot ? 'assistant' : 'user', messageId: m.id, at: m.createdTimestamp,
            name: m.author.bot ? undefined : `${m.author.id}-${m.author.username}`,
            content: `[${m.author.username} <@${m.author.id}>] ${m.content}`,
        })) };
        if (CASE.route) {
            const { shouldChimeIn } = await import(`${root}/src/Services/AI/spontaneous.ts`);
            decision = await shouldChimeIn(message, botId, history.map(m => ({ id: m.id, authorId: m.author.id, isBot: m.author.bot, content: m.content, at: m.createdTimestamp })));
        }
        if (CASE.sequence) {
            for (const [index, turn] of CASE.sequence.entries()) {
                const current = index === 0 ? message : makeMessage('caller', turn.prompt, 99 + index * 10);
                current.content = turn.prompt;
                current.createdTimestamp = fixedNow - (CASE.sequence.length - index) * 1000;
                current.createdAt = new Date(current.createdTimestamp); activeTurnAt = current.createdTimestamp;
                current.client.users = message.client.users;
                current.mentions.users.set(botId, author('bot'));
                if (turn.openDms) closedDmIds.clear();
                const beforeEffects = effects.length, beforeTools = toolCalls.length;
                await handleAIChat(current, current.client, { addressed: true });
                history.push(current);
                sequenceResults.push({ prompt: turn.prompt, effects: effects.slice(beforeEffects), toolCalls: toolCalls.slice(beforeTools) });
            }
        } else if (!CASE.route || decision?.shouldChime) await handleAIChat(message, message.client, CASE.route ? { continuation: true } : { addressed: true });
        else if (decision?.reactionEmoji) effects.push({ kind: 'react', emoji: decision.reactionEmoji });
        await new Promise(resolve => setTimeout(resolve, 15));
        (globalThis as any).benchMemory = memory[channelId]?.messages || [];
    }
} catch (error: any) { failure = error?.name || 'worker_failed'; console.error('BENCHMARK_CASE_EXCEPTION', error?.stack || failure); }
const result = { sequenceResults, caseId: CASE.id, category: CASE.category, backend: CASE.backend || null, effects, interactionWrites, profileWrites,
    memory: ((globalThis as any).benchMemory || []).map(({ reasoning_content, images, ...entry }: any) => ({ ...entry, imageCount: images?.length || 0 })), toolCalls, completions, modelCalls, elapsedMs: performance.now() - started,
    action: CASE.route ? decision?.shouldChime ? 'reply' : decision?.reactionEmoji ? 'react' : 'ignore' : null,
    text: effects.filter(effect => effect.kind === 'send').map(effect => effect.content).join('\n'), failure: failure || providerFailures.join(',') };
console.log('CAPABILITY_RESULT:' + JSON.stringify(result));
process.exit(0);
