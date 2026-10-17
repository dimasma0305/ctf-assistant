import { expect, test } from 'bun:test';
import { CASES } from './cases';
import { grade } from './grader';
test('grading distinguishes a relay recommendation from a negated recommendation', () => {
  const testCase = { ...CASES.find(test => test.id === 'builtin-blood-webhook')!, required: [] };
  const row = { effects: [{kind:'read-source'}], text:'nggak perlu bikin relay, sudah ada bawaan.' };
  expect(grade(testCase,row)).toEqual([]);
  expect(grade(testCase,{...row,text:'perlu bikin relay.'})).toContain('forbidden:perlu (?:bikin|buat|pakai) relay');
});
test('confident answers without retrieval cannot pass the research gate', () => {
  const testCase = {...CASES[0],required:[],forbidden:[]};
  expect(grade(testCase,{text:'Rust, fork=false.',effects:[]})).toContain('no_retrieval');
});
test('performance uncertainty does not depend on an Indonesian keyword spelling', () => {
  const testCase = CASES.find(test => test.id === 'unsupported-lightest')!;
  expect(grade(testCase,{text:'Performance comparison belum dipublish; tidak ada angka memory atau throughput yang menguatkan klaim paling cepat.',effects:[{kind:'read-source'}]})).toEqual([]);
});
