import type { Message, OmitPartialGroupDMChannel } from 'discord.js';
import { collectCTFInputs, collectCodexArtifacts } from './ctfInputs';
import { solveCTFForTurn } from './ctf';
import { codexSolverEnabled, submitCodexJob, submitCodexJobBatch, type CodexPacket, type CodexRoute, type CodexPublicJob } from './codexJobs';
import { discordPersonResearchSubjects, getDiscordProfileForTool } from './discordProfile';

type Turn = OmitPartialGroupDMChannel<Message<boolean>>;
const delegated = new WeakSet<object>();
export const hasCodexDelegation = (turn: object) => delegated.has(turn);

/** The manager decides when and what to delegate. This handler only enforces
 * current-channel scope, explicit profile mentions and controller budgets. */
export async function delegateCodexForTurn(args: {
    question?: string; kind?: 'ctf' | 'investigation'; targetUserId?: string;
    newCase?: boolean; solver?: CodexRoute; investigationMode?: 'joint' | 'separate';
    imageMode?: 'auto'|'generative'|'vector';
}, message: Turn, options: { signal?: AbortSignal } = {}) {
    if (delegated.has(message)) return { ok: false, error: 'already_delegated_this_turn' };
    if (args.kind !== 'ctf' && args.kind !== 'investigation') return { ok: false, error: 'invalid_kind' };
    if (typeof args.question !== 'string' || !args.question.trim()) return { ok: false, error: 'question_required' };
    if (args.kind === 'ctf') {
        const result = await solveCTFForTurn(args, message, options);
        if (result.status === 'queued') delegated.add(message);
        return result;
    }
    if (!codexSolverEnabled()) return { ok: false, error: 'isolated_agent_unavailable' };
    if (!message.guildId || !/^\d{17,20}$/.test(message.guildId)
        || !/^\d{17,20}$/.test(message.channelId) || !/^\d{17,20}$/.test(message.id)
        || !/^\d{17,20}$/.test(message.author.id)) return { ok: false, error: 'guild_channel_required' };

    const signal = AbortSignal.any([AbortSignal.timeout(70_000), ...(options.signal ? [options.signal] : [])]);
    const gathered = await collectCTFInputs(message, { text: message.content || '' }, signal);
    // A request naming several people needs one bounded investigation per
    // person. A manager-supplied targetUserId must not silently drop the rest.
    const explicitSubjects = discordPersonResearchSubjects(message);
    if (explicitSubjects.length > 3) return { ok: false, error: 'too_many_profile_targets' };
    const targetIds = explicitSubjects.length ? explicitSubjects : args.targetUserId ? [args.targetUserId] : [];
    const profiles = [];
    for (const id of targetIds) {
        const profile = await getDiscordProfileForTool(message, { userId: id });
        if (!profile.ok) return profile;
        profiles.push(profile);
    }
    const artifacts = await collectCodexArtifacts(gathered.originals, signal, message.id);
    const route: CodexRoute = ['auto', 'gpt-5.6-sol', 'gpt-6.1-sol', 'daybreak', 'luna', 'sol'].includes(args.solver || '') ? args.solver! : 'auto';
    const packetBase = { kind: 'investigation' as const, scope: `${message.guildId}:${message.channelId}`,
        guildId: message.guildId, channelId: message.channelId, messageId: message.id, userId: message.author.id,
        route, ...(args.imageMode?{imageMode:args.imageMode}:{}), artifacts };
    const separate = explicitSubjects.length > 1 && args.investigationMode === 'separate';
    const packets: CodexPacket[] = profiles.length && !separate && explicitSubjects.length > 1
        ? [{ ...packetBase,
            question: `Permintaan user: ${JSON.stringify(message.content)}. Tangani semua member yang ditag sebagai satu pertanyaan riset. Profil Discord terverifikasi untuk tiap target ada di context; jangan menyamakan akun publik hanya karena nama mirip. Tujuan tambahan: ${args.question.trim()}`.slice(0, 8000),
            context: `${gathered.text}\n${profiles.map(profile => `[verified Discord API profile for explicitly mentioned member] ${JSON.stringify(profile)}`).join('\n')}`.slice(0, 50_000) }]
        : profiles.length ? profiles.map(profile => {
        const target = profile.profile;
        const focus = separate
            ? `Objek riset job ini hanya member Discord ${JSON.stringify(target.guild.displayName)} (@${target.username}, ID ${target.id}); member lain yang ditag ditangani job terpisah. `
            : 'Objek riset adalah satu member Discord yang ditag eksplisit; ';
        const question = explicitSubjects.length
            ? `Permintaan user: ${JSON.stringify(message.content)}. ${focus}Profil terverifikasi ada di context. Telusuri jejak publik/profesional yang relevan, periksa sumber, dan bedakan akun yang hanya bernama mirip. Jangan minta klarifikasi tentang objek yang sudah jelas.`
            : args.question!.trim();
        return { ...packetBase, question: question.slice(0, 8000),
            context: `${gathered.text}\n[verified Discord API profile for explicitly mentioned member] ${JSON.stringify(profile)}`.slice(0, 50_000) };
    }) : [{ ...packetBase,
        question: `Permintaan asli user: ${JSON.stringify(message.content || '')}\nTujuan agen: ${args.question.trim()}`.slice(0, 8000),
        context: gathered.text.slice(0, 50_000) }];
    try {
        const queued = packets.length === 1
            ? await submitCodexJob(packets[0], signal)
            : await submitCodexJobBatch(packets, signal);
        delegated.add(message);
        return { ok: true, status: 'queued', ...('jobs' in queued ? { jobs: queued.jobs } : { job: queued.job }),
            ...(explicitSubjects.length > 1 ? { targets: profiles.map(profile => profile.profile.guild.displayName), investigationMode: separate ? 'separate' : 'joint' } : {}),
            note: `${packets.length} hasil riset akan dikirim otomatis di channel/thread ini. Jangan klaim pekerjaan selesai sebelum semua hasil tiba.` };
    } catch (caught: unknown) {
        const error = caught as Error & { job?: CodexPublicJob; retryAfterSeconds?: number; limit?: number };
        if (error.job) {
            delegated.add(message);
            return { ok: true, status: 'busy', job: error.job, note: 'Job di channel ini masih berjalan.' };
        }
        if (error?.message === 'user_hourly_limit') return { ok: false, error: 'user_hourly_limit',
            retryAfterSeconds: error.retryAfterSeconds, limit: error.limit,
            note: `Kuota job Codex per jam sedang penuh${error.retryAfterSeconds ? `; coba lagi sekitar ${Math.ceil(error.retryAfterSeconds / 60)} menit lagi` : ''}. Jelaskan batas ini kepada user, bukan "gagal mulai" tanpa alasan.` };
        if (error?.message === 'image_generation_unavailable') return { ok: false, error: 'image_generation_unavailable',
            note: 'Image gen belum aktif karena controller belum punya kunci API gambar. Jelaskan langsung; jangan janji hasil menyusul atau menggantinya diam-diam dengan gambar kode.' };
        if (['worker_preparing', 'worker_image_unavailable'].includes(error?.message)) return { ok: false, error: error.message,
            retryAfterSeconds: error.retryAfterSeconds,
            note: 'Agen belum siap dan job belum diterima. Untuk riset web tanpa kebutuhan eksekusi/file, pakai research_topic jika belum dipakai; jika sudah, lanjutkan web_search/fetch_url dari bukti yang tersedia. Jangan mengklaim job berjalan atau menyuruh user mengulang pertanyaan tanpa menjelaskan gangguan.' };
        return { ok: false, error: String(error?.message || 'codex_unavailable').slice(0, 120) };
    }
}
