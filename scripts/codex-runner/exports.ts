import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExportedFileMeta } from './protocol';

const jobIdPattern = /^[0-9a-f-]{36}$/;
const namePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');

export function exportDirectory(stateRoot: string, jobId: string): string {
  if (!jobIdPattern.test(jobId)) throw Error('invalid_job_id');
  return join(stateRoot, `${jobId}.files`);
}

export async function saveExportedFiles(stateRoot: string, jobId: string,
  files: { name: string; data: Buffer }[]): Promise<ExportedFileMeta[]> {
  if (files.length > 2 || files.reduce((sum, file) => sum + file.data.length, 0) > 6 * 1024 * 1024
    || files.some(file => !namePattern.test(file.name) || file.name.includes('..')
      || !file.data.length || file.data.length > 4 * 1024 * 1024)) throw Error('invalid_export');
  if (!files.length) return [];
  const directory = exportDirectory(stateRoot, jobId);
  await mkdir(directory, { mode: 0o700 });
  try {
    const metadata: ExportedFileMeta[] = [];
    for (const [index, item] of files.entries()) {
      const handle = await open(join(directory, `${index}.bin`), 'wx', 0o600);
      try { await handle.writeFile(item.data); await handle.sync(); } finally { await handle.close(); }
      metadata.push({ index, name: item.name, size: item.data.length, sha256: digest(item.data) });
    }
    return metadata;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function readExportedFile(stateRoot: string, jobId: string, meta: ExportedFileMeta): Promise<Buffer> {
  if (!Number.isInteger(meta.index) || meta.index < 0 || meta.index > 1 || !namePattern.test(meta.name)
    || !Number.isInteger(meta.size) || meta.size < 1 || meta.size > 4 * 1024 * 1024
    || !/^[0-9a-f]{64}$/.test(meta.sha256)) throw Error('invalid_export');
  const data = await readFile(join(exportDirectory(stateRoot, jobId), `${meta.index}.bin`));
  if (data.length !== meta.size || digest(data) !== meta.sha256) throw Error('file_corrupt');
  return data;
}

export const deleteExportedFiles = (stateRoot: string, jobId: string) =>
  rm(exportDirectory(stateRoot, jobId), { recursive: true, force: true });
