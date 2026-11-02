import { expect, test } from 'bun:test';
import { createWorkerImageReadiness, type WorkerImageState } from './workerImage';
import { WORKER_IMAGE } from './runtime';

const image=WORKER_IMAGE;

test('concurrent readiness checks share one rebuild and stay unready until the built image is inspected',async()=>{
  let present=false,healthy=false,builds=0;
  let finish!:()=>void;
  const gate=new Promise<void>(resolve=>{finish=resolve;});
  const states:WorkerImageState[]=[];
  const worker=createWorkerImageReadiness(image,{inspect:async()=>present,probe:async()=>healthy,
    build:async()=>{builds++;await gate;present=true;healthy=true;return true;},onState:state=>states.push(state)});
  const first=worker.ensure(),second=worker.ensure();
  await Promise.resolve();
  expect(first).toBe(second);expect(builds).toBe(1);
  expect(worker.status()).toMatchObject({ready:false,state:'building'});
  finish();await Promise.all([first,second]);
  expect(worker.status()).toMatchObject({ready:true,state:'ready'});
  expect(states).toEqual(['checking','building','ready']);
  await worker.ensure();expect(builds).toBe(1);
  healthy=false;await worker.ensure();expect(builds).toBe(2);
});

test('a failed build or missing final image cannot advertise readiness, and a later repair can recover',async()=>{
  let present=false,buildSucceeded=false;
  const worker=createWorkerImageReadiness(image,{inspect:async()=>present,probe:async()=>present,build:async()=>buildSucceeded});
  await expect(worker.ensure()).rejects.toThrow('worker_image_unavailable');
  expect(worker.status()).toMatchObject({ready:false,state:'unavailable'});
  buildSucceeded=true;
  await expect(worker.ensure()).rejects.toThrow('worker_image_unavailable');
  expect(worker.status().ready).toBe(false);
  present=true;await worker.ensure();expect(worker.status().ready).toBe(true);
});

test('an installed image that fails its worker-user preflight is rebuilt before becoming ready',async()=>{
  let healthy=false,builds=0;
  const worker=createWorkerImageReadiness(image,{inspect:async()=>true,probe:async()=>healthy,
    build:async()=>{builds++;healthy=true;return true;}});
  await worker.ensure();
  expect(builds).toBe(1);
  expect(worker.status()).toMatchObject({ready:true,state:'ready'});
});
