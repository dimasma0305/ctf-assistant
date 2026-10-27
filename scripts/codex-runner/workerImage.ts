import { join } from 'node:path';

const pinnedImage='hackerika-codex-worker:0.163.0-9';
const pinnedBin='/root/.codex/packages/standalone/releases/0.163.0-x86_64-unknown-linux-musl/bin';

async function run(args:string[],timeoutMs:number,diagnostic=false):Promise<number>{
  const child=Bun.spawn(args,{stdin:'ignore',stdout:'ignore',stderr:'pipe'});
  let tail='',timedOut=false;
  const output=(async()=>{for await(const chunk of child.stderr){tail=(tail+Buffer.from(chunk).toString()).slice(-4000);}})();
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},timeoutMs);
  const force=setTimeout(()=>child.kill('SIGKILL'),timeoutMs+5000);
  try{
    const code=await child.exited;await output;
    if(diagnostic&&code!==0)console.error(`[CodexWorker] image build failed exit=${code} timeout=${timedOut}: ${tail}`);
    return code;
  }finally{clearTimeout(timer);clearTimeout(force);}
}

export type WorkerImageState='checking'|'building'|'ready'|'unavailable';
interface ImageDependencies {
  inspect?:(image:string)=>Promise<boolean>;
  build?:(image:string)=>Promise<boolean>;
  onState?:(state:WorkerImageState)=>void;
}

/** A pruned local worker image must not silently disable every future CTF job. */
export async function ensureWorkerImage(image:string, dependencies:ImageDependencies={}):Promise<void>{
  const inspect=dependencies.inspect|| (async(target:string)=>await run(['docker','image','inspect',target],10_000)===0);
  const build=dependencies.build|| (async(target:string)=>await run([process.execPath,join(import.meta.dir,'build.ts'),pinnedBin,target],600_000,true)===0);
  dependencies.onState?.('checking');
  try{
    if(!await inspect(image)){
      if(image!==pinnedImage)throw Error('worker_image_unavailable');
      dependencies.onState?.('building');
      if(!await build(image)||!await inspect(image))throw Error('worker_image_unavailable');
    }
    dependencies.onState?.('ready');
  }catch(error){dependencies.onState?.('unavailable');throw error;}
}

/** Share startup, periodic and per-job checks so recovery never builds twice. */
export function createWorkerImageReadiness(image:string,dependencies:ImageDependencies={}){
  let state:WorkerImageState='checking',checkedAt:number|undefined;
  let pending:Promise<void>|undefined;
  return {
    status:()=>({state,ready:state==='ready',...(checkedAt?{checkedAt}:{})}),
    ensure():Promise<void>{
      if(pending)return pending;
      pending=ensureWorkerImage(image,{...dependencies,onState:next=>{state=next;checkedAt=Date.now();dependencies.onState?.(next);}})
        .finally(()=>{pending=undefined;});
      return pending;
    },
  };
}
