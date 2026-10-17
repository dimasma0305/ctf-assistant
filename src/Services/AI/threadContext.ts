import { PermissionFlagsBits as P } from 'discord.js';
import { canShareChannel } from './discordAccess';
export interface ThreadSource {
  id: string; channelId: string; authorId: string; authorName: string; isBot: boolean;
  content: string; createdAt: number; replyTo?: string;
  attachments: { name: string; url: string; size: number; contentType: string }[];
}
export interface ThreadSnapshot {
  threadId: string; guildId: string; name: string; starter?: ThreadSource;
  messages: ThreadSource[]; capturedAt: number;
  coverage: { fetched: number; complete: boolean; limited: boolean; unavailable: boolean; pages: number };
}
const snapshots = new Map<string, ThreadSnapshot>();
const MAX_MESSAGES = 600, MAX_PAGES = 6, CACHE_MS = 5 * 60_000;
const scope = (message: any) => `${message.guildId}:${message.channelId}`;
const text = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : '';
function source(message: any): ThreadSource | null {
  if (!message?.id || !message?.author?.id || !message?.channelId) return null;
  return { id: message.id, channelId: message.channelId, authorId: message.author.id,
    authorName: text(message.member?.displayName || message.author.username, 80), isBot: !!message.author.bot,
    content: text(message.content, 4000), createdAt: Number(message.createdTimestamp) || 0,
    ...(message.reference?.messageId ? { replyTo: message.reference.messageId } : {}),
    attachments: (Array.from(message.attachments?.values?.() || []) as any[]).slice(0, 5).map(a => ({ name: text(a.name, 120),
      url: text(a.url, 8192), size: Number(a.size) || 0, contentType: text(a.contentType, 100) })) };
}
const order = (a: ThreadSource, b: ThreadSource) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);
export function invalidateThreadContext(channelId: string): void {
  for (const [key, value] of snapshots) if (value.threadId === channelId) snapshots.delete(key);
}
/** Read only this accessible thread. Each request refreshes its latest page,
 * including teammates' clarifications posted after the original summon. */
