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
        expect(submitted.question).toContain(`Permintaan asli user: ${JSON.stringify(message.content)}`);
        expect(submitted.question).toContain('Tujuan agen: bandingkan dua file');
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

test('hourly cap is returned with a user-facing retry time instead of an opaque start failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hackerika-hourly-limit-test-'));
    const socket = join(directory, 'control.sock');
    const previousEnabled = process.env.CODEX_SOLVER_ENABLED, previousSocket = process.env.CODEX_CONTROL_SOCKET;
    process.env.CODEX_SOLVER_ENABLED = '1'; process.env.CODEX_CONTROL_SOCKET = socket;
    const server = Bun.serve({ unix: socket, fetch: () => Response.json(
        { ok: false, error: 'user_hourly_limit', limit: 3, retryAfterSeconds: 1800 }, { status: 429 }) });
    const message: any = { id: '800000000000000005', guildId: '555555555555555555', channelId: '700000000000000001',
        content: 'deepsearch daffainfo', author: { id: '663394727688798231', bot: false },
        attachments: new Map(), channel: { isThread: () => false, messages: { fetch: async () => new Map() } } };
    try {
        const result = await delegateCodexForTurn({ kind: 'investigation', question: 'Investigate public work' }, message);
        expect(result).toMatchObject({ ok: false, error: 'user_hourly_limit', limit: 3, retryAfterSeconds: 1800 });
        expect(result.note).toContain('30 menit');
        expect(hasCodexDelegation(message)).toBe(false);
    } finally {
        server.stop(true);
        if (previousEnabled === undefined) delete process.env.CODEX_SOLVER_ENABLED; else process.env.CODEX_SOLVER_ENABLED = previousEnabled;
        if (previousSocket === undefined) delete process.env.CODEX_CONTROL_SOCKET; else process.env.CODEX_CONTROL_SOCKET = previousSocket;
        await rm(directory, { recursive: true, force: true });
    }
});

test('a warming worker does not claim acceptance and leaves research available to the manager',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'hackerika-worker-warming-test-'));
    const socket=join(directory,'control.sock');
    const previousEnabled=process.env.CODEX_SOLVER_ENABLED,previousSocket=process.env.CODEX_CONTROL_SOCKET;
    process.env.CODEX_SOLVER_ENABLED='1';process.env.CODEX_CONTROL_SOCKET=socket;
    const server=Bun.serve({unix:socket,fetch:()=>Response.json({ok:false,error:'worker_preparing',retryAfterSeconds:30},{status:503})});
    const message:any={id:'800000000000000009',guildId:'555555555555555555',channelId:'700000000000000001',
        content:'riset situasi Indonesia dan dunia sekarang',author:{id:'663394727688798231',bot:false},
        attachments:new Map(),channel:{isThread:()=>false,messages:{fetch:async()=>new Map()}}};
    try{
        const result=await delegateCodexForTurn({kind:'investigation',question:'Periksa sumber terkini'},message);
        expect(result).toMatchObject({ok:false,error:'worker_preparing',retryAfterSeconds:30});
        expect(result.note).toContain('research_topic');
        expect(hasCodexDelegation(message)).toBe(false);
    }finally{
        server.stop(true);
        if(previousEnabled===undefined)delete process.env.CODEX_SOLVER_ENABLED;else process.env.CODEX_SOLVER_ENABLED=previousEnabled;
        if(previousSocket===undefined)delete process.env.CODEX_CONTROL_SOCKET;else process.env.CODEX_CONTROL_SOCKET=previousSocket;
        await rm(directory,{recursive:true,force:true});
    }
});

test('explicit image generation carries its mode and reports missing capability before a job starts',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'hackerika-image-mode-test-'));
    const socket=join(directory,'control.sock');
    const previousEnabled=process.env.CODEX_SOLVER_ENABLED,previousSocket=process.env.CODEX_CONTROL_SOCKET;
    process.env.CODEX_SOLVER_ENABLED='1';process.env.CODEX_CONTROL_SOCKET=socket;
    let submitted:any;
    const server=Bun.serve({unix:socket,async fetch(request){submitted=await request.json();
        return Response.json({ok:false,error:'image_generation_unavailable'},{status:503});}});
    const message:any={id:'800000000000000010',guildId:'555555555555555555',channelId:'700000000000000001',
        content:'coba pakai image gen beneran, jangan gambar kode',author:{id:'663394727688798231',bot:false},
        attachments:new Map(),channel:{isThread:()=>false,messages:{fetch:async()=>new Map()}}};
    try{
        const result=await delegateCodexForTurn({kind:'investigation',question:'Buat gambar sungguhan',imageMode:'generative'},message);
        expect(submitted.imageMode).toBe('generative');
        expect(result).toMatchObject({ok:false,error:'image_generation_unavailable'});
        expect(result.note).toContain('jangan janji');
        expect(hasCodexDelegation(message)).toBe(false);
    }finally{
        server.stop(true);
        if(previousEnabled===undefined)delete process.env.CODEX_SOLVER_ENABLED;else process.env.CODEX_SOLVER_ENABLED=previousEnabled;
        if(previousSocket===undefined)delete process.env.CODEX_CONTROL_SOCKET;else process.env.CODEX_CONTROL_SOCKET=previousSocket;
        await rm(directory,{recursive:true,force:true});
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
            question: 'Assess only whether this should be declined; do not search.' }, message);
        expect(result.ok).toBe(true);
        expect(submitted?.question).toContain('Objek riset adalah satu member Discord yang ditag eksplisit');
        expect(submitted?.question).not.toContain('Assess only whether this should be declined');
        expect(submitted?.question).toContain('Telusuri jejak publik/profesional');
        expect(submitted?.context).toContain('verified Discord API profile');
        expect(submitted?.context).toContain(`"id":"${targetId}"`);
    } finally {
        server.stop(true);
        if (previousEnabled === undefined) delete process.env.CODEX_SOLVER_ENABLED; else process.env.CODEX_SOLVER_ENABLED = previousEnabled;
        if (previousSocket === undefined) delete process.env.CODEX_CONTROL_SOCKET; else process.env.CODEX_CONTROL_SOCKET = previousSocket;
        await rm(directory, { recursive: true, force: true });
    }
});

