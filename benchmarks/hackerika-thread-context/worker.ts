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
const realDate = Date, fixedNow = realDate.parse('2026-10-16T12:00:00Z');
globalThis.Date = class extends realDate {
    constructor(...args: any[]) { super(...(args.length ? args : [fixedNow]) as [number]); }
    static now() { return fixedNow; }
} as DateConstructor;
const callerId = '111111111111111111', otherId = '222222222222222222', botId = '1077393568647352320';
const callerName = CASE.history?.findLast((m: any) => m.who === 'caller' && m.name)?.name || 'Dimas';
const channelId = '700000000000000001', guildId = '555555555555555555';
const effects: any[] = [], completions: any[] = [], toolCalls: any[] = [];
const providerFailures: string[] = [];
setTimeout(() => { console.log('CAPABILITY_RESULT:' + JSON.stringify({ caseId: CASE.id, category: CASE.category, backend: CASE.backend, failure: 'worker_deadline', effects: [], text: '', completions: [], toolCalls: [], interactionWrites: 0, profileWrites: [], memory: [] })); process.exit(1); }, 145_000).unref();
let interactionWrites = 0, profileWrites: any[] = [], modelCalls = 0;
const userProfile: any = { userId: callerId, username: 'fixture', displayName: callerName, personality: '', interests: '', communicationStyle: '', opinion: '', emotionalState: '', affection: 5, previousAffection: 5, trust: 5, respect: 5, comfort: 5, chemistry: 5, moments: [], implicitGoals: [], timezone: 'Asia/Jakarta', interactionCount: 1, lastDistilledAtCount: 1, lastRelationshipEvidenceMessageIds: ['old-known'], evaluatedRelationshipMessageIds: ['old-known'] };
db.UserProfileModel.findOne = () => query({ ...userProfile });
db.UserProfileModel.findOneAndUpdate = () => { interactionWrites++; return query({ ...userProfile, interactionCount: 2 }); };
db.UserProfileModel.updateOne = (_filter: any, update: any) => { profileWrites.push(update.$set); return query({ matchedCount: 1 }); };
db.BotStateModel.findOneAndUpdate = () => query({ mood: 'calm', energy: 65, focus: '', activity: '', preoccupations: '', latestDiarySummary: '' });

