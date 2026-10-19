import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Collection } from 'discord.js';
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

test('explicit deep search mention grounds the tagged member even when manager omits targetUserId', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hackerika-profile-delegation-test-'));
    const socket = join(directory, 'control.sock');
    const previousEnabled = process.env.CODEX_SOLVER_ENABLED, previousSocket = process.env.CODEX_CONTROL_SOCKET;
    process.env.CODEX_SOLVER_ENABLED = '1'; process.env.CODEX_CONTROL_SOCKET = socket;
    let submitted: { question: string; context: string } | undefined;
    const server = Bun.serve({ unix: socket, async fetch(request) {
        submitted = await request.json() as { question: string; context: string };
        return Response.json({ ok: true, job: { id: '00000000-0000-0000-0000-000000000002', state: 'pending' } });
    } });
    const botId = '1077393568647352320', targetId = '450152595189923860';
    const user = { id: targetId, username: 'keii', globalName: 'keii', bot: false,
        createdAt: new Date('2021-01-01T00:00:00Z'), avatarURL: () => null, bannerURL: () => null,
        flags: { toArray: () => [] } };
    const member = { id: targetId, user, displayName: 'Keii', nickname: null,
        joinedAt: new Date('2024-01-01T00:00:00Z'), avatarURL: () => null, bannerURL: () => null,
        roles: { cache: new Collection([['555555555555555555', { id: '555555555555555555', name: '@everyone', position: 0 }]]) } };
    const message: any = { id: '800000000000000002', guildId: '555555555555555555', channelId: '700000000000000001',
        content: `<@${botId}> ini, aku mau kamu deep search <@${targetId}>`,
        author: { id: '663394727688798231', bot: false }, client: { user: { id: botId }, users: { fetch: async () => user } },
        guild: { id: '555555555555555555', members: { fetch: async () => member } },
        attachments: new Map(), channel: { isThread: () => false, messages: { fetch: async () => new Map() } } };
    try {
        const result = await delegateCodexForTurn({ kind: 'investigation',
            question: 'Infer the target/topic from chat; ask if ambiguous.' }, message);
        expect(result.ok).toBe(true);
        expect(submitted?.question).toContain('Objek riset adalah satu member Discord yang ditag eksplisit');
        expect(submitted?.context).toContain('verified Discord API profile');
        expect(submitted?.context).toContain(`"id":"${targetId}"`);
    } finally {
        server.stop(true);
        if (previousEnabled === undefined) delete process.env.CODEX_SOLVER_ENABLED; else process.env.CODEX_SOLVER_ENABLED = previousEnabled;
        if (previousSocket === undefined) delete process.env.CODEX_CONTROL_SOCKET; else process.env.CODEX_CONTROL_SOCKET = previousSocket;
        await rm(directory, { recursive: true, force: true });
    }
});
