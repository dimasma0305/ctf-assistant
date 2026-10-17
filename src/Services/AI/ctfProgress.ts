import type { ThreadSource } from './threadContext';
export interface TeamEvidence { messageId: string; authorId: string; quote: string }
export interface TeamProgress {
  entries: { item: string; value: string; state: 'reported' | 'disputed' | 'open'; evidence: TeamEvidence[] }[];
  focus?: { question: string; evidence: TeamEvidence[] };
}
const normal = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
const key = (item: string) => item.match(/^\s*#?(\d{1,2})\b/)?.[1] || normal(item);
const containsValue = (quote: string, value: string) => {
  const normalized = normal(value);
  if (/^[\p{L}\p{N}]{1,3}$/u.test(normalized)) {
    return new RegExp(`(?<![\\p{L}\\p{N}_])${normalized}(?![\\p{L}\\p{N}_])`, 'u').test(normal(quote));
  }
  return normal(quote).includes(normalized);
};
/** Teammate reports retain provenance without being upgraded to independently
 * verified web facts. A report/quote cannot be invented or attributed to a bot. */
export function mergeTeamProgress(previous: TeamProgress | undefined, proposed: any, originals: ThreadSource[]): TeamProgress {
  const byId = new Map(originals.filter(source => !source.isBot).map(source => [source.id, source]));
  const evidence = (value: any): TeamEvidence[] => Array.isArray(value) ? value.slice(0, 4).flatMap(reference => {
    const source = byId.get(reference?.messageId);
    const quote = typeof reference?.quote === 'string' ? reference.quote.trim() : '';
    if (!source || !quote || quote.length > 500 || !normal(source.content).includes(normal(quote))) return [];
    if (quote.length < 3 && !source.content.split('\n').some(line => normal(line) === normal(quote))) return [];
    return [{ messageId: source.id, authorId: source.authorId, quote }];
  }) : [];
  const validate = (value: any) => {
    if (typeof value?.item !== 'string' || typeof value?.value !== 'string' || !value.item.trim() || !value.value.trim()) return null;
    const refs = evidence(value.evidence).filter(ref => containsValue(ref.quote, value.value));
    if (!refs.length) return null;
    return { item: value.item.trim().slice(0, 120), value: value.value.trim().slice(0, 500),
      state: (['disputed', 'open'].includes(value.state) ? value.state : 'reported') as 'reported' | 'disputed' | 'open', evidence: refs };
  };
  const entries = new Map<string, NonNullable<ReturnType<typeof validate>>>();
  const latest = (entry: NonNullable<ReturnType<typeof validate>>) => Math.max(...entry.evidence.map(ref => byId.get(ref.messageId)?.createdAt || 0));
  for (const value of [...(previous?.entries || []), ...(Array.isArray(proposed?.entries) ? proposed.entries.slice(0, 20) : [])]) {
    const valid = validate(value); if (!valid) continue;
    const old = entries.get(key(valid.item));
    if (!old || latest(valid) >= latest(old)) entries.set(key(valid.item), valid);
  }
  const result: TeamProgress = { entries: [...entries.values()].slice(0, 20) };
  for (const value of [previous?.focus, proposed?.focus]) {
    const refs = evidence(value?.evidence);
    if (typeof value?.question === 'string' && value.question.trim() && refs.length)
      result.focus = { question: value.question.trim().slice(0, 500), evidence: refs };
  }
  return result;
}
export function formatTeamProgress(progress?: TeamProgress): string {
  return progress?.entries.length || progress?.focus ? `ctf-team-progress (reported working inputs; not remote checker or web verification): ${JSON.stringify(progress)}` : '';
}
