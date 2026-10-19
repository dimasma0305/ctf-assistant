import type { Message, OmitPartialGroupDMChannel } from 'discord.js';
import { collectCTFInputs, collectCodexArtifacts } from './ctfInputs';
import { solveCTFForTurn } from './ctf';
import { codexSolverEnabled, submitCodexJob, type CodexRoute, type CodexPublicJob } from './codexJobs';
import { getDiscordProfileForTool } from './discordProfile';

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
    let context = gathered.text;
    if (args.targetUserId !== undefined) {
        const profile = await getDiscordProfileForTool(message, { userId: args.targetUserId });
        if (!profile.ok) return profile;
        context += `\n[verified Discord API profile for explicitly mentioned member] ${JSON.stringify(profile)}`;
    }
    const artifacts = await collectCodexArtifacts(gathered.originals, signal, message.id);
    const route: CodexRoute = ['auto', 'luna', 'sol', 'daybreak'].includes(args.solver || '') ? args.solver! : 'auto';
    try {
        const queued = await submitCodexJob({ kind: 'investigation', scope: `${message.guildId}:${message.channelId}`,
            guildId: message.guildId, channelId: message.channelId, messageId: message.id, userId: message.author.id,
            question: args.question.trim().slice(0, 8000), context: context.slice(0, 50_000), route, artifacts }, signal);
        delegated.add(message);
        return { ok: true, status: 'queued', job: queued.job,
            note: 'Hasil riset akan dikirim otomatis di channel/thread ini. Jangan klaim pekerjaan selesai sebelum hasil tiba.' };
    } catch (caught: unknown) {
        const error = caught as Error & { job?: CodexPublicJob };
        if (error.job) {
            delegated.add(message);
            return { ok: true, status: 'busy', job: error.job, note: 'Job di channel ini masih berjalan.' };
        }
        return { ok: false, error: String(error?.message || 'codex_unavailable').slice(0, 120) };
    }
}
