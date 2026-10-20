import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

// Run isolated so fake completions/DB queries cannot affect other test files.
// A dummy key is installed BEFORE importing the provider; no live API is used.
const scenario = `
import assert from 'node:assert/strict';
const db = await import('./src/Database/connect.ts');
const query = value => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => value, exec: async () => value,
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
db.MessageCacheModel.findOne = () => query(null);
db.UserProfileModel.findOne = () => query(null);
db.UserProfileModel.findOneAndUpdate = () => query({ userId: 'caller', interactionCount: 1 });
db.BotStateModel.findOneAndUpdate = () => query({ mood: 'calm', energy: 70 });
db.LorebookModel.find = () => query([]);
db.TaskModel.find = () => query([]);
const { openai } = await import('./src/utils/openai.ts');
const { handleAIChat } = await import('./src/Services/AI/chat.ts');
const { loadSocialState, isIgnoring } = await import('./src/Services/AI/socialState.ts');
const { memory } = await import('./src/Services/AI/memory.ts');
const effects = [];
let interactionWrites = 0;
let interactionUpdate;
db.UserProfileModel.findOneAndUpdate = (_filter, update) => { interactionWrites++; interactionUpdate = update;
  return query({ userId: 'caller', interactionCount: 1 }); };
const mode = process.env.SOCIAL_TEST_MODE;
const internalAnnotation = '[Discord chronology: {"sentAt":"2026-10-15T16:04:00.253Z","replyToMessageId":"1560322302267363349"}]';
if (mode === 'reset_guard') {
  const { distillProfile, buildExchangeTranscript } = await import('./src/Services/AI/userProfile.ts');
  const { AFFECTION_RESET_VERSION } = await import('./src/Database/affectionResetSchema.ts');
  const stored = { affection: 0, affectionResetVersion: AFFECTION_RESET_VERSION };
  let writes = 0;
  db.UserProfileModel.updateOne = (filter, update) => query((() => {
    const matches = (!('affectionResetVersion' in filter) || filter.affectionResetVersion === stored.affectionResetVersion)
      && (!('affection' in filter) || filter.affection === stored.affection)
      && (!filter.$or || filter.$or.some(branch => typeof branch.lastDistilledAtCount === 'number'
        ? branch.lastDistilledAtCount === stored.lastDistilledAtCount : stored.lastDistilledAtCount === undefined));
    if (matches) { writes++; Object.assign(stored, update.$set); }
    return { matchedCount: matches ? 1 : 0 };
  })());
  openai.chat.completions.create = async () => ({ choices: [{ message: { content: JSON.stringify({ affection: 2, relationshipEvidenceMessageIds: ['new-message'] }) } }] });
  const transcript = buildExchangeTranscript('caller', 'caller', [{ role: 'user', name: 'caller-name', messageId: 'new-message', content: 'new conversation' }]);
  const profile = { userId: 'caller', username: 'caller', displayName: 'caller', personality: '', interests: '', communicationStyle: '',
    opinion: '', emotionalState: '', affection: 75, previousAffection: 70, trust: 80, respect: 0, comfort: 0, chemistry: 0,
    moments: [], implicitGoals: [], timezone: '', interactionCount: 5, lastDistilledAtCount: 0 };
  await distillProfile(profile, transcript);
  assert.equal(writes, 0); assert.equal(stored.affection, 0, 'a pre-reset draft must not restore an old score');
  await distillProfile({ ...profile, affectionResetVersion: 'discord-attention-2026-10-15' }, transcript);
  assert.equal(writes, 0); assert.equal(stored.affection, 0, 'a draft from the earlier affection-only reset must also be rejected');
  await distillProfile({ ...profile, affection: 0, previousAffection: 0, affectionResetVersion: AFFECTION_RESET_VERSION }, transcript);
  assert.equal(writes, 1); assert.equal(stored.affection, 2, 'new relationships can rebuild normally');
  await distillProfile({ ...profile, affection: 0, previousAffection: 0, affectionResetVersion: AFFECTION_RESET_VERSION }, transcript);
  assert.equal(writes, 1); assert.equal(stored.affection, 2, 'an older draft must not overwrite an intervening score correction');
  const next = { ...profile, affection: 2, previousAffection: 2, interactionCount: 10, lastDistilledAtCount: 5, affectionResetVersion: AFFECTION_RESET_VERSION };
  await distillProfile(next, transcript); assert.equal(writes, 2);
  await distillProfile(next, transcript); assert.equal(writes, 2, 'a concurrent old evaluation must lose its count guard even when affection stayed unchanged');
  console.log('SOCIAL_SCENARIO_OK'); process.exit(0);
}
if (mode === 'actor_evidence') {
  const { distillProfile, buildExchangeTranscript } = await import('./src/Services/AI/userProfile.ts');
  const writes = [];
  db.UserProfileModel.updateOne = (_filter, update) => { writes.push(update.$set); return Promise.resolve({ matchedCount: 1 }); };
  const profile = { userId: 'caller', username: 'caller', displayName: 'Dimas', personality: '', interests: '', communicationStyle: '',
    opinion: '', emotionalState: '', affection: 2, previousAffection: 2, trust: 0, respect: 0, comfort: 0, chemistry: 0,
    moments: [], implicitGoals: [], timezone: '', interactionCount: 5, lastDistilledAtCount: 0 };
  const transcript = buildExchangeTranscript('caller', 'Dimas', [
    { role: 'user', name: 'caller-name', messageId: 'look', content: 'liat ini', sources: [{ kind: 'reply', messageId: 'gif-by-kuda', authorId: 'kuda' }] },
    { role: 'assistant', messageId: 'rebuke', content: 'jangan diulang' },
  ]);
  let evidence = ['gif-by-kuda'];
  openai.chat.completions.create = async () => ({ choices: [{ message: { content: JSON.stringify({
    affection: -10, trust: -10, respect: -10, comfort: -10, chemistry: -10,
    opinion: 'unsupported blame', newMoments: [{ summary: 'unsupported accusation', tone: 'tense' }], relationshipEvidenceMessageIds: evidence,
  }) } }] });
  await distillProfile(profile, transcript);
  for (const field of ['affection', 'previousAffection', 'trust', 'respect', 'comfort', 'chemistry', 'opinion', 'moments']) assert(!(field in writes[0]), field);
  evidence = ['rebuke']; await distillProfile(profile, transcript);
  assert(!('affection' in writes[1]), 'a bot reprimand is not evidence of user misconduct');
  evidence = ['look']; await distillProfile(profile, transcript);
  assert.equal(writes[2].affection, -10, 'owned evidence still permits a model judgment; semantic correctness is covered by the live benchmark');
  assert.deepEqual(writes[2].lastRelationshipEvidenceMessageIds, ['look']);
  console.log('SOCIAL_SCENARIO_OK'); process.exit(0);
}
if (mode === 'persistence') {
  const mongoose = (await import('mongoose')).default;
  Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, get: () => 1 });
  process.env.NODB = 'false';
  const snapshot = { _id: 'mongo-id', __v: 0, userId: 'persisted-user', anger: 80, hurt: 25, warmth: 5,
    updatedAt: new Date(), reason: 'private reason that must stay out of public prompts',
    ignoredUntil: new Date(Date.now() + 600000), ignoreChannelId: '' };
  db.SocialStateModel.findOne = () => ({ setOptions() { return this; }, maxTimeMS() { return this; }, lean() { return this; }, exec: async () => snapshot });
  let written;
  db.SocialStateModel.updateOne = (_filter, update) => ({ exec: async () => { written = update.$set; } });
  const { mutateSocialState, formatSocialState } = await import('./src/Services/AI/socialState.ts');
  const state = await loadSocialState('persisted-user');
  assert(isIgnoring(state, 'any-channel'));
  assert(state.anger > 79);
  assert(!formatSocialState(state, 'public', false).includes(snapshot.reason));
  await mutateSocialState('persisted-user', current => ({ ...current, warmth: 15 }));
  assert.equal(written.warmth, 15);
  assert(!('_id' in written)); assert(!('__v' in written));
  const warnings = [];
  console.warn = text => warnings.push(text);
  db.SocialStateModel.updateOne = () => ({ exec: async () => { throw new Error('temporary outage'); } });
  await mutateSocialState('persisted-user', current => ({ ...current, ignoreReason: 'locally chosen boundary' }));
  assert.equal(warnings.length, 1);
  const timestamp = Date.now(); Date.now = () => timestamp + 61000;
  db.SocialStateModel.updateOne = (_filter, update) => ({ exec: async () => { written = update.$set; } });
  assert.equal((await loadSocialState('persisted-user')).ignoreReason, 'locally chosen boundary');
  assert.equal(written.ignoreReason, 'locally chosen boundary', 'recover local state rather than replacing it with stale DB data');
  console.log('SOCIAL_SCENARIO_OK'); process.exit(0);
}
const channel = { id: 'public', name: 'general', messages: { fetch: async () => new Map() },
  sendTyping: async () => { effects.push('typing'); }, send: async ({ content }) => { effects.push(content); return { id: 'delivered-message' }; } };
const message = { id: 'source', channel, channelId: channel.id, guildId: 'guild',
  guild: { id: 'guild', name: 'CTF Team', members: { me: null, cache: new Map(), fetch: async () => new Map() } },
  author: { id: 'caller', username: 'caller', bot: false, createDM: async () => ({ id: 'dm-caller', send: async ({ content }) => { effects.push('DM: ' + content); } }) },
  member: null, content: 'hackerika kamu nyebelin', attachments: new Map(), embeds: [], system: false, pinned: false, deletable: true,
  delete: async () => { effects.push('delete'); }, react: async () => { effects.push('reaction'); } };
message.reply = async ({ content }) => channel.send({ content });
if (mode === 'attention_classifier') {
  const { shouldChimeIn } = await import('./src/Services/AI/spontaneous.ts');
  let classifierCalls = 0;
  openai.chat.completions.create = async payload => {
    classifierCalls++;
    assert.equal(payload.thinking.type, 'disabled'); assert.equal(payload.response_format.type, 'json_object');
    assert(payload.messages.at(-1).content.includes('currentMessageId'));
    return { choices: [{ message: { content: '{"action":"react","confidence":0.95,"emoji":"👏","reason":"celebrate their solve"}' } }] };
  };
  const activeContext = [{ id: 'previous', authorId: 'bot', isBot: true, content: 'previous discussion', at: Date.now() - 11 * 60_000 }];
  message.content = 'finally solved the challenge';
  assert.equal((await shouldChimeIn(message, 'bot', activeContext)).reactionEmoji, '👏');
  assert.equal((await shouldChimeIn(message, 'bot', activeContext)).shouldChime, false);
  assert.equal(classifierCalls, 1, 'one decision per cooldown');
  for (let i = 1; i < 16; i++) await shouldChimeIn({ ...message, channelId: 'channel-' + i, author: { ...message.author, id: 'caller-' + i } }, 'bot', activeContext);
  assert.equal(classifierCalls, 12, 'global ambient evaluation budget is enforced');
  console.log('SOCIAL_SCENARIO_OK'); process.exit(0);
}
if (mode === 'followup_classifier') {
  const { shouldChimeIn, CONVERSATION_WINDOW_MS } = await import('./src/Services/AI/spontaneous.ts');
  let now = Date.now(), calls = 0; Date.now = () => now;
  let lastAttentionInput;
  const context = () => [{ id: 'question', authorId: 'caller', isBot: false, content: 'hackerika ini apa?', at: now - 2000 },
    { id: 'answer', authorId: 'bot', isBot: true, content: 'ini OC-mu?', at: now - 1000 }];
  let nextAction = 'reply';
  openai.chat.completions.create = async payload => {
    calls++;
    const data = JSON.parse(payload.messages.at(-1).content);
    lastAttentionInput = data;
    if (data.conversationMode === 'ongoing_conversation') assert(payload.messages[0].content.includes('Mention atau quote-reply tidak diperlukan'));
    else assert.equal(data.conversationMode, 'ambient');
    return { choices: [{ message: { content: JSON.stringify({ action: nextAction, confidence: 0.99, reason: 'context decides', emoji: '👍' }) } }] };
  };
  message.content = 'ini namanya Malfoid, coba cek trend sekarang';
  assert.equal((await shouldChimeIn(message, 'bot', context())).continuation, true);
  now += 2000;
  assert.equal((await shouldChimeIn({ ...message, id: 'next' }, 'bot', context())).continuation, true, 'five-minute ambient cooldown must not swallow a real follow-up');
  assert.equal(calls, 2);
  assert.equal((await shouldChimeIn(message, 'bot', context())).reason, 'follow-up burst cooldown');
  assert.equal(calls, 2);
  now += 2000; nextAction = 'ignore'; message.content = 'bentar, lagi ngetik';
  assert.equal((await shouldChimeIn(message, 'bot', context())).shouldChime, false);
  now += 2000; nextAction = 'react'; message.content = 'oke makasih';
  assert.equal((await shouldChimeIn(message, 'bot', context())).reactionEmoji, '👍');
  now += 2000;
  assert.equal((await shouldChimeIn({ ...message, reference: { messageId: 'someone-else' }, mentions: { repliedUser: { id: 'other' } } }, 'bot', context())).reason, 'reply to someone else');
  now += 2000; nextAction = 'reply';
  const targetId = '555555555555555552';
  message.content = 'sebutkan 10 dosa besar <@' + targetId + '>';
  message.mentions = { users: new Map([[targetId, { id: targetId, globalName: 'Aryma House Of Wolf', username: 'aryma', bot: false }]]) };
  const subjectHistory = [...context(), { id: 'aside', authorId: 'caller', isBot: false, content: 'nah loh <@555555555555555551>',
    mentions: [{ id: '555555555555555551', displayName: 'KudaLiar', isBot: false }], at: now - 500 }];
  assert.equal((await shouldChimeIn(message, 'bot', subjectHistory)).continuation, true);
  assert.equal(lastAttentionInput.currentSpeakerWasTalkingToBot, true);
  assert.equal(lastAttentionInput.currentMentions[0].displayName, 'Aryma House Of Wolf');
  assert.equal(lastAttentionInput.recent.find(m => m.id === 'aside').mentions[0].displayName, 'KudaLiar');
  const beforeRecovery = calls;
  const mongoose = (await import('mongoose')).default;
  Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, get: () => 1 });
  process.env.NODB = 'false';
  db.MessageCacheModel.findOne = () => ({ setOptions: async () => ({ messages: [
    { id: 'cached-question', author: { id: 'caller' }, content: 'jelasin buat <@555555555555555551>', createdTimestamp: now - 2000,
      mentions: [{ id: '555555555555555551', displayName: 'KudaLiar', isBot: false }] },
    { id: 'cached-bot', author: { id: 'bot' }, content: 'cached public answer', createdTimestamp: now - 1000 }] }) });
  nextAction = 'reply'; message.content = 'terus gimana?';
  assert.equal((await shouldChimeIn({ ...message, channelId: 'after-restart' }, 'bot', [])).continuation, true, 'recover recent context from the same channel after restart');
  assert.equal(calls, beforeRecovery + 1);
  assert.equal(lastAttentionInput.recent.find(m => m.id === 'cached-question').mentions[0].displayName, 'KudaLiar');
  process.env.NODB = 'true';
  now += 2000;
  assert.equal((await shouldChimeIn({ ...message, channelId: 'different-channel' }, 'bot', [])).continuation, undefined);
  for (let i = 0; i < 40; i++) { now += 1000; await shouldChimeIn({ ...message, channelId: 'budget-' + i }, 'bot', context()); }
  assert.equal((await shouldChimeIn({ ...message, channelId: 'exhausted' }, 'bot', context())).reason, 'follow-up budget');
  const expiredContext = context(); now += CONVERSATION_WINDOW_MS + 1;
  assert.equal((await shouldChimeIn({ ...message, channelId: 'expired' }, 'bot', expiredContext)).continuation, undefined, 'an expired conversation returns to ambient rules');
  console.log('SOCIAL_SCENARIO_OK'); process.exit(0);
}
if (mode === 'native_send' || mode === 'native_react') {
  const { Collection } = await import('discord.js');
  message.client = { user: { id: 'bot' } };
  message.member = { id: 'caller', roles: { cache: new Collection() } };
  message.guild.members.me = { id: 'bot' };
  channel.guildId = message.guild.id;
  channel.permissionsFor = () => ({ has: () => true });
}
if (mode === 'privacy') {
  const { loadActiveTasksForUser, listTasksForTool, updateTaskForTool, completeTaskForTool } = await import('./src/Services/AI/tasks.ts');
  const { listRemindersForTool, cancelReminderForTool } = await import('./src/Services/AI/reminders.ts');
  const filters = [];
  db.TaskModel.find = filter => { filters.push(filter); return query([]); };
  db.ReminderModel.find = filter => { filters.push(filter); return query([]); };
  await loadActiveTasksForUser('caller', 5, 'public');
  await listTasksForTool(message, {}); await listRemindersForTool(message);
  assert(filters.every(filter => filter.channelId === 'public'));
  db.TaskModel.findById = () => query({ userId: 'caller', channelId: 'private-dm' });
  db.ReminderModel.findById = () => query({ userId: 'caller', channelId: 'private-dm' });
  const taskId = '012345678901234567890123';
  assert.equal((await updateTaskForTool(message, { taskId, addNote: 'public note' })).error, 'not_found');
  assert.equal((await completeTaskForTool(message, { taskId })).error, 'not_found');
  assert.equal((await cancelReminderForTool(message, { reminderId: taskId })).error, 'not_found');
  console.log('SOCIAL_SCENARIO_OK'); process.exit(0);
}
if (mode === 'cache') {
  const mongoose = (await import('mongoose')).default;
  Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, get: () => 1 });
  process.env.NODB = 'false';
  const { updateChannelCache, forgetCachedMessage } = await import('./src/Services/AI/cache.ts');
  let releaseWrite, markStarted;
  const writing = new Promise(resolve => { releaseWrite = resolve; });
  const started = new Promise(resolve => { markStarted = resolve; });
  db.MessageCacheModel.updateOne = (_filter, update) => {
    if (Array.isArray(update)) { effects.push('cache-write-started'); markStarted(); return writing; }
    effects.push('cache-purged'); return query({});
  };
  db.IndexedMessageModel.updateOne = () => { effects.push('indexed'); return query({}); };
  db.IndexedMessageModel.deleteOne = () => { effects.push('index-purged'); return query({}); };
  const cacheWrite = updateChannelCache(message); await started;
  const forget = forgetCachedMessage(message.channelId, message.id);
  releaseWrite(); await Promise.all([cacheWrite, forget]);
  assert.deepEqual(effects, ['cache-write-started', 'indexed', 'cache-purged', 'index-purged']);
  await updateChannelCache(message);
  assert.equal(effects.length, 4, 'deleted message must not be reindexed');
  console.log('SOCIAL_SCENARIO_OK'); process.exit(0);
}
if (mode === 'reasoning' || mode === 'stale_typing') {
  message.author.id = '663394727688798231';
  memory.public = { messages: [{ role: 'assistant', content: 'previous answer', reasoning_content: 'previous internal reasoning' }], lastAccessed: Date.now() };
}
if (mode === 'dm') {
  message.guild = null; message.guildId = null; message.content = 'aku minta maaf soal tadi';
}
const visionMode = mode === 'vision' || mode.startsWith('vision_');
let earlierImage;
const visionWarnings = [];
if (visionMode) {
  globalThis.fetch = async () => mode === 'vision_download_failure'
    ? new Response('unavailable', { status: 403 })
    : new Response(Buffer.from('89504e470d0a1a0a0000000000000000', 'hex'), { headers: { 'content-type': 'image/png' } });
  message.author.id = '663394727688798231';
  message.content = 'hackerika lihat gambar ini';
  message.attachments.set('image', { name: 'screen.png', contentType: 'image/png', size: 2048,
    url: 'https://cdn.discordapp.com/attachments/111111111111111111/222222222222222222/screen.png?ex=ffffffff&hm=private' });
  if (mode === 'vision_dm') { message.guild = null; message.guildId = null; message.content = ''; }
  if (mode === 'vision_fallback') console.warn = text => visionWarnings.push(text);
  if (mode === 'vision_burst' || mode === 'vision_reply') {
    earlierImage = { ...message, id: 'earlier-image', content: 'hackerika', attachments: new Map(message.attachments) };
    message.attachments = new Map();
    if (mode === 'vision_reply') {
      earlierImage.author = { ...message.author, id: 'quoted-user', username: 'quoted-user' };
      message.reference = { messageId: earlierImage.id };
      channel.messages.fetch = async arg => typeof arg === 'string' ? earlierImage : new Map();
    }
  }
}
let calls = 0;
let sourceIsCurrent = true;
let releaseCompletion;
const firstCallStarted = new Promise(resolve => { releaseCompletion = resolve; });
let finishFirstCall;
const pendingCompletion = new Promise(resolve => { finishFirstCall = resolve; });
openai.chat.completions.create = async payload => {
  calls++;
  assert.equal(payload.thinking.type, 'enabled');
  if (mode === 'continuation_tool_empty') {
    if (calls === 1) return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'time-call', type: 'function', function: { name: 'get_current_time', arguments: '{}' } }] } }] };
    if (calls === 2) return { choices: [{ message: { role: 'assistant', content: '' } }] };
    assert.equal(payload.tool_choice, 'none');
    assert(payload.messages.some(entry => entry.role === 'tool' && entry.tool_call_id === 'time-call'));
    return { choices: [{ message: { role: 'assistant', content: 'iya, aku cek lagi dari clue tadi' } }] };
  }
  if (mode === 'metadata_echo' || mode === 'metadata_only') return { choices: [{ message: { role: 'assistant', content: mode === 'metadata_only' ? internalAnnotation : 'jadi beneran Miku wkwk 🍐\\n' + internalAnnotation } }] };
  if (visionMode) {
    const visual = payload.messages.filter(entry => Array.isArray(entry.content)).flatMap(entry => entry.content.filter(part => part.type === 'image_url'));
    if (mode === 'vision_download_failure') {
      assert.equal(visual.length, 0); assert.equal(payload.model, 'text-only-fixture');
      assert(payload.messages.at(-1).content.includes('No pixels are available'));
      return { choices: [{ message: { role: 'assistant', content: 'gambarnya gagal diunduh' } }] };
    }
    if (mode === 'vision_fallback' && calls === 2) {
      assert.equal(visual.length, 0); assert.equal(payload.model, 'text-only-fixture');
      assert(payload.messages.at(-1).content.includes('No pixels are available'));
      return { choices: [{ message: { role: 'assistant', content: 'gambarnya ga kebuka, upload ulang ya' } }] };
    }
    assert.equal(visual.length, 1); assert.equal(payload.model, 'deepseek-flash');
    assert(visual[0].image_url.url.startsWith('data:image/png;base64,'), 'real bytes reach the model, not a CDN URL');
    assert(payload.messages.every(entry => !('images' in entry)));
    assert(payload.messages.filter(entry => Array.isArray(entry.content)).every(entry => entry.role === 'user'));
    if (mode === 'vision_fallback') throw Object.assign(new Error('image download failed'), { status: 400 });
    if (mode === 'vision_dm') assert(payload.messages.at(-1).content[0].text.includes('direct_message'));
    if (mode === 'vision_reply') assert(JSON.stringify(payload.messages.at(-1).content).includes('quoted-user'));
    return { choices: [{ message: { role: 'assistant', content: calls === 1 ? 'ada empat kotak merah' : 'yang kiri merah' } }] };
  }
  if (mode === 'stale') { sourceIsCurrent = false; return { choices: [{ message: { role: 'assistant', content: 'stale answer' } }] }; }
  if (mode === 'stale_typing') {
    setTimeout(() => { sourceIsCurrent = false; }, 25);
    return { choices: [{ message: { role: 'assistant', content: 'this draft was cancelled before delivery' } }] };
  }
  if (mode === 'native_send' || mode === 'native_react') {
    if (mode === 'native_react' && calls === 2) {
      assert.equal(payload.messages.find(entry => entry.tool_calls?.length)?.reasoning_content, '', 'missing non-thinking reasoning must replay as an empty string');
    }
    const name = mode === 'native_send' ? 'send_discord_message' : calls === 1 ? 'react_to_message' : 'finish_turn';
    const args = mode === 'native_send' ? { content: 'delivered through tool' } : calls === 1 ? { emoji: '👏' } : {};
    return { choices: [{ message: { role: 'assistant', content: null, ...(mode === 'native_react' && calls === 1 ? {} : { reasoning_content: '' }), tool_calls: [{ id: 'tool-' + calls, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] };
  }
  if (mode === 'spontaneous') return { choices: [{ message: { role: 'assistant', content: '' } }] };
  if (mode.startsWith('continuation')) {
    assert(payload.messages.at(-1).content.includes('Ini lanjutan percakapan'));
    assert(!payload.messages.at(-1).content.includes('kamu ga di-mention/di-summon'));
    return { choices: [{ message: { role: 'assistant', content: mode === 'continuation_silent' ? '' : 'iya, kita lanjut dari bagian nonce tadi' } }] };
  }
  if (mode === 'reasoning') {
    assert(payload.messages.some(entry => entry.role === 'assistant' && entry.reasoning_content === 'previous internal reasoning'));
    return { choices: [{ message: { role: 'assistant', content: 'ok', reasoning_content: 'new internal reasoning' } }] };
  }
  if (mode === 'dm') assert(payload.messages.at(-1).content.includes('"conversation":"direct_message"'));
  if (mode === 'queued') {
    releaseCompletion(); await pendingCompletion;
  }
  const tool = mode === 'handoff' ? 'move_conversation_to_dm' : 'ignore_user';
  const args = mode === 'handoff'
    ? { cause: 'anger', reason: 'argument belongs in private', openingMessage: 'aku masih kesel soal tadi. bahas di sini aja.', removeMessage: false }
    : { minutes: 15, scope: 'everywhere', reason: 'needs space' };
  return { choices: [{ message: { role: 'assistant', content: null, reasoning_content: 'internal thinking',
    tool_calls: [{ id: 'action', type: 'function', function: { name: tool, arguments: JSON.stringify(args) } }] } }] };
};
const client = { user: { id: 'bot' } };
if (mode.startsWith('metadata_')) { message.author.id = '663394727688798231'; console.warn = () => {}; }
if (mode.startsWith('continuation')) { message.author.id = '663394727688798231'; message.content = 'terus bagian nonce tadi gimana?'; }
if (mode === 'queued') {
  const first = handleAIChat(message, client);
  await firstCallStarted;
  const second = handleAIChat({ ...message, id: 'queued-message' }, client);
  finishFirstCall();
  await Promise.all([first, second]);
} else {
  await handleAIChat(message, client, mode.startsWith('continuation') ? { continuation: true, continuationHint: 'follow-up question' } : mode === 'spontaneous' ? { spontaneous: true } : ['stale', 'stale_typing'].includes(mode) ? { isCurrent: () => sourceIsCurrent } : mode === 'vision_burst' ? { addressed: true, attachmentSources: [earlierImage] } : {});
}
if (mode === 'vision') await handleAIChat({ ...message, id: 'followup', content: 'hackerika yang kiri warna apa?', attachments: new Map() }, client);
assert.equal(calls, mode === 'continuation_tool_empty' ? 3 : ['native_react', 'vision', 'vision_fallback'].includes(mode) ? 2 : 1, 'terminal action must stop the loop without fallback/retry');
if (mode.startsWith('metadata_')) {
  assert.deepEqual(effects.filter(x => x !== 'typing'), mode === 'metadata_only' ? [] : ['jadi beneran Miku wkwk 🍐']);
  assert(!JSON.stringify(memory.public.messages).includes('Discord chronology'));
} else if (mode === 'continuation_silent') {
  assert.deepEqual(effects.filter(x => x !== 'typing'), []);
} else if (mode === 'continuation_tool_empty') {
  assert.deepEqual(effects.filter(x => x !== 'typing'), ['iya, aku cek lagi dari clue tadi']);
} else if (mode === 'continuation') {
  assert.equal(effects.filter(x => x !== 'typing').length, 1);
} else if (visionMode) {
  assert.equal(effects.filter(x => x !== 'typing').length, mode === 'vision' ? 2 : 1);
  if (mode === 'vision_dm') assert.equal(interactionWrites, 0, 'private replies must not alter public relationship counts');
  if (mode === 'vision_fallback') {
    assert.equal(visionWarnings.length, 1);
    assert(!memory.public.messages.some(entry => entry.images?.length));
  }
  assert(!memory.public.messages.some(entry => entry.content.includes('hm=private')));
} else if (mode === 'native_send') {
  assert.deepEqual(effects.filter(x => x !== 'typing'), ['delivered through tool']);
  assert(memory.public.messages.at(-1).content.includes('delivered through tool'));
  assert.equal(interactionWrites, 1, 'a delivered native reply must count as one relationship interaction');
  assert.equal(interactionUpdate.$push.recentRelationshipExchanges.$each[0].messageId, 'source');
  assert.equal(interactionUpdate.$push.recentRelationshipExchanges.$each[0].assistantText, 'delivered through tool');
} else if (mode === 'native_react') {
  assert.deepEqual(effects.filter(x => x !== 'typing'), ['reaction']);
} else if (mode === 'spontaneous' || mode === 'stale' || mode === 'stale_typing') {
  assert.deepEqual(effects.filter(x => x !== 'typing'), []);
  assert(!memory.public?.messages.some(entry => entry.content.includes('cancelled before delivery')));
} else if (mode === 'reasoning') {
  assert.equal(memory.public.messages.at(-1).reasoning_content, 'new internal reasoning');
  assert(!effects.some(effect => effect.includes('internal reasoning')));
} else if (mode === 'handoff') {
  assert.equal(effects.filter(x => x.startsWith('DM: ')).length, 1);
  assert.equal(effects.filter(x => x === 'aku lanjut ngobrol di DM ya.').length, 1);
  assert.equal(memory['dm-caller'].messages.length, 2);
  assert(!memory.public.messages.some(x => x.content.includes('kamu nyebelin')));
} else {
  assert(isIgnoring(await loadSocialState('caller'), 'public'));
  assert.deepEqual(effects.filter(x => x !== 'typing'), []);
  await handleAIChat({ ...message, id: 'after-boundary' }, client);
  assert.equal(calls, 1, 'ignored messages must not call the model');
}
console.log('SOCIAL_SCENARIO_OK');
`;

