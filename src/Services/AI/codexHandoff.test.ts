import { expect, test } from 'bun:test';
import { groundCodexHandoff } from './codexHandoff';

test('an accepted Codex job overrides an immediate false refusal and shows its status', () => {
  const id = '7bae9e20-1804-4ba6-8be5-eb4580dc2fb2';
  const modelReply = 'Aku belum bisa bikin PoC atau memverifikasinya di serverku.';
  const answer = groundCodexHandoff(modelReply, JSON.stringify({ ok: true, status: 'queued', job: { id } }));
  expect(answer).toContain('mulai kerjakan');
  expect(answer).toContain('7bae9e20');
  expect(answer).not.toContain('belum bisa');
});

test('a rejected delegation keeps the manager explanation, while a busy job is not called new work', () => {
  const original = 'Kuota job sedang penuh; coba lagi nanti.';
  expect(groundCodexHandoff(original, JSON.stringify({ ok: false, error: 'user_hourly_limit' }))).toBe(original);
  const busy = groundCodexHandoff(original, JSON.stringify({ ok: true, status: 'busy',
    job: { id: '7bae9e20-1804-4ba6-8be5-eb4580dc2fb2' } }));
  expect(busy).toContain('Masih ada job');
  expect(busy).not.toContain('mulai kerjakan');
});

test('a queued investigation acknowledges the task without lab jargon or claiming findings',()=>{
  const answer=groundCodexHandoff('Ini hasil riset lengkapnya',JSON.stringify({ok:true,status:'queued',
    job:{id:'7bae9e20-1804-4ba6-8be5-eb4580dc2fb2',kind:'investigation',state:'pending'}}));
  expect(answer).toContain('Hasilnya nanti');
  expect(answer).not.toContain('lab terisolasi');
  expect(answer).not.toContain('hasil riset lengkap');
});

test('unavailable worker labels inline research as a fallback after answer grounding', () => {
  const evidence = 'Situs tim mengkredit handle tersebut. [Sumber](https://example.com/team)';
  for (const error of ['worker_preparing', 'worker_image_unavailable', 'isolated_agent_unavailable']) {
    const answer = groundCodexHandoff(evidence, JSON.stringify({ ok: false, error }), true);
    expect(answer).toStartWith('Agen riset sedang tidak tersedia;');
    expect(answer).toContain(evidence);
    expect(answer).toContain('sementara');
    const noEvidence = groundCodexHandoff('Sudah mulai; hasilnya menyusul.', JSON.stringify({ ok: false, error }));
    expect(noEvidence).toContain('belum mulai');
    expect(noEvidence).not.toContain('menyusul');
  }
  expect(groundCodexHandoff(evidence, undefined, true)).toBe(evidence);
});
