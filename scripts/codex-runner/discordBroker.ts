import { randomUUID } from 'node:crypto';
import type { Job } from './protocol';

export interface DiscordReadQuery {
  kind: 'recent' | 'message';
  messageId?: string;
  before?: string;
  limit?: number;
  includeImage?: boolean;
  describeImage?: boolean;
}

export interface DiscordReadRequest extends DiscordReadQuery {
  id: string;
  jobId: string;
  guildId: string;
  channelId: string;
  userId: string;
  sourceMessageId: string;
}

type Pending = { request: DiscordReadRequest; finish: (value: unknown) => void; timer: ReturnType<typeof setTimeout> };
const snowflake = (value: unknown): value is string => typeof value === 'string' && /^\d{17,20}$/.test(value);

/** Ephemeral request/response bridge. Discord credentials and data stay in the bot;
 * the worker can only ask for bounded reads within its original job channel. */
export class DiscordContextBroker {
  private pending = new Map<string, Pending>();
  private counts = new Map<string, number>();

  async ask(job: Job, query: DiscordReadQuery, signal: AbortSignal): Promise<unknown> {
    if (job.state !== 'running' || signal.aborted) return { ok: false, error: 'job_closed' };
    if (query.kind !== 'recent' && query.kind !== 'message') return { ok: false, error: 'invalid_query' };
    if (query.kind === 'message' && !snowflake(query.messageId)) return { ok: false, error: 'invalid_message_id' };
    if (query.before !== undefined && !snowflake(query.before)) return { ok: false, error: 'invalid_before_id' };
    if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 30)) return { ok: false, error: 'invalid_limit' };
    const count = (this.counts.get(job.id) || 0) + 1;
    if (count > 6) return { ok: false, error: 'discord_read_budget' };
    this.counts.set(job.id, count);
    const request: DiscordReadRequest = { id: randomUUID(), jobId: job.id, guildId: job.packet.guildId,
      channelId: job.packet.channelId, userId: job.packet.userId, sourceMessageId: job.packet.messageId,
      kind: query.kind, ...(query.messageId ? { messageId: query.messageId } : {}),
      ...(query.before ? { before: query.before } : {}), limit: query.limit || 20, includeImage: query.includeImage === true,
      describeImage: query.describeImage === true };
    return await new Promise(resolve => {
      let done = false;
      const finish = (value: unknown) => { if (done) return; done = true; clearTimeout(timer); signal.removeEventListener('abort', abort); this.pending.delete(request.id); resolve(value); };
      const abort = () => finish({ ok: false, error: 'job_closed' });
      const timer = setTimeout(() => finish({ ok: false, error: 'discord_read_timeout' }), 35_000);
      signal.addEventListener('abort', abort, { once: true });
      this.pending.set(request.id, { request, finish, timer });
    });
  }

  list(): DiscordReadRequest[] { return [...this.pending.values()].map(item => item.request).slice(0, 8); }

  respond(id: string, jobId: string, result: unknown): boolean {
    const item = this.pending.get(id);
    if (!item || item.request.jobId !== jobId) return false;
    const serialized = JSON.stringify(result);
    if (serialized.length > 8 * 1024 * 1024) item.finish({ ok: false, error: 'discord_response_too_large' });
    else item.finish(result);
    return true;
  }

  clearJob(jobId: string): void {
    for (const item of this.pending.values()) if (item.request.jobId === jobId) item.finish({ ok: false, error: 'job_closed' });
    this.counts.delete(jobId);
  }
}
