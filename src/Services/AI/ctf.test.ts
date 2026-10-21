import { expect, test } from 'bun:test';
import { requiresCTFSolve, ctfToolAvailable, isCTFRetryRequest, publicCTFQuery } from './ctf';
import { Collection } from 'discord.js';
import { ctfScope, loadCTFCase, saveCTFCase, type CTFCaseNotes } from './ctfCases';
import { collectCTFInputs, collectCodexArtifacts } from './ctfInputs';
test('CTF intent routes team help but leaves research recommendations and banter alone', () => {
  for(const text of ['bantuin osint','bantu solve CTF crypto','decode ciphertext ini','lanjut flag yang tadi']) expect(requiresCTFSolve(text)).toBe(true);
  expect(requiresCTFSolve('hackerika bantuin','[W] CTF crypto cipher hex 3132')).toBe(true);
  expect(requiresCTFSolve('bantu ini <@1077393568647352320>','thread starter: OSINT CTF; tinggal nomor 9')).toBe(true);
  expect(requiresCTFSolve('rekap progres tim','CTF OSINT thread')).toBe(true);
  expect(requiresCTFSolve('lanjut yang tadi','',true)).toBe(true);
  for(const text of ['saran platform CTF yang bisa deploy','CTF tadi seru wkwk','istirahat dulu, nanti lanjut CTF','jangan jawab dulu, aku mau kirim CTF','sayang rika']) expect(requiresCTFSolve(text)).toBe(false);
});
test('request to solve another TCP1P challenge forces the CTF solver', () => {
  const message = '<@1077393568647352320> solve 1 soal lagi yg ada di tcp1p';
  expect(requiresCTFSolve(message, 'Denis JS write-up, challenge sebelumnya')).toBe(true);
  expect(ctfToolAvailable(message, 'Denis JS write-up, challenge sebelumnya')).toBe(true);
  expect(requiresCTFSolve('tolong pecahkan challenge TCP1P yang lain')).toBe(true);
  for (const unrelated of ['bantu buat reminder TCP1P besok', 'tolong riset platform TCP1P', 'TCP1P tadi seru wkwk']) {
    expect(requiresCTFSolve(unrelated, 'W: earlier CTF flag clue', true)).toBe(false);
    expect(ctfToolAvailable(unrelated)).toBe(false);
  }
});
test('explicit challenge solve by topic forces the CTF solver without a contest keyword', () => {
  for (const message of [
    '<@1077393568647352320> solve challenge ku yang tentang wordpress, yang mana aja',
    'tolong pecahkan challenge WordPress punyaku',
    'challenge WordPress ini, tolong solve',
  ]) {
    expect(requiresCTFSolve(message)).toBe(true);
    expect(ctfToolAvailable(message)).toBe(true);
  }
  for (const unrelated of [
    'tolong cek plugin WordPress ku',
    'challenge menulis harian ini seru',
    'bantu solve soal matematika ini',
  ]) {
    expect(requiresCTFSolve(unrelated)).toBe(false);
    expect(ctfToolAvailable(unrelated)).toBe(false);
  }
  expect(requiresCTFSolve('saran platform CTF yang bisa deploy')).toBe(false);
  expect(ctfToolAvailable('saran platform CTF yang bisa deploy')).toBe(false);
});
test('coba lagi resumes a recent failed CTF request from another member, not unrelated research', async () => {
  const now = Date.parse('2026-10-19T08:59:00Z');
  const bot = '1077393568647352320', teammate = '734732163332964456';
  const prior = { id: '111111111111111111', content: `<@${bot}> solve 1 soal lagi yg ada di tcp1p`,
    author: { id: teammate, bot: false }, createdTimestamp: now - 86 * 60_000 };
  const failure = { id: '222222222222222222', content: 'Pencarian belum memberiku sumber yang bisa kuperiksa, jadi aku belum bisa memverifikasi jawabannya sekarang.',
    author: { id: bot, bot: true }, createdTimestamp: now - 84 * 60_000 };
  const request = (content: string, messages: typeof prior[]) => ({ id: '333333333333333333', content, createdTimestamp: now,
    client: { user: { id: bot } }, channel: { messages: { fetch: async () => new Collection(messages.map(item => [item.id, item])) } } });
  const check = (content: string, messages: typeof prior[]) => isCTFRetryRequest(request(content, messages) as unknown as Parameters<typeof isCTFRetryRequest>[0]);
  expect(await check(`<@${bot}> coba lagi`, [prior, failure])).toBe(true);
  expect(await check('coba lagi', [prior, failure, { ...prior, id: '444444444444444444', content: 'wkwk', createdTimestamp: now - 20 * 60_000 }])).toBe(true);
  expect(await check('coba lagi', [prior, failure, ...Array.from({ length: 6 }, (_, index) => ({ ...prior,
    id: String(700000000000000000n + BigInt(index)), content: 'wkwk', createdTimestamp: now - (20 - index) * 60_000 }))])).toBe(true);
  expect(await check('coba lagi', [{ ...prior, content: 'tolong riset platform TCP1P' }, failure])).toBe(false);
  expect(await check('coba lagi', [prior, { ...prior, id: '777777777777777777', content: 'tolong riset platform TCP1P',
    createdTimestamp: now - 85 * 60_000 }, failure])).toBe(false);
  expect(await check('coba lagi', [prior, { ...failure, author: { id: teammate, bot: false } }])).toBe(false);
  expect(await check('coba lagi', [prior, failure, { ...failure, id: '555555555555555555', content: 'Oke, reminder sudah dibuat.', createdTimestamp: now - 5 * 60_000 }])).toBe(false);
  expect(await check('coba lagi', [prior, failure, { ...prior, id: '666666666666666666', content: 'tolong buat reminder besok', createdTimestamp: now - 5 * 60_000 }])).toBe(false);
  expect(await check('coba lagi', [{ ...prior, createdTimestamp: now - 4 * 60 * 60_000 }, { ...failure, createdTimestamp: now - 4 * 60 * 60_000 + 60_000 }])).toBe(false);
  expect(await check('coba lagi', [prior])).toBe(false);
});
test('public discovery rejects complete flags and credentials including URL-encoded flags', () => {
  expect(publicCTFQuery('Andrew Prahlow official composer')).toBe('Andrew Prahlow official composer');
  for(const input of ['Securinets{private_value}','LabCTF%7Bprivate%7D','token=private','<@111111111111111111> question','x'.repeat(351)]) expect(publicCTFQuery(input)).toBe(null);
});
test('checkpoint is shared in channel only, returned by value, and expires by timestamp', async () => {
  const scope=ctfScope({guildId:'g',channelId:'ctf-case-test'});
  const notes:CTFCaseNotes={title:'puzzle',summary:'teammate clue',findings:[],sources:[],attempts:[],candidates:[],unresolved:['date clue'],updatedAt:Date.now()};
  await saveCTFCase(scope,notes);
  expect((await loadCTFCase(scope))?.summary).toBe('teammate clue');
  const loaded=(await loadCTFCase(scope))!;loaded.summary='changed';
  expect((await loadCTFCase(scope))?.summary).toBe('teammate clue');
  expect(await loadCTFCase(ctfScope({guildId:'another',channelId:'ctf-case-test'}))).toBe(null);
  expect(await loadCTFCase(ctfScope({channelId:'ctf-case-test'}))).toBe(null);
  await saveCTFCase(scope,{...notes,updatedAt:Date.now()-25*60*60_000});
  expect(await loadCTFCase(scope)).toBe(null);
});
test('teammate artifacts include real same-channel source attribution and exclude foreign channel', async () => {
  const source=(id:string,channelId:string,text:string)=>({id,channelId,content:text,createdTimestamp:Date.now(),author:{id:'teammate',bot:false},attachments:new Map()});
  const current:any=source('3','public','bantu solve CTF');
  current.channel={messages:{fetch:async()=>new Map([['1',source('1','public','CTF ciphertext 3132')],['2',source('2','private','PRIVATE-NOT-FOR-PUBLIC')]])}};
  const result=await collectCTFInputs(current,{text:'initial'},new AbortController().signal);
  expect(result.text).toContain('CTF ciphertext 3132');expect(result.text).toContain('teammate');expect(result.text).not.toContain('PRIVATE-NOT-FOR-PUBLIC');
});
test('a replied-to source outside the newest page is still carried into the Codex packet', async () => {
  const replyId = '1562269823776596008', channelId = '700000000000000001';
  const reply = { id: replyId, channelId,
    content: 'Source: https://github.com/php/php-src/blob/PHP-8.6/ext/session/session.c',
    createdTimestamp: Date.now() - 3 * 60 * 60_000,
    author: { id: '765094257228120074', bot: false }, attachments: new Map() };
  const current: any = { id: '800000000000000001', channelId,
    content: 'coba bikin poc.py', createdTimestamp: Date.now(),
    reference: { messageId: replyId }, author: { id: '663394727688798231', bot: false },
    attachments: new Map(), channel: { isThread: () => false,
      messages: { fetch: async (query: any) => typeof query === 'string' ? reply : new Map() } } };
  const result = await collectCTFInputs(current, { text: current.content }, new AbortController().signal);
  expect(result.text).toContain('https://github.com/php/php-src/blob/PHP-8.6/ext/session/session.c');
  expect(result.originals.some(source => source.id === replyId)).toBe(true);
  current.channel.messages.fetch = async (query: any) => typeof query === 'string' ? { ...reply, channelId: 'another-channel' } : new Map();
  const denied = await collectCTFInputs(current, { text: current.content }, new AbortController().signal);
  expect(denied.text).not.toContain('github.com/php/php-src');
});
test('isolated runner receives bounded original Discord bytes with magic-checked image metadata',async()=>{
  const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
  const original=globalThis.fetch;globalThis.fetch=async()=>new Response(png,{headers:{'content-length':String(png.length)}});
  try{const artifacts=await collectCodexArtifacts([{id:'800000000000000111',channelId:'700000000000000111',authorId:'u',authorName:'W',isBot:false,content:'',createdAt:Date.now(),attachments:[{name:'clue.png',url:'https://cdn.discordapp.com/attachments/700000000000000111/800000000000000111/clue.png',size:png.length,contentType:'image/png'}]}],new AbortController().signal);
    expect(artifacts).toHaveLength(1);expect(artifacts[0]).toMatchObject({name:'clue.png',image:true,sourceMessageId:'800000000000000111'});expect(Buffer.from(artifacts[0].data,'base64')).toEqual(png);
  }finally{globalThis.fetch=original;}
});

