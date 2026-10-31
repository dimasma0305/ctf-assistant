/** A queued worker is an in-progress action. The manager's immediate chat
 * completion cannot turn that accepted action into a final refusal or claim. */
export function groundCodexHandoff(modelReply: string, toolResult: string | undefined, hasInlineResearch = false): string {
  if (!toolResult) return modelReply;
  let result: any;
  try { result = JSON.parse(toolResult); } catch { return modelReply; }
  if (result?.ok === false && ['worker_preparing', 'worker_image_unavailable', 'isolated_agent_unavailable', 'codex_controller_unavailable'].includes(result.error)) {
    // Run after research grounding: its profile formatter otherwise discards
    // the manager's explanation and makes the fallback look like agent output.
    const status = result.error === 'codex_controller_unavailable'
      ? 'Controller agen sedang pulih otomatis, tetapi job ini belum sempat diterima.'
      : hasInlineResearch
        ? 'Agen riset sedang tidak tersedia; berikut hasil penelusuran web sementara.'
        : 'Agen riset sedang tidak tersedia, jadi tugasnya belum mulai.';
    return hasInlineResearch && modelReply.trim() ? `${status}\n\n${modelReply}` : status;
  }
  if (result?.ok !== true || !['queued', 'busy'].includes(result.status)) return modelReply;
  const ids = [result.job?.id, ...(Array.isArray(result.jobs) ? result.jobs.map((job: any) => job?.id) : [])]
    .filter((id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))
    .map(id => id.slice(0, 8)).slice(0, 3);
  const marker = ids.length ? ' job: ' + ids.map(id => '`' + id + '`').join(', ') : '';
  return result.status === 'busy'
    ? 'Masih ada job yang jalan di channel ini; hasilnya menyusul.' + marker
    : (result.job?.kind === 'investigation' || result.jobs?.length && result.jobs.every((job: any) => job.kind === 'investigation'))
    ? 'Aku kerjakan dulu. Hasilnya nanti kukirim di sini.' + marker
    : 'Oke, aku mulai kerjakan di lab terisolasi. Hasilnya menyusul di sini.' + marker;
}