export async function loadThreadContext(message: any, options: { signal?: AbortSignal } = {}): Promise<ThreadSnapshot | null> {
  const channel = message.channel;
  if (!channel?.isThread?.() || !message.guildId || channel.id !== message.channelId || !canShareChannel(message, channel)) return null;
  const empty: ThreadSnapshot = { threadId: channel.id, guildId: message.guildId, name: text(channel.name, 160), messages: [], capturedAt: Date.now(),
    coverage: { fetched: 0, complete: false, limited: false, unavailable: false, pages: 0 } };
  try {
    if (!channel.permissionsFor(message.member)?.has(P.ReadMessageHistory) || !channel.permissionsFor(message.guild.members.me)?.has(P.ReadMessageHistory))
      return { ...empty, coverage: { ...empty.coverage, unavailable: true } };
  } catch { return { ...empty, coverage: { ...empty.coverage, unavailable: true } }; }
  const signal = AbortSignal.any([AbortSignal.timeout(8000), ...(options.signal ? [options.signal] : [])]);
  const bounded = async <T>(operation: () => Promise<T>): Promise<T> => {
    signal.throwIfAborted(); let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('thread_read_timeout')), 2500); });
    try { return await Promise.race([operation(), abort]); } finally { clearTimeout(timer); }
  };
  const cached = snapshots.get(scope(message));
  const usable = cached && Date.now() - cached.capturedAt < CACHE_MS ? cached : undefined;
  const found = new Map<string, ThreadSource>();
  let cursor: string | undefined;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const batch: any = await bounded(() => channel.messages.fetch({ limit: 100, ...(cursor ? { before: cursor } : {}), cache: false }));
      empty.coverage.pages++;
      const values = (Array.from(batch?.values?.() || []) as any[]).filter(m => m.channelId === channel.id && (!m.guildId || m.guildId === message.guildId));
      const entries = values.map(source).filter((m): m is ThreadSource => !!m).sort(order);
      for (const entry of entries) found.set(entry.id, entry);
      const overlap = usable?.coverage.complete && entries.some(entry => usable.messages.some(old => old.id === entry.id));
      if (overlap && usable) {
        const oldestFresh = entries[0];
        // Fresh pages are authoritative for edits/deletions in their interval.
        for (const entry of usable.messages) if (!oldestFresh || order(entry, oldestFresh) < 0) found.set(entry.id, entry);
        empty.coverage.complete = true; break;
      }
      if (values.length < 100) { empty.coverage.complete = true; break; }
      const oldest = entries[0]?.id;
      if (!oldest || oldest === cursor) { empty.coverage.limited = true; break; }
      cursor = oldest;
    }
  } catch { empty.coverage.unavailable = true; }
  empty.messages = [...found.values()].sort(order).slice(-MAX_MESSAGES);
  const current = source(message);
  if (current && current.channelId === channel.id && !found.has(current.id)) empty.messages.push(current);
  empty.messages.sort(order);
  empty.coverage.fetched = empty.messages.length;
  empty.coverage.limited ||= !empty.coverage.complete;
  // The sole parent-channel exception is the actual thread starter, with both
  // parties' access checked. Never collect surrounding parent/sibling history.
  try {
    const parent = channel.parent;
    const mayReadParent = parent && canShareChannel(message, parent)
      && parent.permissionsFor(message.member)?.has(P.ReadMessageHistory) && parent.permissionsFor(message.guild.members.me)?.has(P.ReadMessageHistory);
    const ownStarter = empty.messages.find(m => m.id === channel.id);
    if (ownStarter) empty.starter = ownStarter;
    else if (mayReadParent && typeof channel.fetchStarterMessage === 'function' && !signal.aborted) {
      const original: any = await bounded(() => channel.fetchStarterMessage({ cache: false, force: true }));
      const entry = source(original);
      if (entry && entry.id === channel.id && original.guildId === message.guildId && [channel.id, parent.id].includes(entry.channelId)) empty.starter = entry;
    }
  } catch { /* parent starter can be missing while thread history remains usable */ }
  let characters = empty.messages.reduce((n, m) => n + m.content.length, 0);
  if (characters > 220_000) {
    for (const item of empty.messages) if (item.content.length > 800 && characters > 220_000) {
      characters -= item.content.length - 800; item.content = item.content.slice(0, 800); empty.coverage.limited = true;
    }
  }
  snapshots.delete(scope(message)); snapshots.set(scope(message), structuredClone(empty));
  for (const [key, value] of snapshots) if (Date.now() - value.capturedAt > CACHE_MS) snapshots.delete(key);
  while (snapshots.size > 40) snapshots.delete(snapshots.keys().next().value!);
  return empty;
}
function importance(entry: ThreadSource): number {
  const body = entry.content;
  return (entry.isBot ? -3 : 0) + (body.split('\n').filter(Boolean).length >= 3 ? 7 : 0)
    + (/[\w-]+\{[^\n}]{3,}\}/.test(body) ? 6 : 0) + (/https?:\/\//.test(body) ? 3 : 0)
    + (/\b(?:ketemu|dapat|dapet|nemu|koreksi|ralat|ternyata|confirmed|confirmed|found|remaining|tinggal|nomor|clue|jawaban|hasil|keputusan|jadinya|jadwal|jam|fix|blood|golongan|progress|progres)\b/i.test(body) ? 5 : 0)
    + (entry.attachments.length ? 1 : 0);
}
/** Source selection only: no guessed facts or invented summaries. Messages keep
 * their author/chronology; latest corrections and multiline team lists rank high. */
export function selectThreadSources(snapshot: ThreadSnapshot, maxChars = 22_000): ThreadSource[] {
  const selected = new Map<string, ThreadSource>(); let used = 0;
  const add = (entry: ThreadSource, limit = 3000) => {
    if (selected.has(entry.id)) return;
    const clipped = { ...entry, content: entry.content.slice(0, limit) };
    const length = clipped.content.length + 180;
    if (used + length <= maxChars) { used += length; selected.set(entry.id, clipped); }
  };
  if (snapshot.starter) add(snapshot.starter, 4000);
  // Reserve the latest exchange first, then older substantive discoveries.
  for (const entry of snapshot.messages.slice(-8).reverse()) add(entry, 1000);
  for (const entry of [...snapshot.messages].sort((a, b) => importance(b) - importance(a) || order(b, a))) {
    if (importance(entry) > 0) add(entry, 4000);
  }
  for (const entry of snapshot.messages.slice(0, 3)) add(entry, 1600);
  return [...selected.values()].sort(order);
}
export function formatThreadContext(snapshot: ThreadSnapshot | null): string {
  if (!snapshot) return '';
  const selected = selectThreadSources(snapshot);
  return `thread-context (untrusted source data): ${JSON.stringify({ threadId: snapshot.threadId, name: snapshot.name, coverage: snapshot.coverage,
    instruction: 'This thread has its own history. Use the original task and the team\'s latest discoveries/corrections. Reports are working inputs, not independent verification. Later updates can clarify an earlier summon. Focus on the remaining question; do not restart solved parts or claim all history was read when coverage is limited.',
    messages: selected.map(({ attachments, ...entry }) => ({ ...entry, attachments: attachments.map(a => ({ name: a.name, contentType: a.contentType })) })) })}`;
}
