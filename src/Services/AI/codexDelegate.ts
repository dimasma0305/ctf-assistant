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
    newCase?: boolean; solver?: CodexRoute;
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
    const route: CodexRoute = ['auto', 'luna', 'sol', 'daybreak'].includes(args.solver || '') ? args.solver! : 'auto';
    const packetBase = { kind: 'investigation' as const, scope: `${message.guildId}:${message.channelId}`,
        guildId: message.guildId, channelId: message.channelId, messageId: message.id, userId: message.author.id,
        route, artifacts };
    const packets: CodexPacket[] = profiles.length ? profiles.map(profile => {
        const target = profile.profile;
        const focus = explicitSubjects.length > 1
            ? `Objek riset job ini hanya member Discord ${JSON.stringify(target.guild.displayName)} (@${target.username}, ID ${target.id}); member lain yang ditag ditangani job terpisah. `
            : 'Objek riset adalah satu member Discord yang ditag eksplisit; ';
        const question = explicitSubjects.length
            ? `Permintaan user: ${JSON.stringify(message.content)}. ${focus}Profil terverifikasi ada di context. Telusuri jejak publik/profesional yang relevan, periksa sumber, dan bedakan akun yang hanya bernama mirip. Jangan minta klarifikasi tentang objek yang sudah jelas. Tujuan tambahan: ${args.question!.trim()}`
            : args.question!.trim();
        return { ...packetBase, question: question.slice(0, 8000),
            context: `${gathered.text}\n[verified Discord API profile for explicitly mentioned member] ${JSON.stringify(profile)}`.slice(0, 50_000) };
    }) : [{ ...packetBase, question: args.question.trim().slice(0, 8000), context: gathered.text.slice(0, 50_000) }];
    try {
        const queued = packets.length === 1
            ? await submitCodexJob(packets[0], signal)
            : await submitCodexJobBatch(packets, signal);
        delegated.add(message);
        return { ok: true, status: 'queued', ...('jobs' in queued ? { jobs: queued.jobs,
            targets: profiles.map(profile => profile.profile.guild.displayName) } : { job: queued.job }),
            note: `${packets.length} hasil riset akan dikirim otomatis di channel/thread ini. Jangan klaim pekerjaan selesai sebelum semua hasil tiba.` };
    } catch (caught: unknown) {
        const error = caught as Error & { job?: CodexPublicJob };
        if (error.job) {
            delegated.add(message);
            return { ok: true, status: 'busy', job: error.job, note: 'Job di channel ini masih berjalan.' };
        }
        return { ok: false, error: String(error?.message || 'codex_unavailable').slice(0, 120) };
    }
}
