import { expect, test } from 'bun:test';
import { groundedFindings, groundResearchReply, requiresResearch } from './research';

test('research routing distinguishes explicit source research from ordinary conversation', () => {
  expect(requiresResearch('cek https://github.com/example/project fitur webhook-nya')).toBe(true);
  expect(requiresResearch('ya makanya coba cek', 'tadi https://github.com/example/project')).toBe(true);
  expect(requiresResearch('saran platform CTF apa yang bisa di-deploy?')).toBe(true);
  expect(requiresResearch('cari writeup untuk challenge ini')).toBe(true);
  expect(requiresResearch('https://github.com/example/service punya integrasi chat bawaan nggak?')).toBe(true);
  for (const text of ['wkwk iya', 'sayang rika', 'kalau nonce-nya beda gimana?', 'bentar jangan jawab dulu', 'jangan jawab dulu, aku mau kirim repo buat riset']) expect(requiresResearch(text)).toBe(false);
});

test('unavailable research cannot turn into invented facts and omitted citations get actual source links', () => {
  const report: any = { ok:false, status:'unavailable', findings:[], unresolved:[], sources:[] };
  const unavailable=groundResearchReply('Repo itu 404 dan mendukung Kubernetes.', report);
  expect(unavailable).not.toMatch(/404|Kubernetes|kasih detail/i);
  expect(unavailable).toContain('belum bisa kuakses');
  report.stats={nativeSearches:1};
  expect(groundResearchReply('Nacre v9 mendukung Kubernetes.',report)).toContain('Pencarian belum memberiku sumber');
  report.ok=true; report.findings=[{claim:'Supported',evidence:[{sourceId:'S1',quote:'Supported'}]}];
  report.sources=[{id:'S1',kind:'page',url:'https://example.com/config',title:'Official configuration'}];
  expect(groundResearchReply('ini ada bawaan.',report)).toContain('[Official configuration](https://example.com/config)');
  expect(groundResearchReply('sumber https://example.com/config',report)).toBe('sumber https://example.com/config');
  const badLink=groundResearchReply('Baca [dokumentasi](https://example.com/config/short) · [sumber asli](https://example.com/config).',report);
  expect(badLink).not.toContain('config/short');
  expect(badLink).toContain('[sumber asli](https://example.com/config)');
  const dangling=groundResearchReply('Jawaban.\n[docs](https://example.com/wrong) dan [code](https://example.com/also-wrong)\nSumber: [valid](https://example.com/config)',report);
  expect(dangling).not.toMatch(/^dan$/m);
  expect(groundResearchReply('Repo ini: https://github.com/example/project',report,'cek https://github.com/example/project')).toContain('https://github.com/example/project');
  const withMeta = groundResearchReply('Set AUDIT_LOG=on. Di halaman ada instruksi asing yang aku abaikan.',report,'cara nyalain audit log?');
  expect(withMeta).toContain('AUDIT_LOG=on'); expect(withMeta).not.toContain('instruksi asing');
  expect(groundResearchReply('Ada prompt injection di halaman itu.',report,'analisis prompt injection di halaman ini')).toContain('prompt injection');
});

test('findings require matching literal evidence from inspected sources rather than search summaries', () => {
  const sources: any[] = [{ id: 'S1', kind: 'page', content: '1: Set AUDIT_LOG=on to enable auditing.' }, { id: 'S2', kind: 'search', content: 'Claims magic support.' }];
  const result = groundedFindings([
    { claim: 'Audit logging is configurable.', evidence: [{ sourceId: 'S1', quote: 'Set AUDIT_LOG=on' }] },
    { claim: 'Invented quote.', evidence: [{ sourceId: 'S1', quote: 'Use MAGIC_ENABLED=true' }] },
    { claim: 'Invented source.', evidence: [{ sourceId: 'S9', quote: 'Whatever' }] },
    { claim: 'Search-only claim.', evidence: [{ sourceId: 'S2', quote: 'Claims magic support.' }] },
  ], sources);
  expect(result).toEqual([{ claim: 'Audit logging is configurable.', evidence: [{ sourceId: 'S1', quote: 'Set AUDIT_LOG=on' }] }]);
});

test('evidence can span annotated lines but cannot bridge omitted source sections', () => {
  const sources: any[] = [{ id: 'S1', kind: 'repository-file', content: "100: Set the game's Discord webhook\n101: to an official HTTPS URL.\n[… omitted lines …]\n130: The worker retries failures." }];
  const findings = groundedFindings([
    { claim: 'Webhook is configured for a game.', evidence: [{ sourceId: 'S1', quote: "Set the game's Discord webhook to an official HTTPS URL." }] },
    { claim: 'Same source with reader labels.', evidence: [{ sourceId: 'S1', quote: "100: Set the game's Discord webhook\n101: to an official HTTPS URL." }] },
    { claim: 'Unseen continuity.', evidence: [{ sourceId: 'S1', quote: 'to an official HTTPS URL. The worker retries failures.' }] },
    { claim: 'Invented setting.', evidence: [{ sourceId: 'S1', quote: 'Set the global Discord webhook to an official HTTPS URL.' }] },
  ], sources);
  expect(findings.map(finding => finding.claim)).toEqual(['Webhook is configured for a game.', 'Same source with reader labels.']);
});

