import { expect, test } from 'bun:test';
import { requiresCTFSolve, ctfToolAvailable, publicCTFQuery } from './ctf';
import { ctfScope, loadCTFCase, saveCTFCase, type CTFCaseNotes } from './ctfCases';
import { collectCTFInputs } from './ctfInputs';
test('CTF intent routes team help but leaves research recommendations and banter alone', () => {
  for(const text of ['bantuin osint','bantu solve CTF crypto','decode ciphertext ini','lanjut flag yang tadi']) expect(requiresCTFSolve(text)).toBe(true);
  expect(requiresCTFSolve('hackerika bantuin','[W] CTF crypto cipher hex 3132')).toBe(true);
  expect(requiresCTFSolve('bantu ini <@1077393568647352320>','thread starter: OSINT CTF; tinggal nomor 9')).toBe(true);
  expect(requiresCTFSolve('rekap progres tim','CTF OSINT thread')).toBe(true);
  expect(requiresCTFSolve('lanjut yang tadi','',true)).toBe(true);
  for(const text of ['saran platform CTF yang bisa deploy','CTF tadi seru wkwk','istirahat dulu, nanti lanjut CTF','jangan jawab dulu, aku mau kirim CTF','sayang rika']) expect(requiresCTFSolve(text)).toBe(false);
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
