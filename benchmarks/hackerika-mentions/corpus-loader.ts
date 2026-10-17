import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CASES, VALIDATION_CASES } from './corpus';

/** Reuse the same handler/transport harness for a separately frozen case set. */
export async function loadCorpus(): Promise<{ CASES: typeof CASES; VALIDATION_CASES: typeof CASES; judgePrompt?: string; source: string }> {
  const index = process.argv.indexOf('--corpus');
  if (index < 0) return { CASES, VALIDATION_CASES, source: 'default' };
  const filename = process.argv[index + 1];
  if (!filename || filename.startsWith('--')) throw Error('--corpus needs a local TypeScript module');
  const source = resolve(filename);
  const corpus = await import(pathToFileURL(source).href);
  if (!Array.isArray(corpus.CASES) || !Array.isArray(corpus.VALIDATION_CASES)) throw Error('Corpus needs CASES and VALIDATION_CASES');
  return { CASES: corpus.CASES, VALIDATION_CASES: corpus.VALIDATION_CASES,
    judgePrompt: typeof corpus.JUDGE_PROMPT === 'string' ? corpus.JUDGE_PROMPT : undefined, source };
}