for (const mode of ['ignore', 'handoff', 'queued', 'dm', 'reasoning', 'persistence', 'privacy', 'cache', 'spontaneous', 'native_send', 'native_react', 'stale', 'stale_typing', 'reset_guard', 'actor_evidence', 'attention_classifier', 'followup_classifier', 'continuation', 'continuation_silent', 'continuation_tool_empty', 'metadata_echo', 'metadata_only', 'vision', 'vision_dm', 'vision_burst', 'vision_reply', 'vision_fallback', 'vision_download_failure']) {
    test(`chat loop: ${mode}`, async () => {
        const child = Bun.spawn([process.execPath, '-e', scenario], {
            cwd: fileURLToPath(new URL('../../../', import.meta.url)),
            env: { ...process.env, OPENAI_API_KEY: 'test-no-network', NODB: 'true', SOCIAL_TEST_MODE: mode,
                AI_CHAT_MODEL: mode.startsWith('vision') ? 'text-only-fixture' : process.env.AI_CHAT_MODEL,
                AI_VISION: 'true', AI_VISION_MODEL: 'deepseek-flash',
                AI_ALLOW_IGNORING: 'true', AI_PRIVATE_HANDOFF: 'true', AI_DISCORD_ACTIONS: 'true', AI_SMART_ATTENTION: 'true', CF_WORKER_URL: '', CF_WORKER_TOKEN: '' },
            stdout: 'pipe', stderr: 'pipe',
        });
        const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
        expect({ exitCode, stderr, ...(exitCode ? { stdout } : {}) }).toEqual({ exitCode: 0, stderr: '' });
        expect(stdout).toContain('SOCIAL_SCENARIO_OK');
    }, 15_000);
}