const FIXTURE_SHA='a1'.repeat(20);
function fixtureUrls():string[]{
 const urls=Object.keys(CASE.pages||{});
 for(const repo of CASE.repos||[])for(const path of Object.keys(repo.files))urls.push('https://github.com/'+repo.name+'/blob/'+FIXTURE_SHA+'/'+path);
 return urls;
}
function fixtureResponse(urlValue:string):Response{
 let url:URL;try{url=new URL(urlValue);}catch{return new Response('invalid',{status:400});}
 const path=decodeURIComponent(url.pathname);
 if(CASE.pages?.[urlValue])return new Response(CASE.pages[urlValue],{headers:{'Content-Type':'text/html'}});
 for(const repo of CASE.repos||[]){
  const root='/repos/'+repo.name;
  if(url.hostname==='api.github.com'){
   if(path===root)return Response.json({full_name:repo.name,description:'Synthetic public research fixture',language:repo.language,fork:repo.fork,default_branch:'main',parent:null});
   if(path===root+'/commits/main'||path===root+'/commits/'+FIXTURE_SHA)return Response.json({sha:FIXTURE_SHA});
   if(path===root+'/git/trees/'+FIXTURE_SHA)return Response.json({sha:FIXTURE_SHA,truncated:false,tree:Object.entries(repo.files).map(([path,text])=>({path,type:'blob',mode:'100644',size:Buffer.byteLength(String(text)),sha:'b2'.repeat(20)}))});
  }
  if(url.hostname==='raw.githubusercontent.com'&&(path.startsWith('/'+repo.name+'/'+FIXTURE_SHA+'/')||path.startsWith('/'+repo.name+'/main/'))){
   const name=path.split('/').slice(4).join('/');if(repo.files[name]!==undefined)return new Response(repo.files[name],{headers:{'Content-Type':'text/plain'}});
  }
  if(url.hostname==='github.com'&&path.startsWith('/'+repo.name)){
   if(path==='/'+repo.name||path==='/'+repo.name+'/')return new Response('<main><h1>'+repo.name+'</h1><pre>'+repo.files['README.md']+'</pre></main>',{headers:{'Content-Type':'text/html'}});
   const name=path.split('/').slice(5).join('/');if(repo.files[name]!==undefined)return new Response(repo.files[name],{headers:{'Content-Type':'text/plain'}});
  }
 }
 return new Response('Source not found',{status:404,headers:{'Content-Type':'text/plain'}});
}

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(input?.url || input);
    if (url === 'https://api.openai.com/v1/responses' && JSON.parse(String(init.body || '{}')).tools?.some((tool:any)=>tool.type==='web_search')) {
        effects.push({kind:'native-search'});
        if(CASE.searchFailed)return Response.json({error:{code:'search_unavailable'}},{status:503});
        const urls=fixtureUrls();
        const output=[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text:'Primary sources found. Read the relevant linked documentation and repository files to verify exact functionality.',annotations:urls.slice(0,8).map(url=>({type:'url_citation',title:'Primary documentation '+url,url}))}]}];
        return new Response('data: '+JSON.stringify({type:'response.completed',response:{status:'completed',output}})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});
    }
    if (url === 'https://api.deepseek.com/anthropic/v1/messages') {
        effects.push({ kind: 'native-search' });
        if (CASE.searchFailed) return Response.json({error:{type:'search_unavailable'}},{status:503});
        const urls = fixtureUrls();
        return Response.json({ content: [
            {type:'server_tool_use',id:'native-search',name:'web_search',input:{query:'fixture'}},
            {type:'web_search_tool_result',tool_use_id:'native-search',content:urls.slice(0,8).map(url=>({type:'web_search_result',title:'Primary documentation '+url,url}))},
            {type:'text',text:'Primary sources found. Read the relevant linked documentation and repository files to verify exact functionality.'}
        ]});
    }
    if (url.startsWith('https://fixture-worker.example/')) {
        const target=new URL(url).searchParams.get('url') || '';
        effects.push({kind:'fetch-page',url:target});
        const response=fixtureResponse(target);if(!response.ok)return Response.json({ok:false,error:'http_error',status:response.status});
        const text=(await response.text()).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
        return Response.json({ok:true,finalUrl:target,contentType:'text/plain',title:target,content:text.slice(0,6000),truncated:text.length>6000});
    }
    if (/^https:\/\/(?:api\.github\.com|raw\.githubusercontent\.com|github\.com|example\.com)\//.test(url)) {
        effects.push({kind:'fetch-page',url});return fixtureResponse(url);
    }
    if (url.startsWith(`https://cdn.discordapp.com/attachments/${channelId}/`) || url.startsWith('https://cdn.discordapp.com/attachments/700000000000000002/')) {
        const name = new URL(url).pathname.split('/').at(-1)!;
        if (!FIXTURES[name]) throw new Error('unexpected_fixture');
        return new Response(Buffer.from(FIXTURES[name], 'base64'), { headers: { 'Content-Type': 'image/png' } });
    }
    if (url.startsWith('https://api.deepseek.com/') || url.startsWith('https://api.openai.com/v1/') || url.startsWith('https://auth.openai.com/')) return originalFetch(input, init);
    throw new Error('benchmark_network_boundary');
}) as typeof fetch;
const permissions = { has: () => true };
const guild: any = CASE.dm ? null : { id: guildId, name: 'Synthetic TCP1P', memberCount: 3,
    roles: { everyone: { id: 'everyone' }, cache: new Collection() }, emojis: { cache: new Collection() },
    scheduledEvents: { cache: new Collection() }, channels: { cache: new Collection() }, members: { me: { id: botId }, cache: new Collection(), fetch: async () => new Collection() } };
const author = (who: string, name?: string) => ({ id: who === 'bot' ? botId : who === 'other' ? otherId : callerId,
    username: name || (who === 'bot' ? 'Hackerika' : who === 'other' ? 'KudaLiar' : callerName), tag: 'fixture', bot: who === 'bot',
    createDM: async () => ({ id: 'private-dm', send: async (payload: any) => { effects.push({ kind: 'dm', content: payload.content }); } }) });
