import { chmod, copyFile, cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CODEX_RELEASE, retainCodexRuntime, WORKER_IMAGE } from './runtime';

const binDir=process.argv[2];
const source=await retainCodexRuntime({seed:binDir==='--retained'?undefined:binDir});
const codex=join(source,'codex'),host=join(source,'codex-code-mode-host');
const tag=process.argv[3]||WORKER_IMAGE;
const directory=await mkdtemp(join(tmpdir(),'hackerika-codex-build-'));
// systemd deliberately mounts /root read-only. Buildx writes activity and
// builder metadata under DOCKER_CONFIG even when no registry login is needed.
// Keep that state outside both /root and the Docker build context.
const dockerConfig=await mkdtemp(join(tmpdir(),'hackerika-codex-docker-'));
try{
  await Promise.all([
    copyFile(join(import.meta.dir,'Dockerfile'),join(directory,'Dockerfile')),
    copyFile(join(import.meta.dir,'worker.py'),join(directory,'worker.py')),
    cp(join(import.meta.dir,'skills','irai'),join(directory,'skills'),{recursive:true}),
    copyFile(codex,join(directory,'codex')),
    copyFile(host,join(directory,'codex-code-mode-host')),
  ]);
  await Promise.all([chmod(join(directory,'worker.py'),0o600),chmod(join(directory,'codex'),0o700),chmod(join(directory,'codex-code-mode-host'),0o700)]);
  const build=Bun.spawn(['docker','build','--pull=false','-t',tag,directory],{
    stdin:'ignore',stdout:'inherit',stderr:'inherit',env:{...process.env,DOCKER_CONFIG:dockerConfig}});
  const stop=()=>build.kill('SIGTERM');
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
  let code:number;
  try{code=await build.exited;}finally{process.off('SIGTERM',stop);process.off('SIGINT',stop);}
  if(code!==0)throw Error('worker_image_build_failed');
  console.log(`[CodexWorker] built ${tag} from codex-cli ${CODEX_RELEASE.version}`);
}finally{await Promise.all([rm(directory,{recursive:true,force:true}),rm(dockerConfig,{recursive:true,force:true})]);}
