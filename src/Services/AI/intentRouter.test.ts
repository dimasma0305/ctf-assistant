import { expect, test } from 'bun:test';
import { needsSemanticRouting, parseSemanticIntent } from './intentRouter';

test('semantic router runs only for challenge ambiguity and person-OSINT conflicts', () => {
  expect(needsSemanticRouting('bantu soal web yang kemarin', { ctf: false, research: false })).toBe(true);
  expect(needsSemanticRouting('cek challenge WordPress ini', { ctf: false, research: false })).toBe(true);
  expect(needsSemanticRouting('lanjutin soal web yang tadi', { ctf: false, research: false })).toBe(true);
  expect(needsSemanticRouting('bantu osint tentang <@123456789012345678>', { ctf: true, research: true })).toBe(true);
  expect(needsSemanticRouting('tolong bantu OSINT si Dimas di Discord', { ctf: true, research: true })).toBe(true);
  for (const text of ['solve CTF crypto ini', 'solve challenge WordPress punyaku'])
    expect(needsSemanticRouting(text, { ctf: true, research: true })).toBe(false);
  for (const text of ['wkwk', 'sayang rika', 'tolong cek plugin WordPress ku', 'saran platform CTF yang bisa deploy',
    'tolong cari channel Discord yang bahas soal web', 'jangan jawab dulu, bantu soal web'])
    expect(needsSemanticRouting(text, { ctf: false, research: false })).toBe(false);
  expect(needsSemanticRouting('cari writeup untuk challenge ini', { ctf: false, research: true })).toBe(false);
});

test('semantic router rejects malformed, unsupported and low-confidence decisions', () => {
  expect(parseSemanticIntent('{"intent":"ctf_solve","confidence":0.91}')).toBe('ctf_solve');
  expect(parseSemanticIntent('{"intent":"research","confidence":0.89}')).toBe('research');
  expect(parseSemanticIntent('{"intent":"chat","confidence":0.9}')).toBe('chat');
  for (const raw of ['not json', '{"intent":"solve_ctf","confidence":1}',
    '{"intent":"ctf_solve","confidence":0.84}', '{"intent":"research","confidence":0.3}',
    '{"intent":"ctf_solve","confidence":2}', '{}']) expect(parseSemanticIntent(raw)).toBeNull();
});
