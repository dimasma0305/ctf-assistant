import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inferenceSlots } from './inferenceSlots';
import { startGateway } from './gateway';
import { newJob } from './protocol';

test('slots are bounded, queued FIFO, and a double release cannot admit extra work', async () => {
  const pool=inferenceSlots(2,2), signal=new AbortController().signal;
  const a=await pool.acquire(signal), b=await pool.acquire(signal), order:string[]=[];
  const c=pool.acquire(signal).then(release=>{order.push('c');return release;});
  const d=pool.acquire(signal).then(release=>{order.push('d');return release;});
  expect(pool.status()).toEqual({active:2,queued:2});
  await expect(pool.acquire(signal)).rejects.toThrow('inference_queue_full');
  b();const releaseC=await c;expect(order).toEqual(['c']);
  a();const releaseD=await d;expect(order).toEqual(['c','d']);
  a();b();expect(pool.status()).toEqual({active:2,queued:0});
  releaseC();releaseD();expect(pool.status()).toEqual({active:0,queued:0});
});

test('cancelled waiters never acquire a slot or block the next child', async () => {
  const pool=inferenceSlots(1,2), controller=new AbortController(), signal=new AbortController().signal;
  const parent=await pool.acquire(signal), cancelled=pool.acquire(controller.signal);
  const survivor=pool.acquire(signal);
  controller.abort();await expect(cancelled).rejects.toThrow('inference_request_aborted');
  expect(pool.status()).toEqual({active:1,queued:1});
  parent();const release=await survivor;expect(pool.status()).toEqual({active:1,queued:0});release();
  await expect(pool.acquire(controller.signal)).rejects.toThrow('inference_request_aborted');
});

test('gateway permits three concurrent agent streams, queues the next, and keeps shared job budgets',async()=>{
  const root=await mkdtemp(join(tmpdir(),'codex-parallel-test-')),socket=join(root,'gateway.sock');
  const job=newJob({kind:'investigation',route:'auto',scope:'555555555555555555:700000000000000001',guildId:'555555555555555555',
    channelId:'700000000000000001',messageId:'800000000000000001',userId:'663394727688798231',question:'Research a public project.',context:'',artifacts:[]});
  const encoder=new TextEncoder(), upstream:ReadableStreamDefaultController<Uint8Array>[]=[];
  let fetched=0;const sent:any[]=[];
  const gateway=await startGateway(socket,job,'gpt-6-sol',AbortSignal.timeout(5000),{
    maxCalls:4,credentials:async()=>({access_token:'fixture'}),fetcher:(async(_url,init)=>{
      fetched++;sent.push(JSON.parse(String(init?.body)));
      return new Response(new ReadableStream<Uint8Array>({start(controller){upstream.push(controller);
        controller.enqueue(encoder.encode('data: {"type":"response.created"}\n\n'));}}),{headers:{'Content-Type':'text/event-stream'}});
    }) as typeof fetch});
  const request=()=>fetch('http://localhost/v1/responses',{unix:socket,method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({model:'gpt-6-sol',input:[{role:'user',content:'Continue'}]}),signal:AbortSignal.timeout(4000)});
  const until=async(predicate:()=>boolean)=>{const deadline=Date.now()+2000;while(!predicate()&&Date.now()<deadline)await Bun.sleep(5);expect(predicate()).toBe(true);};
  try{
    const responses=[request(),request(),request()];
    await until(()=>fetched===3);expect(job.stats.calls).toBe(3);
    const fourth=request();await Bun.sleep(20);expect(fetched).toBe(3);
    // Model completion frees the slot even if the HTTP connection stays open.
    upstream[0].enqueue(encoder.encode('data: {"type":"response.completed"}\n\n'));
    await until(()=>fetched===4);
    upstream[0].close();
    for(const stream of upstream.slice(1)){stream.enqueue(encoder.encode('data: {"type":"response.completed"}\n\n'));stream.close();}
    const all=await Promise.all([...responses,fourth]);expect(all.map(r=>r.status)).toEqual([200,200,200,200]);
    await Promise.all(all.map(r=>r.text()));expect(job.stats.calls).toBe(4);
    expect(sent[0].tool_choice).toBeUndefined();
    expect(sent[3]).toMatchObject({tool_choice:'none',tools:[]});
    const capped=await request();expect(capped.status).toBe(429);
    expect(await capped.json()).toEqual({error:'model_call_budget'});expect(fetched).toBe(4);
  }finally{gateway.close();await rm(root,{recursive:true,force:true});}
});
