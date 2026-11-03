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
      ? 'Aku belum bisa mulai karena ada gangguan koneksi.'
      : hasInlineResearch
        ? 'Agen riset sedang tidak tersedia; berikut hasil penelusuran web sementara.'
        : 'Agen riset sedang tidak tersedia, jadi tugasnya belum mulai.';
    return hasInlineResearch && modelReply.trim() ? `${status}\n\n${modelReply}` : status;
  }
  if (result?.ok !== true || !['queued', 'busy'].includes(result.status)) return modelReply;
  // IDs stay in tool receipts for status/resume; acknowledgements are ordinary
  // chat, not an execution log. Replace drafts that may also repeat those IDs.
  return result.status === 'busy'
    ? 'Masih ada yang kukerjakan di sini; hasilnya menyusul.'
    : 'Aku kerjakan dulu. Hasilnya nanti kukirim di sini.';
}
