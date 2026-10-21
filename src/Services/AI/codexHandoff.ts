/** A queued worker is an in-progress action. The manager's immediate chat
 * completion cannot turn that accepted action into a final refusal or claim. */
export function groundCodexHandoff(modelReply: string, toolResult: string | undefined): string {
  if (!toolResult) return modelReply;
  let result: any;
  try { result = JSON.parse(toolResult); } catch { return modelReply; }
  if (result?.ok !== true || !['queued', 'busy'].includes(result.status)) return modelReply;
  const ids = [result.job?.id, ...(Array.isArray(result.jobs) ? result.jobs.map((job: any) => job?.id) : [])]
    .filter((id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))
    .map(id => id.slice(0, 8)).slice(0, 3);
  const marker = ids.length ? ' job: ' + ids.map(id => '`' + id + '`').join(', ') : '';
  return result.status === 'busy'
    ? 'Masih ada job yang jalan di channel ini; hasilnya menyusul.' + marker
    : 'Oke, aku mulai kerjakan di lab terisolasi. Hasilnya menyusul di sini.' + marker;
}
