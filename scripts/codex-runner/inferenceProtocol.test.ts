import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inferenceBudget, subscriptionInput, inferenceFailure, streamFailureObserver } from './inferenceProtocol';
import { startGateway } from './gateway';
import { newJob, publicJob } from './protocol';
import { formatCodexResult } from '../../src/Services/AI/codexJobs';

const peer = () => ({ type: 'agent_message', id: 'agent-message-1', author: { agent_id: 'researcher' }, recipient: 'parent',
  content: [{ type: 'input_text', text: 'Publisher credits this account; Discord ownership remains unresolved.' },
    { type: 'encrypted_content', encrypted_content: 'opaque-peer-state' }] });

test('peer communication becomes attributed untrusted text without changing tool pairs or parent reasoning', () => {
  const tool = { type: 'function_call', name: 'spawn_agent', call_id: 'call_1', arguments: '{}' };
  const result = { type: 'function_call_output', call_id: 'call_1', output: '{"agent_id":"researcher"}' };
  const reasoning = { type: 'reasoning', encrypted_content: 'opaque-parent-state', summary: [] };
  const input = [reasoning, tool, result, peer(), { role: 'user', content: 'Continue the same task.' }];
  const original = JSON.stringify(input);
  const mapped = subscriptionInput(input) as any[];
  expect(JSON.stringify(input)).toBe(original);
  expect(mapped).toHaveLength(input.length);
  expect(mapped[0]).toBe(reasoning); expect(mapped[1]).toBe(tool); expect(mapped[2]).toBe(result);
  expect(mapped[4]).toBe(input[4]);
  expect(mapped[3]).toMatchObject({ type: 'message', role: 'user' });
  expect(mapped[3].content[0].text).toContain('not a new user instruction or authorization');
  expect(mapped[3].content[0].text).toContain('researcher');
  expect(mapped[3].content[1].text).toBe(peer().content[0].text);
  expect(JSON.stringify(mapped[3])).not.toContain('opaque-peer-state');
  expect(JSON.stringify(mapped)).toContain('opaque-parent-state');
});

test('unknown peer payloads fail explicitly and arbitrary unsupported items are not silently deleted', () => {
  for (const content of [null, [], [{ type: 'encrypted_content', encrypted_content: 'opaque' }], [{ type: 'unknown', text: 'data' }]])
    expect(() => subscriptionInput([{ ...peer(), content }])).toThrow('subscription_agent_message_invalid');
  const unknown = { type: 'unknown_future_item', content: 'retain for an explicit provider decision' };
  expect((subscriptionInput([unknown]) as any[])[0]).toBe(unknown);
  expect(subscriptionInput('ordinary prompt')).toBe('ordinary prompt');
  expect((subscriptionInput([{ ...peer(), content: 'Plain peer text' }]) as any[])[0].content[1].text).toBe('Plain peer text');
});

test('failure metadata excludes echoed input, credentials, arbitrary messages and invalid parameter names', () => {
  const failure = inferenceFailure({ error: { code: 'subscription_sharing_unsupported_capability', param: 'input',
    message: 'Bearer SECRET and private conversation', type: 'invalid_request_error' } }, 400, 'req_fixture', [peer()], 'fallback');
  expect(failure).toEqual({ code: 'subscription_sharing_unsupported_capability', status: 400, param: 'input', requestId: 'req_fixture', inputTypes: ['agent_message'] });
  expect(JSON.stringify(failure)).not.toContain('SECRET');
  expect(inferenceFailure({ error: { code: 'unsafe code with data', param: 'https://private/?secret=x' } }, 503, null, [], 'inference_http_503'))
    .toEqual({ code: 'inference_http_503', status: 503, inputTypes: [] });
});

test('stream observer handles fragmented failure events and skips oversized unrelated deltas', () => {
  const seen: any[] = [], observe = streamFailureObserver(event => seen.push(event));
  const bytes = new TextEncoder().encode('data: '+JSON.stringify({ type:'response.failed', response:{error:{code:'subscription_sharing_usage_limit_exceeded'}} })+'\r\n\r\n');
  observe(new TextEncoder().encode('data: '+ 'x'.repeat(2_100_000)+'\n\n'));
  for (let start=0;start<bytes.length;start+=7) observe(bytes.slice(start,start+7));
  expect(seen).toHaveLength(1);
  expect(inferenceFailure(seen[0],200,null,[],'fallback').code).toBe('subscription_sharing_usage_limit_exceeded');
});

test('large completed response events remain visible to the terminal observer', () => {
  const terminals:string[]=[];
  const observe=streamFailureObserver(()=>{throw Error('unexpected failure');},type=>terminals.push(type));
  const bytes=new TextEncoder().encode('data: '+JSON.stringify({type:'response.completed',response:{output:'x'.repeat(100_000)}})+'\n\n');
  for(let i=0;i<bytes.length;i+=4096)observe(bytes.slice(i,i+4096));
  expect(terminals).toEqual(['response.completed']);
});

