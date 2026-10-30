import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retainCodexRuntime } from './runtime';

async function fixture(run: (f: { root: string; seed: string; options: Parameters<typeof retainCodexRuntime>[0] }) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'codex-retention-test-'));
  const seed = join(root, 'app', 'test-linux', 'bin');
  const cacheRoot = join(root, 'service', 'runtime');
  const files = { codex: '#!/bin/sh\nprintf "codex-cli test\\n"\n', 'codex-code-mode-host': 'paired-code-mode-host' };
  try {
    await mkdir(seed, { recursive: true });
    for (const [name, text] of Object.entries(files)) {
      await writeFile(join(seed, name), text); await chmod(join(seed, name), 0o700);
    }
    // An unrelated host file must never be copied into the retained runtime.
    await writeFile(join(seed, 'auth.json'), 'not-a-worker-file');
    const release = { version: 'test', platform: 'linux', hashes: {
      codex: createHash('sha256').update(files.codex).digest('hex'),
      'codex-code-mode-host': createHash('sha256').update(files['codex-code-mode-host']).digest('hex'),
    } };
    await run({ root, seed, options: { cacheRoot, releasesRoot: join(root, 'app'), release } });
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('retained runtime survives desktop release cleanup and includes only pinned executables', async () => fixture(async ({ root, options }) => {
  const directory = await retainCodexRuntime(options);
  expect((await readdir(directory)).sort()).toEqual(['codex', 'codex-code-mode-host']);
  await rm(join(root, 'app'), { recursive: true });
  expect(await retainCodexRuntime(options)).toBe(directory);
}));

test('corrupt retained binary is repaired only from matching pinned bytes', async () => fixture(async ({ options }) => {
  const directory = await retainCodexRuntime(options);
  await writeFile(join(directory, 'codex-code-mode-host'), 'broken');
  expect(await retainCodexRuntime(options)).toBe(directory);
  expect(await readFile(join(directory, 'codex-code-mode-host'), 'utf8')).toBe('paired-code-mode-host');
}));

test('missing companion fails preparation without publishing a partial cache', async () => fixture(async ({ seed, options }) => {
  await rm(join(seed, 'codex-code-mode-host'));
  await expect(retainCodexRuntime(options)).rejects.toThrow('codex_runtime_unavailable');
  expect(await readdir(options!.cacheRoot!)).toEqual([]);
}));

test('wrong explicit seed cannot replace the working runtime', async () => fixture(async ({ seed, options }) => {
  const directory = await retainCodexRuntime(options);
  await writeFile(join(seed, 'codex-code-mode-host'), 'different-release');
  await expect(retainCodexRuntime({ ...options, seed })).rejects.toThrow('codex_runtime_pin_mismatch');
  expect(await retainCodexRuntime(options)).toBe(directory);
  expect(await readFile(join(directory, 'codex-code-mode-host'), 'utf8')).toBe('paired-code-mode-host');
}));

test('a hash-matching executable that reports another version is rejected', async () => fixture(async ({ options }) => {
  await expect(retainCodexRuntime({ ...options, seed: join(options!.releasesRoot!, 'test-linux', 'bin'),
    release: { ...options!.release!, version: 'different' } })).rejects.toThrow('codex_runtime_pin_mismatch');
}));