const scenario = "import assert from 'node:assert/strict';\nconst {openai}=await import('./src/utils/openai.ts');\nconst {solveCTFForTurn,setCTFTurnContext,getCTFReport}=await import('./src/Services/AI/ctf.ts');\nconst {loadCTFCase,ctfScope}=await import('./src/Services/AI/ctfCases.ts');\nlet calls=0;\nopenai.chat.completions.create=async(payload,options)=>{\n calls++;const input=JSON.parse(payload.messages.at(-1).content);\n assert(!input.channelContext.includes('FOREIGN-PRIVATE'));\n const result=input.computations.length?{done:true,title:'unit decode',summary:'Computed deterministic decode.',findings:[],candidates:[{flag:'UnitCTF{abcd}',basis:'actual calculator output'}],unresolved:[],actions:[]}:{done:false,title:'unit decode',summary:'Need calculation.',actions:[{type:'compute',code:'return input.message.match(/UnitCTF\\\\{[^}]+\\\\}/)[0]',purpose:'Decode bytes'}]};\n return {choices:[{message:{content:JSON.stringify(result)}}]};\n};\nconst turn={content:'bantu solve CTF decode UnitCTF{abcd}',guildId:'g',channelId:'unit-worker'};\nsetCTFTurnContext(turn,{text:'supplied deterministic clue'});\nconst first=solveCTFForTurn({},turn);assert.equal(first,solveCTFForTurn({newCase:true},turn));\nconst report=await first;assert.equal(report.status,'candidate');assert.equal(report.checkerVerified,false);assert.equal(report.computations[0].result.value,'UnitCTF{abcd}');assert.equal(report.notes.candidates[0].flag,'UnitCTF{abcd}');assert.equal(calls,3);assert.equal(getCTFReport(turn),report);\nassert.equal((await loadCTFCase(ctfScope(turn))).title,'unit decode');assert.equal(await loadCTFCase('g:other-channel'),null);\nconsole.log('CTF_WORKER_OK');\n";
test("CTF tool actually executes code, checkpoints progress and deduplicates one turn", async()=>{
 const proc=Bun.spawn(["bun","-e",scenario],{cwd:process.cwd(),env:{...process.env,NODB:"true",AI_PROVIDER:"deepseek",OPENAI_API_KEY:"fixture-no-network"},stdout:"pipe",stderr:"pipe"});
 const [out,err,code]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);
 expect(code,err).toBe(0);expect(out).toContain("CTF_WORKER_OK");
});

