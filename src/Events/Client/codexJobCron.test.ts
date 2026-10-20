import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Collection } from 'discord.js';
import { expect, test } from 'bun:test';
import { deliverCodexJobs } from './codexJobCron';

test('a completed Codex ZIP is returned as bytes in a reply to the original channel', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codex-delivery-test-'));
  const socket = join(directory, 'control.sock');
  const oldEnabled = process.env.CODEX_SOLVER_ENABLED, oldSocket = process.env.CODEX_CONTROL_SOCKET;
  process.env.CODEX_SOLVER_ENABLED = 'true'; process.env.CODEX_CONTROL_SOCKET = socket;
  const data = Buffer.from('504b0304aabbcc', 'hex');
  const sha256 = createHash('sha256').update(data).digest('hex');
  const guildId = '555555555555555555', channelId = '700000000000000001';
  const messageId = '800000000000000001', userId = '663394727688798231';
  const job: any = { id: '00000000-0000-0000-0000-000000000001', kind: 'investigation', state: 'completed',
    guildId, channelId, messageId, userId, stats: {}, receiptCount: 0, sources: [],
    result: { summary: 'Sudah kubuat result.zip.', flags: [], findings: [], unresolved: [], needsStrongerModel: false },
    exportedFiles: [{ index: 0, name: 'result.zip', size: data.length, sha256 }] };
  let delivered = false, fileReads = 0, sent: any;
  const server = Bun.serve({ unix: socket, async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/jobs/completed') return Response.json({ ok: true, jobs: delivered ? [] : [job] });
    if (path === '/jobs/file') { fileReads++; return Response.json({ ok: true, name: 'result.zip',
      size: data.length, sha256, data: data.toString('base64') }); }
    if (path === '/jobs/delivered') { delivered = true; return Response.json({ ok: true }); }
    return Response.json({ error: 'unexpected' }, { status: 404 });
  } });
  const me = { id: '1077393568647352320' }, member = { id: userId };
  const guild: any = { id: guildId, members: { me }, roles: { cache: new Collection() } };
  const original: any = { id: messageId, channelId, guild, member, author: { id: userId },
    reply: async (args: any) => { sent = args; return { id: '800000000000000002' }; } };
  const channel: any = { id: channelId, guildId, isThread: () => false, isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }),
    messages: { fetch: async (query: unknown) => typeof query === 'string' ? original : new Collection() } };
  const client: any = { user: me, channels: { fetch: async () => channel } };
  try {
    await deliverCodexJobs(client);
    expect(delivered).toBe(true);
    expect(fileReads).toBe(1);
    expect(sent.content).toContain('result.zip');
    expect(sent.allowedMentions).toEqual({ parse: [], repliedUser: false });
    expect(sent.files).toHaveLength(1);
    expect(sent.files[0].name).toBe('result.zip');
    expect(sent.files[0].attachment).toEqual(data);
  } finally {
    server.stop(true);
    if (oldEnabled === undefined) delete process.env.CODEX_SOLVER_ENABLED; else process.env.CODEX_SOLVER_ENABLED = oldEnabled;
    if (oldSocket === undefined) delete process.env.CODEX_CONTROL_SOCKET; else process.env.CODEX_CONTROL_SOCKET = oldSocket;
    await rm(directory, { recursive: true, force: true });
  }
});