test('two tagged research subjects queue two focused jobs even when manager picks the first ID', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hackerika-multi-profile-test-'));
    const socket = join(directory, 'control.sock');
    const previousEnabled = process.env.CODEX_SOLVER_ENABLED, previousSocket = process.env.CODEX_CONTROL_SOCKET;
    process.env.CODEX_SOLVER_ENABLED = '1'; process.env.CODEX_CONTROL_SOCKET = socket;
    const ids = ['450152595189923860', '583840262460145665'];
    const names = ['keii', 'belugagemink'];
    let path = '', submitted: any;
    const server = Bun.serve({ unix: socket, async fetch(request) {
        path = new URL(request.url).pathname;
        submitted = await request.json();
        return Response.json(path === '/jobs/batch'
            ? { ok: true, jobs: submitted.packets.map((_: unknown, i: number) => ({ id: `00000000-0000-0000-0000-00000000000${i + 1}`, state: 'pending' })) }
            : { ok: true, job: { id: '00000000-0000-0000-0000-000000000003', state: 'pending' } });
    } });
    const botId = '1077393568647352320';
    const users = ids.map((id, i) => ({ id, username: names[i], globalName: names[i], bot: false,
        createdAt: new Date('2021-01-01T00:00:00Z'), avatarURL: () => null, bannerURL: () => null,
        flags: { toArray: () => [] } }));
    const message: any = { id: '800000000000000003', guildId: '555555555555555555', channelId: '700000000000000001',
        content: `<@${botId}> deepsearch <@${ids[0]}> dan juga <@${ids[1]}>`,
        author: { id: '663394727688798231', bot: false }, client: { user: { id: botId }, users: { fetch: async (id: string) => users[ids.indexOf(id)] } },
        guild: { id: '555555555555555555', members: { fetch: async (id: string) => ({ id, user: users[ids.indexOf(id)],
            displayName: names[ids.indexOf(id)], nickname: null, joinedAt: new Date('2024-01-01T00:00:00Z'),
            avatarURL: () => null, bannerURL: () => null,
            roles: { cache: new Collection([['555555555555555555', { id: '555555555555555555', name: '@everyone', position: 0 }]]) } }) } },
        attachments: new Map(), channel: { isThread: () => false, messages: { fetch: async () => new Map() } } };
    try {
        const result = await delegateCodexForTurn({ kind: 'investigation', investigationMode: 'separate', question: 'Research keii only', targetUserId: ids[0] }, message);
        expect(result.ok).toBe(true);
        expect(path).toBe('/jobs/batch');
        expect(submitted.packets).toHaveLength(2);
        expect(submitted.packets.map((p: any) => p.messageId)).toEqual([message.id, message.id]);
        expect(submitted.packets[0].question).toContain('keii');
        expect(submitted.packets[1].question).toContain('belugagemink');
        expect(submitted.packets[1].question).not.toContain('Research keii only');
        const profileContexts = submitted.packets.map((p: any) => p.context.split('[verified Discord API profile for explicitly mentioned member] ')[1]);
        expect(profileContexts[0]).toContain(`"id":"${ids[0]}"`);
        expect(profileContexts[0]).not.toContain(`"id":"${ids[1]}"`);
        expect(profileContexts[1]).toContain(`"id":"${ids[1]}"`);
        const joint = await delegateCodexForTurn({ kind: 'investigation',
            question: 'Investigate the public CTF connection between both members', targetUserId: ids[0] },
            { ...message, id: '800000000000000004' });
        expect(joint.ok).toBe(true);
        expect(joint.investigationMode).toBe('joint');
        expect(path).toBe('/jobs');
        expect(submitted.question).toContain('connection between both members');
        expect(submitted.context).toContain(`"id":"${ids[0]}"`);
        expect(submitted.context).toContain(`"id":"${ids[1]}"`);
    } finally {
        server.stop(true);
        if (previousEnabled === undefined) delete process.env.CODEX_SOLVER_ENABLED; else process.env.CODEX_SOLVER_ENABLED = previousEnabled;
        if (previousSocket === undefined) delete process.env.CODEX_CONTROL_SOCKET; else process.env.CODEX_CONTROL_SOCKET = previousSocket;
        await rm(directory, { recursive: true, force: true });
    }
});
