import mongoose from 'mongoose';
import { CTFCaseModel } from '../../Database/connect';
export interface CTFCaseNotes {
  title: string; summary: string; unresolved: string[];
  findings: { claim: string; evidence: { sourceId: string; quote: string }[] }[];
  sources: { id: string; url: string; title: string; kind: string; content: string }[];
  attempts: { type: string; target: string; outcome: string }[];
  candidates: { flag: string; basis: string }[];
  calculations?: { id: string; purpose: string; result: import('./ctfCompute').ComputeResult }[];
  updatedAt: number;
}
const TTL = 24 * 60 * 60_000, MAX_CACHE = 100;
const cache = new Map<string, CTFCaseNotes>();
export const ctfScope = (turn: { guildId?: string | null; channelId?: string }) =>
  turn.channelId ? `${turn.guildId || 'dm'}:${turn.channelId}` : '';
const fresh = (notes?: CTFCaseNotes | null) => !!notes && Date.now() - notes.updatedAt < TTL;
export async function loadCTFCase(scope: string): Promise<CTFCaseNotes | null> {
  if (!scope) return null;
  const cached = cache.get(scope); if (fresh(cached)) return structuredClone(cached!);
  cache.delete(scope);
  if (process.env.NODB === 'true' || mongoose.connection.readyState !== 1) return null;
  try {
    const entry = await CTFCaseModel.findOne({ scope, expiresAt: { $gt: new Date() } }).maxTimeMS(1500).lean();
    if (fresh(entry?.notes as CTFCaseNotes)) { remember(scope, entry!.notes as CTFCaseNotes); return structuredClone(entry!.notes) as CTFCaseNotes; }
  } catch { /* investigation can continue without a database checkpoint */ }
  return null;
}
function remember(scope: string, notes: CTFCaseNotes) {
  for (const [key, value] of cache) if (!fresh(value)) cache.delete(key);
  cache.delete(scope); cache.set(scope, structuredClone(notes));
  while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
}
export async function saveCTFCase(scope: string, notes: CTFCaseNotes): Promise<boolean> {
  if (!scope) return false;
  remember(scope, notes);
  if (process.env.NODB === 'true' || mongoose.connection.readyState !== 1) return false;
  try {
    await CTFCaseModel.updateOne({ scope }, { $set: { notes, expiresAt: new Date(notes.updatedAt + TTL) } }, { upsert: true }).maxTimeMS(1500);
    return true;
  } catch { return false; }
}
