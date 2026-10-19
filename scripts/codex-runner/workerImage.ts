import { join } from 'node:path';

const pinnedImage='hackerika-codex-worker:0.163.0-2';
const pinnedBin='/root/.codex/packages/standalone/releases/0.163.0-x86_64-unknown-linux-musl/bin';

async function run(args:string[],timeoutMs:number):Promise<number>{
  const child=Bun.spawn(args,{stdin:'ignore',stdout:'ignore',stderr:'ignore'});
  const timer=setTimeout(()=>child.kill(),timeoutMs);
  try{return await child.exited;}finally{clearTimeout(timer);}
}

/** A pruned local worker image must not silently disable every future CTF job. */
export async function ensureWorkerImage(image:string, dependencies:{inspect?:(image:string)=>Promise<boolean>;build?:(image:string)=>Promise<boolean>}={}):Promise<void>{
  const inspect=dependencies.inspect|| (async(target:string)=>await run(['docker','image','inspect',target],10_000)===0);
  const build=dependencies.build|| (async(target:string)=>await run([process.execPath,join(import.meta.dir,'build.ts'),pinnedBin,target],180_000)===0);
  if(await inspect(image))return;
  if(image!==pinnedImage||!await build(image)||!await inspect(image))throw Error('worker_image_unavailable');
}
