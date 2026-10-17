import { imageReference, isImageAttachment, allowedDiscordImageUrl, type ImageReference } from './vision';
import { readResponseTextWithLimit } from '../../utils/urlGuard';
/** Collect actual, same-channel teammate artifacts for a requested investigation.
 * No DM/guild traversal, URL mining from user text, archive execution or host FS. */
export async function collectCTFInputs(turn: any, initial: { text: string; images?: ImageReference[] }, signal: AbortSignal) {
  const result = { text: initial.text, images: [...(initial.images || [])] };
  const sources: any[] = [turn];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const messages: any = await Promise.race([turn.channel?.messages?.fetch({ limit: 30, before: turn.id }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('context_timeout')), 3000); })]);
    const recent = messages ? Array.from(messages.values()) as any[] : [];
    const reply = recent.find(m => m.id === turn.reference?.messageId);
    if (reply) sources.push(reply);
    sources.push(...recent.sort((a, b) => b.createdTimestamp - a.createdTimestamp));
  } catch { /* supplied context and attachments remain usable */ }
  finally { clearTimeout(timer); }
  const seen = new Set<string>(); let fileCount = 0, textBytes = 0;
  for (const source of sources) {
    if (signal.aborted || source?.channelId !== turn.channelId || source?.author?.bot || seen.has(source.id)) continue;
    if (source !== turn && Number.isFinite(source.createdTimestamp) && Date.now() - source.createdTimestamp > 2 * 60 * 60_000) continue;
    seen.add(source.id);
    if (source.content) result.text += `\n[challenge channel source ${JSON.stringify({ messageId: source.id, authorId: source.author?.id })}] ${String(source.content).slice(0, 4000)}`;
    for (const attachment of Array.from(source.attachments?.values?.() || []) as any[]) {
      if (isImageAttachment(attachment)) {
        const ref = imageReference(attachment, source);
        if (ref.image && result.images.length < 8 && !result.images.some(i => i.url === ref.image!.url)) result.images.push(ref.image);
        continue;
      }
      if (++fileCount > 3) continue;
      const name = String(attachment.name || '').slice(0, 120);
      if (!/\.(?:txt|py|js|ts|json|csv|md|yaml|yml|c|cpp|h|rs|go|log|hex|sage)$/i.test(name)
        || !Number.isFinite(attachment.size) || attachment.size <= 0 || attachment.size > 65536
        || !allowedDiscordImageUrl(attachment.url)) {
        result.text += `\n[artifact ${JSON.stringify({ name, sourceMessageId: source.id })}: binary/unsupported, oversized or expired; bytes NOT inspected]`;
        continue;
      }
      try {
        const response = await fetch(attachment.url, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
        if (!response.ok) throw Error('attachment_unavailable');
        const text = await readResponseTextWithLimit(response, 65536);
        const bytes = Buffer.byteLength(text); if (textBytes + bytes > 96 * 1024) continue;
        textBytes += bytes;
        result.text += `\n[untrusted artifact ${JSON.stringify({ name, sourceMessageId: source.id, authorId: source.author?.id })}]\n${text}`;
      } catch { result.text += `\n[artifact ${JSON.stringify({ name, sourceMessageId: source.id })}: download unavailable; bytes NOT inspected]`; }
    }
  }
  result.text = result.text.slice(0, 28_000);
  return result;
}
