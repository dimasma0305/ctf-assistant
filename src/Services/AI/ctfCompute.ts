import { Worker } from 'node:worker_threads';
export interface ComputeResult { ok: boolean; value?: unknown; error?: string; detail?: string; flagSyntax?: { value: string; complete: boolean }[] }
let active = 0;
/** Fresh guest and separate worker per calculation. Hard termination also bounds
 * pathological native builtins which need not poll QuickJS's interrupt hook. */
export async function computeCTF(code: unknown, signal?: AbortSignal, input?: unknown): Promise<ComputeResult> {
  if (typeof code !== 'string' || !code.trim() || code.length > 32_000) return { ok: false, error: 'invalid_compute_code' };
  if (signal?.aborted) return { ok: false, error: 'compute_cancelled' };
  if (active >= 2) return { ok: false, error: 'compute_busy' };
  active++;
  try {
    return await new Promise<ComputeResult>(resolve => {
      const worker = new Worker(new URL('./ctfComputeWorker.ts', import.meta.url), { workerData: { code, input } });
      let settled = false;
      const finish = (result: ComputeResult) => {
        if (settled) return; settled = true; clearTimeout(timer);
        signal?.removeEventListener('abort', abort); void worker.terminate(); resolve(result);
      };
      const abort = () => finish({ ok: false, error: 'compute_cancelled' });
      const timer = setTimeout(() => finish({ ok: false, error: 'compute_deadline' }), 4000);
      worker.once('message', result => finish(result));
      worker.once('error', () => finish({ ok: false, error: 'compute_worker_failed' }));
      worker.once('exit', () => finish({ ok: false, error: 'compute_worker_exit' }));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  } catch { return { ok: false, error: 'compute_worker_failed' }; }
  finally { active--; }
}

/** Successful execution alone does not make malformed flag strings usable.
 * Keep the receipt but make the planner repair parser/format errors. */
export function validateCTFCalculation(result: ComputeResult): ComputeResult {
  if (!result.ok) return result;
  if (result.value && typeof result.value === 'object' && !Array.isArray(result.value) && 'error' in result.value)
    return { ...result, ok: false, error: 'calculation_reported_error' };
  const strings: string[] = [];
  const inspect = (value: unknown, depth = 0) => {
    if (depth > 8 || strings.length >= 256) return;
    if (typeof value === 'string') strings.push(value);
    else if (Array.isArray(value)) value.forEach(item => inspect(item, depth + 1));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key,item]) => { if (!/^(?:input|extracted|ciphertext|source|echo|original|(?:extracted)?prefix|(?:extracted)?suffix)$/i.test(key)) inspect(item, depth + 1); });
  };
  inspect(result.value);
  if (strings.some(value => /^[\w-]{2,40}\{[^\r\n{}]{1,350}$/.test(value))) return { ...result, ok: false,
    error: 'incomplete_flag_delimiter', detail: 'A flag-like calculation output has no closing brace. Check original input parsing, preserve the complete prefix/suffix, and recompute; do not silently repair or publish it as a complete flag.' };
  const flags = computedFlagCandidates(result);
  return flags.length ? { ...result, flagSyntax: flags.map(value => ({ value, complete: true })) } : result;
}
/** Derivations, not copied input echoes; this independently checks delimiters,
 * without trusting a model-written boolean such as validBraces. */
export function computedFlagCandidates(result: ComputeResult): string[] {
  if (!result.ok) return [];
  const flags: string[] = [];
  const visit = (value: unknown, depth = 0) => {
    if (depth > 8 || flags.length >= 16) return;
    if (typeof value === 'string' && /^[\w-]{2,40}\{[^\r\n{}]{1,350}\}$/.test(value)) flags.push(value);
    else if (Array.isArray(value)) value.forEach(item => visit(item, depth + 1));
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value))
      if (!/^(?:input|extracted|ciphertext|source|echo|original|(?:extracted)?prefix|(?:extracted)?suffix)$/i.test(key)) visit(item, depth + 1);
  };
  visit(result.value); return [...new Set(flags)];
}
