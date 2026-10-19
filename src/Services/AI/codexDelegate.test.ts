import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { delegateCodexForTurn, hasCodexDelegation } from './codexDelegate';

test('manager-selected investigation queues a scoped job once with current conversation evidence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hackerika-delegation-test-'));
    const socket = join(directory, 'control.sock');
    const previousEnabled = process.env.CODEX_SOLVER_ENABLED, previousSocket = process.env.CODEX_CONTROL_SOCKET;
    process.env.CODEX_SOLVER_ENABLED = '1'; process.env.CODEX_CONTROL_SOCKET = socket;
    let submitted: any;
    const server = Bun.serve({ unix: socket, async fetch(request) {
        submitted = await request.json();
        return Response.json({ ok: true, job: { id: '00000000-0000-0000-0000-000000000001', kind: 'investigation',
            state: 'pending', guildId: submitted.guildId, channelId: submitted.channelId,
            messageId: submitted.messageId, userId: submitted.userId } });
    } });
    const message: any = { id: '800000000000000001', guildId: '555555555555555555', channelId: '700000000000000001',
        content: 'bandingkan dua source file ini', author: { id: '663394727688798231', bot: false },
        attachments: new Map(), channel: { isThread: () => false, messages: { fetch: async () => new Map() } } };
    try {
        const result = await delegateCodexForTurn({ kind: 'investigation', question: 'bandingkan dua file', solver: 'auto' }, message);
        expect(result.ok).toBe(true);
        expect(result.status).toBe('queued');
        expect(submitted.kind).toBe('investigation');
        expect(submitted.route).toBe('auto');
        expect(submitted.scope).toBe(`${message.guildId}:${message.channelId}`);
        expect(submitted.context).toContain(message.content);
        expect(submitted.artifacts).toEqual([]);
        expect(hasCodexDelegation(message)).toBe(true);
        expect((await delegateCodexForTurn({ kind: 'investigation', question: 'ulang' }, message)).error).toBe('already_delegated_this_turn');
    } finally {
        server.stop(true);
        if (previousEnabled === undefined) delete process.env.CODEX_SOLVER_ENABLED; else process.env.CODEX_SOLVER_ENABLED = previousEnabled;
        if (previousSocket === undefined) delete process.env.CODEX_CONTROL_SOCKET; else process.env.CODEX_CONTROL_SOCKET = previousSocket;
        await rm(directory, { recursive: true, force: true });
    }
});