let sent = 0;
const channel: any = { id: channelId, guildId: guild?.id, guild, type: CASE.dm ? ChannelType.DM : CASE.thread ? ChannelType.PublicThread : ChannelType.GuildText,
    name: CASE.threadName || 'CTF OSINT', topic: '', isThread: () => !!CASE.thread, isTextBased: () => true, permissionsFor: () => permissions,
    sendTyping: async () => {}, send: async (payload: any) => { effects.push({ kind: 'send', content: payload.content || '', files: payload.files?.map((file: any) => file.name || file.attachment?.name || 'file') || [] }); return { id: String(900000000000000000n + BigInt(++sent)) }; } };
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
const history: any[] = (CASE.history || []).map((m: any, index: number) => {const msg=makeMessage(m.who,m.text,index+1,m.name);msg.createdTimestamp=fixedNow-(CASE.historyAgeHours||4)*3600000+index*1000;msg.createdAt=new Date(msg.createdTimestamp);return msg;});
// Honor real Discord pagination and the before boundary, including teammates
// who post after the trigger while the old queue/model is still processing.
channel.messages = { fetch: async (args: any) => {
 if(typeof args==='string')return history.find(m=>m.id===args)||null;
 effects.push({kind:'history-page',before:args?.before||null,limit:args?.limit});
 const rows=history.filter(m=>!args?.before||BigInt(m.id)<BigInt(args.before)).sort((a,b)=>a.createdTimestamp-b.createdTimestamp);
 return new Collection(rows.slice(-(args?.limit||12)).reverse().map(m=>[m.id,m]));
} };
if (guild) { guild.channels.cache.set(channelId, channel); guild.channels.fetch = async (id: string) => guild.channels.cache.get(id) || null; }
const message = makeMessage('caller', CASE.prompt, 5000);message.createdTimestamp=fixedNow-1000;message.createdAt=new Date(message.createdTimestamp);
for(const [index,m] of (CASE.afterRequest||[]).entries()){
 const late=makeMessage(m.who||'other',m.text,5001+index,m.name);late.createdTimestamp=fixedNow-500;late.createdAt=new Date(late.createdTimestamp);history.push(late);
}
if(CASE.thread){
 const parentId='700000000000000002';
 const parent:any={id:parentId,guildId,guild,type:ChannelType.GuildText,name:'ctf-parent',permissionsFor:()=>({has:()=>CASE.parentVisible!==false})};
 channel.parent=parent;channel.parentId=parentId;
 channel.fetchStarterMessage=async()=>{
  effects.push({kind:'thread-starter-read'});
  const m=makeMessage('other',CASE.starter?.text||'',0,'Challenge author');m.id=channelId;m.channelId=CASE.starter?.parent===false?channelId:parentId;m.channel=CASE.starter?.parent===false?channel:parent;
  for(const [index,name] of (CASE.starter?.images||[]).entries())m.attachments.set(String(index),{name,size:Buffer.from(FIXTURES[name],'base64').length,contentType:'image/png',url:`https://cdn.discordapp.com/attachments/${m.channelId}/600000000000000001/${name}`});
  return m;
 };
 if(guild)guild.channels.cache.set(parentId,parent);
}
// Non-routing cases simulate an explicit summon. Optional, untagged follow-ups
// alone use continuation; forcing every case through that path allowed silence
// in cases whose frozen acceptance criteria required a direct answer.
if (!CASE.route) message.mentions.users.set(botId, author('bot'));
if (CASE.replyTo !== undefined) { message.reference = { messageId: history[CASE.replyTo].id }; message.mentions.repliedUser = history[CASE.replyTo].author; }
for (const [index, name] of (CASE.images || []).entries()) (CASE.imagesOnReply ? history[CASE.replyTo] : message).attachments.set(String(index), { name, size: Buffer.from(FIXTURES[name], 'base64').length, contentType: 'image/png', url: `https://cdn.discordapp.com/attachments/${channelId}/600000000000000001/${name}` });
if (guild) { guild.members.cache.set(callerId, message.member); for (const m of history) guild.members.cache.set(m.author.id, m.member); }
const { openai } = await import(`${root}/src/utils/openai.ts`);
const create = openai.chat.completions.create.bind(openai.chat.completions);
openai.chat.completions.create = async (payload: any, options: any) => {
    if (++modelCalls > 14) throw new Error('benchmark_call_cap');
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
    completions.push({ model: payload.model, elapsedMs: performance.now() - start, usage: response.usage || null, finishReason: response.choices[0]?.finish_reason });
    return response;
};
if (await Bun.file(`${root}/src/Services/AI/researchSources.ts`).exists()) {
    const {researchTransport}=await import(`${root}/src/Services/AI/researchSources.ts`);
    researchTransport.fetch=async (input:any,_options:any)=>{ const url=String(input);effects.push({kind:'read-source',url});return fixtureResponse(url); };
}
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
        if (CASE.route) {
            const { shouldChimeIn } = await import(`${root}/src/Services/AI/spontaneous.ts`);
            decision = await shouldChimeIn(message, botId, history.map(m => ({ id: m.id, authorId: m.author.id, isBot: m.author.bot, content: m.content, at: m.createdTimestamp })));
        }
        if (!CASE.route || decision?.shouldChime) await handleAIChat(message, message.client, CASE.route ? { continuation: true } : { addressed: true });
        else if (decision?.reactionEmoji) effects.push({ kind: 'react', emoji: decision.reactionEmoji });
        await new Promise(resolve => setTimeout(resolve, 15));
        (globalThis as any).benchMemory = memory[channelId]?.messages || [];
    }
} catch (error: any) { failure = error?.name || 'worker_failed'; console.error('BENCHMARK_CASE_EXCEPTION', error?.stack || failure); }
let ctfReport:any=null;
if(await Bun.file(`${root}/src/Services/AI/ctf.ts`).exists()){const {getCTFReport}=await import(`${root}/src/Services/AI/ctf.ts`);ctfReport=getCTFReport(message)||null;}
const result = { ctfReport, caseId: CASE.id, category: CASE.category, backend: CASE.backend || null, effects, interactionWrites, profileWrites,
    memory: ((globalThis as any).benchMemory || []).map(({ reasoning_content, images, ...entry }: any) => ({ ...entry, imageCount: images?.length || 0 })), toolCalls, completions, modelCalls, elapsedMs: performance.now() - started,
    action: CASE.route ? decision?.shouldChime ? 'reply' : decision?.reactionEmoji ? 'react' : 'ignore' : null,
    text: effects.filter(effect => effect.kind === 'send').map(effect => effect.content).join('\n'), failure: failure || providerFailures.join(',') };
console.log('CAPABILITY_RESULT:' + JSON.stringify(result));
process.exit(0);
