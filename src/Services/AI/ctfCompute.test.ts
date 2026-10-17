import { expect, test } from 'bun:test';
import { computeCTF, validateCTFCalculation } from './ctfCompute';
test('calculation recovers XOR plaintext and independently verifies RSA', async () => {
  const xor = await computeCTF(`return String.fromCharCode(...'7b56557463714c4f584568455254525e47436805004a'.match(/../g).map(x=>parseInt(x,16)^55))`);
  expect(xor).toEqual({ok:true,value:'LabCTF{xor_receipt_27}'});
  expect(await computeCTF('let x=1n;for(let i=0;i<17;i++)x=x*82n%3233n;return String(x)')).toEqual({ok:true,value:'1859'});
});
test('guest has no host/network access and no state from earlier guests', async () => {
  expect(await computeCTF('globalThis.remember=123;return [typeof process,typeof Bun,typeof fetch,typeof require,typeof WebSocket]')).toEqual({ok:true,value:['undefined','undefined','undefined','undefined','undefined']});
  expect(await computeCTF('return typeof remember')).toEqual({ok:true,value:'undefined'});
  expect((await computeCTF('return import("node:fs")')).ok).toBe(false);
});
test('runaway CPU, allocation, malformed code and huge outputs are bounded', async () => {
  const start=performance.now(); expect((await computeCTF('while(true){}')).ok).toBe(false); expect(performance.now()-start).toBeLessThan(5000);
  expect((await computeCTF('return Array(100000000).fill("abc")')).ok).toBe(false);
  expect((await computeCTF('return )')).ok).toBe(false);
  expect(await computeCTF('return "x".repeat(20000)')).toEqual({ok:false,error:'compute_output_limit'});
});
test('abort terminates a worker and invalid inputs do not allocate one', async () => {
  const controller=new AbortController();const run=computeCTF('while(true){}',controller.signal);controller.abort();
  expect(await run).toEqual({ok:false,error:'compute_cancelled'});
  expect((await computeCTF('')).error).toBe('invalid_compute_code');
  expect((await computeCTF('x'.repeat(32001))).ok).toBe(false);
});

test('computed values must distinguish parser errors and incomplete flag syntax from usable candidates', () => {
  expect(validateCTFCalculation({ok:true,value:['DemoCTF{abc']})).toMatchObject({ok:false,error:'incomplete_flag_delimiter'});
  expect(validateCTFCalculation({ok:true,value:{error:'missing ciphertext'}})).toMatchObject({ok:false,error:'calculation_reported_error'});
  expect(validateCTFCalculation({ok:true,value:['DemoCTF{abc}']})).toMatchObject({ok:true,flagSyntax:[{value:'DemoCTF{abc}',complete:true}]});
});

test('prefix/suffix and echoed input are components, while actual candidate values require full delimiters',()=>{
 expect(validateCTFCalculation({ok:true,value:{extractedPrefix:'DemoCTF{dock_',extractedSuffix:'_date}',candidates:['DemoCTF{dock_A_date}']}})).toMatchObject({ok:true,flagSyntax:[{value:'DemoCTF{dock_A_date}',complete:true}]});
 expect(validateCTFCalculation({ok:true,value:{prefix:'DemoCTF{dock_',candidates:['DemoCTF{dock_A_date']}})).toMatchObject({ok:false,error:'incomplete_flag_delimiter'});
});