test('a later model failure cannot erase a successful calculation or its checkpoint candidate', async()=>{
 const interrupted = scenario.replace('calls++;const input=', 'calls++;if(calls===2)throw Error("synthetic model interruption");const input=').replace('assert.equal(calls,3)', 'assert.equal(calls,2)');
 const proc=Bun.spawn(['bun','-e',interrupted],{cwd:process.cwd(),env:{...process.env,NODB:'true',AI_PROVIDER:'deepseek',OPENAI_API_KEY:'fixture-no-network'},stdout:'pipe',stderr:'pipe'});
 const [out,err,code]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);
 expect(code,err).toBe(0);expect(out).toContain('CTF_WORKER_OK');
});

const frontierScenario="import assert from 'node:assert/strict';\nconst {openai}=await import('./src/utils/openai.ts');\nconst {researchTransport}=await import('./src/Services/AI/researchSources.ts');\nconst {solveCTFForTurn}=await import('./src/Services/AI/ctf.ts');\nlet reads=0,calls=0;\nresearchTransport.fetch=async(url)=>{reads++;const pages={'https://example.com/index':'<main><a href=\"/story\">Original story</a></main>','https://example.com/story':'<main><p>District Rivergate.</p><a href=\"/entry\">Original event entry</a></main>','https://example.com/entry':'<main><p>Event 2018-09-17. Updated 2018-10-01.</p></main>'};return new Response(pages[String(url)]||'missing',{status:pages[String(url)]?200:404,headers:{'content-type':'text/html'}});};\nopenai.chat.completions.create=async(payload)=>{calls++;const input=JSON.parse(payload.messages.at(-1).content);assert.equal(input.checkpoint.sources.length,3);return{choices:[{message:{content:JSON.stringify({done:true,title:'two-hop event',summary:'Original entry inspected.',findings:[{claim:'District Rivergate.',evidence:[{sourceId:'S2',quote:'District Rivergate.'}]},{claim:'Event 2018-09-17.',evidence:[{sourceId:'S3',quote:'Event 2018-09-17.'}]}],candidates:[{flag:'UnitCTF{Rivergate_2018-09-17}',basis:'Original district and event date'}],unresolved:[],actions:[]})}}]};};\nconst r=await solveCTFForTurn({question:'Solve OSINT CTF district and event date, not edit date. https://example.com/index'},{content:'solve CTF https://example.com/index',guildId:'g',channelId:'frontier-unit'});\nassert.equal(reads,3);assert.equal(calls,2);assert.equal(r.notes.findings.length,2);assert.equal(r.notes.candidates[0].flag,'UnitCTF{Rivergate_2018-09-17}');assert.equal(r.checkerVerified,false);\nconsole.log('CTF_FRONTIER_OK');\n";
test("provided index follows two real source links before a missing-evidence decision",async()=>{
 const proc=Bun.spawn(["bun","-e",frontierScenario],{cwd:process.cwd(),env:{...process.env,NODB:"true",AI_PROVIDER:"deepseek",OPENAI_API_KEY:"fixture-no-network"},stdout:"pipe",stderr:"pipe"});
 const [out,err,code]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);expect(code,err).toBe(0);expect(out).toContain("CTF_FRONTIER_OK");
});

test('an active CTF cannot hijack unrelated social, Discord or platform-research requests',()=>{
 for(const text of ['tolong nyanyi dong','bantu hapus pesanku','bantu hapus pesan ini','tolong buat reminder besok','bantu rekomendasi platform CTF yang bisa deploy'])
   expect(requiresCTFSolve(text,'W: earlier CTF flag clue',true)).toBe(false);
 expect(requiresCTFSolve('hackerika bantuin','W: CTF clue')).toBe(true);
 expect(requiresCTFSolve('bantu punya W yang tadi','W: CTF clue')).toBe(true);
});
test('CTF tool eligibility follows the current question rather than the channel title',()=>{
 expect(ctfToolAvailable('rapatnya jadi jam berapa dan di mana?', 'channel=CTF OSINT; old solved flag', true)).toBe(false);
 expect(ctfToolAvailable('Apa flag yang didapat dari ciphertext ini?')).toBe(true);
 expect(ctfToolAvailable('bantu ini <@1077393568647352320>', 'thread starter: CTF misc')).toBe(true);
 expect(ctfToolAvailable('Rika rekap progres tim', 'thread starter: OSINT')).toBe(true);
});
