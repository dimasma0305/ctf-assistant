import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

// Upgrade deliberately, together with a real worker/gateway smoke. Never follow
// the desktop app's `current` symlink: it also removes older release folders.
export const CODEX_RELEASE = {
  version: '0.166.0',
  platform: 'x86_64-unknown-linux-musl',
  hashes: {
    codex: 'b8a11fedf24b2dfb59a70c9e52b030f9a508dcd49cd2dd0d41956f4c785156b8',
    'codex-code-mode-host': '657f4e902726e05867c937b583049d5997e057f8cd0ab40450633c9c9ef8d630',
  },
};
export const WORKER_IMAGE = 'hackerika-codex-worker:0.166.0-1';

async function valid(directory: string, release: typeof CODEX_RELEASE): Promise<boolean> {
  try {
    for (const [name, expected] of Object.entries(release.hashes)) {
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(join(directory, name))) hash.update(chunk);
      if (hash.digest('hex') !== expected) return false;
    }
    const child = Bun.spawn([join(directory, 'codex'), '--version'], { stdout: 'pipe', stderr: 'ignore' });
    const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
    try {
      const output = (await new Response(child.stdout).text()).trim();
      return await child.exited === 0 && output === `codex-cli ${release.version}`;
    } finally { clearTimeout(timer); }
  } catch { return false; }
}

/** Retain only the two pinned executables, never app configuration or auth. */
export async function retainCodexRuntime(options: {
  seed?: string; cacheRoot?: string; releasesRoot?: string; release?: typeof CODEX_RELEASE;
} = {}): Promise<string> {
  const release = options.release || CODEX_RELEASE;
  const cacheRoot = options.cacheRoot || '/var/lib/hackerika-codex/runtime';
  const key = `${release.version}-${release.platform}`;
  const retained = join(cacheRoot, key);
  if (!options.seed && await valid(retained, release)) return retained;
  const seed = options.seed || join(options.releasesRoot || '/root/.codex/packages/standalone/releases', key, 'bin');
  await mkdir(cacheRoot, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(cacheRoot, '.prepare-'));
  try {
    // Validate the copied bytes, so an app update during copying cannot publish
    // a mismatched executable pair. Publish only after both hashes and version pass.
    await Promise.all(Object.keys(release.hashes).map(async name => {
      await copyFile(join(seed, name), join(staging, name));
      await chmod(join(staging, name), 0o700);
    }));
    if (!await valid(staging, release)) throw Error('codex_runtime_pin_mismatch');
    await rm(retained, { recursive: true, force: true });
    await rename(staging, retained);
    return retained;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw Error(`codex_runtime_unavailable: seed ${key} with build.ts before removing the installed release`);
    throw error;
  } finally { await rm(staging, { recursive: true, force: true }); }
}
