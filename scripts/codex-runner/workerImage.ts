import { join } from 'node:path';
import { WORKER_IMAGE } from './runtime';

async function run(args:string[],timeoutMs:number,diagnostic=''):Promise<number>{
  const child=Bun.spawn(args,{stdin:'ignore',stdout:'ignore',stderr:'pipe'});
  let tail='',timedOut=false;
  const output=(async()=>{for await(const chunk of child.stderr){tail=(tail+Buffer.from(chunk).toString()).slice(-4000);}})();
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},timeoutMs);
  const force=setTimeout(()=>child.kill('SIGKILL'),timeoutMs+5000);
  try{
    const code=await child.exited;await output;
    if(diagnostic&&code!==0)console.error(`[CodexWorker] ${diagnostic} failed exit=${code} timeout=${timedOut}: ${tail}`);
    return code;
  }finally{clearTimeout(timer);clearTimeout(force);}
}

export type WorkerImageState='checking'|'building'|'ready'|'unavailable';
interface ImageDependencies {
  inspect?:(image:string)=>Promise<boolean>;
  probe?:(image:string)=>Promise<boolean>;
  build?:(image:string)=>Promise<boolean>;
  onState?:(state:WorkerImageState)=>void;
}

/** A pruned local worker image must not silently disable every future CTF job. */
export async function ensureWorkerImage(image:string, dependencies:ImageDependencies={}):Promise<void>{
  const inspect=dependencies.inspect|| (async(target:string)=>await run(['docker','image','inspect',target],10_000)===0);
  const probe=dependencies.probe|| (async(target:string)=>await run(['docker','run','--rm','--network','none','--read-only','--user','1000:1000',
    '--pids-limit','64','--memory','512m','--cpus','1','--tmpfs','/tmp:rw,exec,nosuid,nodev,size=64m,uid=1000,gid=1000',
    '--tmpfs','/workspace:rw,exec,nosuid,nodev,size=64m,uid=1000,gid=1000','-e','HACKERIKA_WORKER_PREFLIGHT=1',target],30_000,'image probe')===0);
  const build=dependencies.build|| (async(target:string)=>await run([process.execPath,join(import.meta.dir,'build.ts'),'--retained',target],600_000,'image build')===0);
  dependencies.onState?.('checking');
  try{
    if(!await inspect(image)||!await probe(image)){
      if(image!==WORKER_IMAGE)throw Error('worker_image_unavailable');
      dependencies.onState?.('building');
      if(!await build(image)||!await inspect(image)||!await probe(image))throw Error('worker_image_unavailable');
    }
    dependencies.onState?.('ready');
  }catch(error){dependencies.onState?.('unavailable');throw error;}
}

/** Share startup, periodic and per-job checks so recovery never builds twice. */
export function createWorkerImageReadiness(image:string,dependencies:ImageDependencies={}){
  let state:WorkerImageState='checking',checkedAt:number|undefined;
  let pending:Promise<void>|undefined;
  return {
    status:()=>({image,state,ready:state==='ready',...(checkedAt?{checkedAt}:{})}),
    ensure():Promise<void>{
      if(pending)return pending;
      pending=ensureWorkerImage(image,{...dependencies,onState:next=>{state=next;checkedAt=Date.now();dependencies.onState?.(next);}})
        .finally(()=>{pending=undefined;});
      return pending;
    },
  };
}