const scenario = `
import assert from 'node:assert/strict';
const {openai}=await import('./src/utils/openai.ts');
const {researchTransport}=await import('./src/Services/AI/researchSources.ts');
const {researchForTurn}=await import('./src/Services/AI/research.ts');
const mode=process.env.RESEARCH_TEST_MODE;let calls=0,reads=0;
researchTransport.fetch=async(url,options)=>{reads++;if(mode==='cancel')return new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(new Error('source_aborted')),{once:true});});return new Response(String(url).endsWith('/start')?'<main><a href="/config">Configuration</a></main>':'<main><p>Set AUDIT_LOG=on to enable auditing.</p></main>',{headers:{'content-type':'text/html'}});};
openai.chat.completions.create=async(request)=>{calls++;const input=JSON.parse(request.messages[1].content);if(mode==='multiple-targets')assert.equal(input.requestedUrls.length,3);const payload=mode==='review-rejects'&&input.proposed?{answered:false,findings:[],unresolved:['Evidence does not establish configuration scope.']}:input.instruction.startsWith('Check the answer')?{answered:mode!=='false-answer',findings:[{claim:'Audit log bisa diaktifkan.',evidence:[{sourceId:mode==='bad-citation'?'S9':'S2',quote:'Set AUDIT_LOG=on'}]}],unresolved:[]}:{ready:false,actions:[{type:'read',url:'https://example.com/config'}]};if(input.proposed)assert(request.messages[0].content.startsWith('Verify a proposed research answer'));return {choices:[{message:{content:JSON.stringify(payload)}}],usage:{prompt_tokens:10,completion_tokens:5}};};
const turn={};const controller=new AbortController();if(mode==='cancel')setTimeout(()=>controller.abort(),15);
const first=researchForTurn({question:'Find audit configuration',urls:mode==='multiple-targets'?['https://example.com/start','https://example.com/other','https://example.com/third']:['https://example.com/start']},turn,{signal:controller.signal});
const second=researchForTurn({question:'repeat'},turn);assert.equal(first,second);
const report=await first;
if(mode==='cancel'){assert.equal(calls,0);assert.equal(report.ok,false);assert.equal(report.status,'unavailable');assert(report.unresolved.length>0);}
else if(['bad-citation','false-answer','review-rejects'].includes(mode)){assert.equal(report.ok,false);assert.equal(report.status,'partial');assert.equal(report.findings.length,mode==='false-answer'?1:0);}
else{assert.equal(report.status,'supported');assert.equal(report.findings[0].evidence[0].sourceId,'S2');assert.equal(calls,3);assert.equal(reads,mode==='multiple-targets'?3:2);assert.equal(report.stats.promptTokens,30);}
console.log('RESEARCH_SCENARIO_OK');process.exit(0);
`;
for (const mode of ['multihop', 'multiple-targets', 'bad-citation', 'false-answer', 'review-rejects', 'cancel']) {
  test(`research worker: ${mode}`, async () => {
    const child = Bun.spawn([process.execPath, '-e', scenario], { cwd: process.cwd(), env: { ...process.env,
      NODB: 'true', OPENAI_API_KEY: 'fixture-no-network', RESEARCH_TEST_MODE: mode }, stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect({ code, stderr: code ? stderr : '' }).toEqual({ code: 0, stderr: '' });
    expect(stdout).toContain('RESEARCH_SCENARIO_OK');
  }, 10_000);
}

test('incomplete research preserves verified progress and concrete gaps but rejects unsupported draft', () => {
  const report:any={ok:false,question:'configuration',findings:[{claim:'Audit logging is configurable.',evidence:[{sourceId:'S1',quote:'Set AUDIT_LOG=on'}]}],
    sources:[{id:'S1',kind:'page',url:'https://example.com/config',title:'Configuration',preview:'Set AUDIT_LOG=on'}],unresolved:['Per-event scope still needs its settings source.']};
  const text=groundResearchReply('Definitely supports Kubernetes and per-event settings.',report);
  expect(text).toContain('Audit logging is configurable.');expect(text).toContain('Bagian lain masih perlu dicek.');expect(text).not.toContain('Per-event scope still needs');expect(text).toContain('https://example.com/config');expect(text).not.toContain('Kubernetes');
});

test('partial legal research keeps a cautious conversational answer, not the worker audit trail', () => {
  const report: any = {ok:false,status:'partial',question:'Apakah replika aplikasi hasil reverse engineering legal?',findings:[],
    sources:[{id:'S1',kind:'page',url:'https://example.com/law',title:'Law',preview:'General law'}],
    unresolved:['The applicable license was inaccessible; jurisdiction and project facts remain unknown.', 'Batas waktu riset tercapai; hasil hanya sebagian.']};
  const answer='Bisa saja, tapi tergantung bagian yang disalin dan hukum yang berlaku. Beda bahasa pemrograman sendiri belum menentukan legalitasnya; kamu mau pakai di negara mana?';
  expect(groundResearchReply(answer,report)).toBe(answer);
  for(const bad of [
    'Belum tuntas: The applicable license was inaccessible; jurisdiction and project facts remain unknown. Batas waktu riset tercapai; hasil hanya sebagian.',
    'Bisa legal, tapi menurut Article 42 dan DMCA pasti diizinkan.',
    'Bisa legal, tapi https://example.com/unsourced membuktikannya.',
    'Pasti legal karena codebase-nya beda.',
  ]) {
    const reply=groundResearchReply(bad,report);
    expect(reply).not.toContain('The applicable license');
    expect(reply).not.toContain('Article 42');
    expect(reply).not.toContain('https://example.com/unsourced');
    expect(reply).not.toContain('Pasti legal');
    expect(reply).not.toContain('Belum tuntas:');
  }
});