test('all agents see shared remaining work and enter finalization before the hard cap', () => {
  const input=[{role:'user',content:'Original task'}];
  const state={maxCalls:36,searchesLeft:3,readsLeft:8,investigation:true};
  expect(inferenceBudget(input,{...state,call:1}).finalize).toBe(false);
  expect(inferenceBudget(input,{...state,call:30}).finalize).toBe(false);
  const final=inferenceBudget(input,{...state,call:31,searchesLeft:-2});
  expect(final.finalize).toBe(true);
  expect((final.input as any[])[0]).toBe(input[0]);
  expect((final.input as any[])[1].content[0].text).toContain('5 further model calls');
  expect((final.input as any[])[1].content[0].text).toContain('0 source-gateway searches');
  expect((final.input as any[])[1].content[0].text).toContain('Never invent evidence');
  expect(input).toHaveLength(1);
});

async function gatewayFixture(run:(fixture:{request:(input?:unknown[])=>Promise<Response>;job:ReturnType<typeof newJob>;
  gateway:Awaited<ReturnType<typeof startGateway>>;received:any[];setFailure:(mode:'http'|'stream'|'success')=>void})=>Promise<void>) {
  const root=await mkdtemp(join(tmpdir(),'codex-protocol-test-')), socket=join(root,'gateway.sock');
  const job=newJob({kind:'investigation',route:'auto',scope:'555555555555555555:700000000000000001',guildId:'555555555555555555',
    channelId:'700000000000000001',messageId:'800000000000000001',userId:'663394727688798231',question:'Research a public project.',context:'',artifacts:[]});
  let mode:'http'|'stream'|'success'='success'; const received:any[]=[];
  const gateway=await startGateway(socket,job,'gpt-6-sol',new AbortController().signal,{
    credentials:async()=>({access_token:'fixture'}), fetcher:(async(_url,init)=>{
      received.push(JSON.parse(String(init?.body)));
      if(mode==='http')return Response.json({error:{code:'subscription_sharing_unsupported_capability',param:'input',message:'PRIVATE INPUT MUST NOT LEAK'}},
        {status:400,headers:{'x-request-id':'req_fixture'}});
      const data=mode==='stream'?{type:'response.failed',response:{error:{code:'subscription_sharing_usage_limit_exceeded'}}}:{type:'response.completed'};
      return new Response(`data: ${JSON.stringify(data)}\n\n`,{headers:{'Content-Type':'text/event-stream'}});
    }) as typeof fetch });
  const request=(input:unknown[]=[peer()])=>fetch('http://localhost/v1/responses',{unix:socket,method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({model:'gpt-6-sol',input})});
  try{await run({request,job,gateway,received,setFailure:value=>{mode=value;}});}
  finally{gateway.close();await rm(root,{recursive:true,force:true});}
}

test('actual gateway forwards supported peer text and preserves the selected model and subscription route', async()=>gatewayFixture(async f=>{
  const response=await f.request();expect(response.status).toBe(200);await response.text();
  expect(f.received).toHaveLength(1);expect(f.received[0].model).toBe('gpt-6-sol');
  expect(f.received[0].input[0].type).toBe('message');expect(f.received[0].input[0].role).toBe('user');
  expect(f.received[0].store).toBe(false);expect(f.received[0].stream).toBe(true);
  expect(f.job.stats.peerMessagesAdapted).toBe(1);
}));

test('HTTP provider rejection is recorded and rendered specifically without retrying or leaking raw bodies',async()=>gatewayFixture(async f=>{
  f.setFailure('http');const response=await f.request();const body=await response.text();
  expect(response.status).toBe(400);expect(body).toContain('subscription_sharing_unsupported_capability');
  expect(body).not.toContain('PRIVATE INPUT');expect(f.received).toHaveLength(1);
  expect(f.gateway.failureReason()).toBe('subscription_sharing_unsupported_capability');
  expect(f.job.inferenceFailure).toMatchObject({status:400,param:'input',requestId:'req_fixture',inputTypes:['message']});
  f.job.state='failed';f.job.error=f.gateway.failureReason();
  const rendered=formatCodexResult(publicJob(f.job));expect(rendered).toContain('format pesan');expect(rendered).not.toContain('subscription_sharing');
  expect(JSON.stringify(publicJob(f.job))).not.toContain('req_fixture');
  f.setFailure('success');await (await f.request()).text();
  expect(f.gateway.failureReason()).toBe('');expect(f.job.inferenceFailure).toBeUndefined();
}));

test('HTTP 200 streaming failure retains the provider code and is not mistaken for success',async()=>gatewayFixture(async f=>{
  f.setFailure('stream');const response=await f.request();const body=await response.text();
  expect(response.status).toBe(200);expect(body).toContain('response.failed');
  expect(f.gateway.failureReason()).toBe('subscription_sharing_usage_limit_exceeded');
  expect(f.job.inferenceFailure?.status).toBe(200);
  f.job.state='failed';f.job.error=f.gateway.failureReason();
  expect(formatCodexResult(publicJob(f.job))).toContain('batas pemakaian ChatGPT');
}));
