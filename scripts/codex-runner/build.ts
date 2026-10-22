import { chmod, copyFile, cp, mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const binDir=process.argv[2];
if(!binDir)throw Error('usage: bun scripts/codex-runner/build.ts /absolute/path/to/codex/bin [image-tag]');
const source=await realpath(binDir),codex=join(source,'codex'),host=join(source,'codex-code-mode-host');
const versionProcess=Bun.spawn([codex,'--version'],{stdout:'pipe',stderr:'pipe'});
const version=(await new Response(versionProcess.stdout).text()).trim();
if(await versionProcess.exited!==0||!/^codex-cli 0\.163\.0\b/.test(version))throw Error(`unsupported_codex_version:${version}`);
const tag=process.argv[3]||'hackerika-codex-worker:0.163.0-9';
const directory=await mkdtemp(join(tmpdir(),'hackerika-codex-build-'));
try{
  await Promise.all([
    copyFile(join(import.meta.dir,'Dockerfile'),join(directory,'Dockerfile')),
    copyFile(join(import.meta.dir,'worker.py'),join(directory,'worker.py')),
    cp(join(import.meta.dir,'skills','irai'),join(directory,'skills'),{recursive:true}),
    copyFile(codex,join(directory,'codex')),
    copyFile(host,join(directory,'codex-code-mode-host')),
  ]);
  await Promise.all([chmod(join(directory,'worker.py'),0o600),chmod(join(directory,'codex'),0o700),chmod(join(directory,'codex-code-mode-host'),0o700)]);
  const build=Bun.spawn(['docker','build','--pull=false','-t',tag,directory],{stdin:'ignore',stdout:'inherit',stderr:'inherit'});
  if(await build.exited!==0)throw Error('worker_image_build_failed');
  console.log(`[CodexWorker] built ${tag} from ${version}`);
}finally{await rm(directory,{recursive:true,force:true});}
