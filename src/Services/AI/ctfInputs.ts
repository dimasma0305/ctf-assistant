import { loadThreadContext, selectThreadSources, type ThreadSnapshot, type ThreadSource } from './threadContext';
import { imageReference, isImageAttachment, allowedDiscordImageUrl, type ImageReference } from './vision';
import { readResponseTextWithLimit } from '../../utils/urlGuard';
/** Collect actual, same-channel teammate artifacts for a requested investigation.
 * No DM/guild traversal, URL mining from user text, archive execution or host FS. */
export async function collectCTFInputs(turn: any, initial: { text: string; images?: ImageReference[]; thread?: ThreadSnapshot | null }, signal: AbortSignal) {
  const isThread = !!turn.channel?.isThread?.();
  const thread = isThread ? await loadThreadContext(turn, { signal }) : null;
  // A fresh access denial must not reuse a previously authorized snapshot.
  const snapshot = isThread ? thread : initial.thread;
  if (isThread && (!snapshot || snapshot.coverage.unavailable && !snapshot.messages.length)) {
    return { text: String(turn.content || '').slice(0, 8000), images: [] as ImageReference[], artifacts: [] as {name:string;data:string;image:boolean;sourceMessageId:string}[], originals: [] as ThreadSource[],
      thread: snapshot ? { threadId: snapshot.threadId, name: snapshot.name, coverage: snapshot.coverage } : undefined };
  }
  const selected = snapshot ? selectThreadSources(snapshot, 24_000) : [];
  const originals: ThreadSource[] = snapshot ? [...(snapshot.starter ? [snapshot.starter] : []), ...snapshot.messages] : [];
  const result = { text: initial.text, images: [...(initial.images || [])], artifacts: [] as {name:string;data:string;image:boolean;sourceMessageId:string}[], originals,
    thread: snapshot ? { threadId: snapshot.threadId, name: snapshot.name, coverage: snapshot.coverage } : undefined };
  if (selected.length) result.text = selected.map(source => `[thread source ${JSON.stringify({ messageId: source.id, authorId: source.authorId, authorName: source.authorName, isBot: source.isBot, sentAt: source.createdAt, sourceChannelId: source.channelId })}] ${source.content}`).join('\n')
    + `\n[current request] ${turn.content || ''}\n[thread coverage] ${JSON.stringify(snapshot!.coverage)}`;
  const sources: any[] = [turn];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const messages: any = snapshot ? null : await Promise.race([turn.channel?.messages?.fetch({ limit: 30, before: turn.id }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('context_timeout')), 3000); })]);
    const recent = messages ? Array.from(messages.values()) as any[] : [];
    const reply = recent.find(m => m.id === turn.reference?.messageId);
    if (reply) sources.push(reply);
    sources.push(...recent.sort((a, b) => b.createdTimestamp - a.createdTimestamp));
    // Approved starter/selected sources are scoped to this thread for vision,
    // while originChannelId keeps their true parent-channel provenance.
    sources.push(...selected.map(entry => ({ id: entry.id, channelId: turn.channelId, originChannelId: entry.channelId,
      content: '', createdTimestamp: entry.createdAt, author: { id: entry.authorId, bot: entry.isBot },
      attachments: new Map(entry.attachments.map((attachment, index) => [String(index), attachment])) })));
  } catch { /* supplied context and attachments remain usable */ }
  finally { clearTimeout(timer); }
  const seen = new Set<string>(); let fileCount = 0, textBytes = 0;
  for (const source of sources) {
    if (signal.aborted || source?.channelId !== turn.channelId || source?.author?.bot || seen.has(source.id)) continue;
    if (!snapshot && source !== turn && Number.isFinite(source.createdTimestamp) && Date.now() - source.createdTimestamp > 2 * 60 * 60_000) continue;
    seen.add(source.id);
    if (source.content) result.text += `\n[challenge channel source ${JSON.stringify({ messageId: source.id, authorId: source.author?.id })}] ${String(source.content).slice(0, 4000)}`;
    for (const attachment of Array.from(source.attachments?.values?.() || []) as any[]) {
      if (isImageAttachment(attachment)) {
        const ref = imageReference(attachment, source);
        if (ref.image && result.images.length < 8 && !result.images.some(i => i.url === ref.image!.url)) result.images.push({ ...ref.image, ...(source.originChannelId ? { sourceChannelId: source.originChannelId } : {}) });
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
  if (!snapshot) for (const item of sources) {
    if (!item.author?.id || item?.channelId !== turn.channelId || item.author?.bot || (!item.content && !item.attachments?.size) || originals.some(entry => entry.id === item.id)) continue;
    originals.push({ id: item.id, channelId: item.channelId, authorId: item.author.id, authorName: item.member?.displayName || item.author.username || '',
      isBot: false, content: String(item.content).slice(0, 4000), createdAt: item.createdTimestamp || 0,
      attachments: (Array.from(item.attachments?.values?.() || []) as any[]).slice(0,8).map(attachment=>({name:String(attachment.name||'').slice(0,120),
        url:String(attachment.url||'').slice(0,8192),size:Number(attachment.size)||0,contentType:String(attachment.contentType||'').slice(0,100)})) });
  }
  result.text = result.text.slice(0, 28_000);
  return result;
}

export function imageMagic(bytes: Buffer): boolean {
  return bytes.length >= 12 && (bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
    || bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff || bytes.subarray(0,6).toString('ascii').match(/^GIF8[79]a$/)!==null
    || bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP');
}

export async function responseBytes(response: Response, limit: number): Promise<Buffer> {
  const length=response.headers.get('content-length');
  if(length&&/^\d+$/.test(length)&&Number(length)>limit){await response.body?.cancel().catch(()=>undefined);throw Error('artifact_too_large');}
  if(!response.body)return Buffer.alloc(0);const reader=response.body.getReader();const chunks:Uint8Array[]=[];let total=0;
  try { for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit)throw Error('artifact_too_large');chunks.push(value);} }
  catch(error){await reader.cancel().catch(()=>undefined);throw error;}
  return Buffer.concat(chunks.map(chunk=>Buffer.from(chunk)),total);
}

/** Raw artifact collection is opt-in for the isolated Codex worker. The same
 * channel/thread access checks above apply, and bytes never touch host disk. */
export async function collectCodexArtifacts(sources: ThreadSource[], signal: AbortSignal, currentMessageId?: string) {
  const artifacts:{name:string;data:string;image:boolean;sourceMessageId:string}[]=[];const seen=new Set<string>();let total=0;
  // The current request and newest clues must win the small artifact budget.
  // The thread starter follows so original challenge files remain available.
  const starterId=sources[0]?.id;
  const priority=(source:ThreadSource)=>source.id===currentMessageId?2:source.id===starterId?1:0;
  const ordered=[...sources].sort((a,b)=>priority(b)-priority(a)||Number(b.createdAt)-Number(a.createdAt));
  for(const source of ordered){
    if(source.isBot)continue;
    for(const attachment of source.attachments){
      if(artifacts.length>=8||total>=20*1024*1024)break;
      if(seen.has(attachment.url)||!allowedDiscordImageUrl(attachment.url)||!Number.isFinite(attachment.size)||attachment.size<=0||attachment.size>8*1024*1024)continue;
      seen.add(attachment.url);
      try{
        const response=await fetch(attachment.url,{redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(12_000)])});
        if(!response.ok)throw Error('artifact_unavailable');const bytes=await responseBytes(response,Math.min(8*1024*1024,20*1024*1024-total));
        if(!bytes.length||bytes.length!==attachment.size&&attachment.size>0)throw Error('artifact_size_mismatch');
        total+=bytes.length;artifacts.push({name:String(attachment.name||'artifact').replace(/[\r\n]/g,' ').slice(0,160),data:bytes.toString('base64'),image:imageMagic(bytes),sourceMessageId:source.id});
      }catch{/* unavailable artifacts stay represented in textual context */}
    }
  }
  return artifacts;
}
