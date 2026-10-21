import type { ChatMessage } from './discordAccess';
import type { HandleAIChatOptions } from './chat';
import { neutralizeControlTokens } from './context';
import { mentionReferences, type MentionReference } from './mentions';

export interface AttentionDecision { shouldChime: boolean; reason: string; promptHint: string; reactionEmoji?: string; continuation?: boolean }
export interface AttentionSnapshot { id: string; authorId: string; authorName?: string; isBot: boolean; content: string; mentions?: MentionReference[]; replyTo?: string; at: number }
interface PendingTurn { key: string; firstAt: number; items: { message: ChatMessage; addressed: boolean }[]; timer?: ReturnType<typeof setTimeout> }
interface AttentionDependencies {
    respond(message: ChatMessage, options: HandleAIChatOptions): Promise<void>;
    decide(message: ChatMessage, recent: AttentionSnapshot[]): Promise<AttentionDecision>;
    react(message: ChatMessage, emoji: string, isCurrent: () => boolean): Promise<unknown>;
    canRespond(message: ChatMessage): Promise<boolean>;
    directDelayMs?: number;
    ambientDelayMs?: number;
    maxWaitMs?: number;
}

/** Coalesce messages from ONE person; another speaker never replaces their question. */
export class ConversationAttention {
    private pending = new Map<string, PendingTurn>();
    private active = new Map<string, PendingTurn>();
    private revisions = new Map<string, number>();
    private recent = new Map<string, AttentionSnapshot[]>();
    private serial = 0;
    constructor(private deps: AttentionDependencies) {}

    observe(message: ChatMessage): void {
        this.revisions.delete(message.id);
        this.revisions.set(message.id, ++this.serial);
        while (this.revisions.size > 5000) this.revisions.delete(this.revisions.keys().next().value!);
        const history = (this.recent.get(message.channelId) || []).filter(item => item.id !== message.id && Date.now() - item.at < 30 * 60_000);
        history.push({ id: message.id, authorId: message.author.id,
            authorName: neutralizeControlTokens(message.member?.displayName || message.author.globalName || message.author.username || '').slice(0, 64) || undefined,
            isBot: message.author.bot,
            content: neutralizeControlTokens(message.content || '').slice(0, 800), mentions: mentionReferences(message), replyTo: message.reference?.messageId,
            at: message.createdTimestamp || Date.now() });
        history.sort((a, b) => a.at - b.at);
        this.recent.delete(message.channelId);
        this.recent.set(message.channelId, history.slice(-12));
        while (this.recent.size > 500) this.recent.delete(this.recent.keys().next().value!);
    }

    schedule(message: ChatMessage, addressed: boolean): void {
        if (message.author.bot || message.webhookId || message.system) return;
        const key = `${message.channelId}:${message.author.id}`;
        const existing = this.pending.get(key);
        if (!existing && this.pending.size >= 500) return;
        const turn = existing || { key, firstAt: Date.now(), items: [...(this.active.get(key)?.items || [])] };
        turn.items = turn.items.filter(item => item.message.id !== message.id);
        turn.items.push({ message, addressed });
        turn.items.sort((a, b) => (a.message.createdTimestamp || 0) - (b.message.createdTimestamp || 0));
        turn.items = turn.items.slice(-8);
        if (turn.timer) clearTimeout(turn.timer);
        const direct = turn.items.some(item => item.addressed);
        this.active.delete(key);
        this.pending.set(key, turn);
        const delay = Math.max(0, Math.min(direct ? this.deps.directDelayMs ?? 1200 : this.deps.ambientDelayMs ?? 3500,
            (this.deps.maxWaitMs ?? 6000) - (Date.now() - turn.firstAt)));
        turn.timer = setTimeout(() => { void this.run(turn).catch(() => console.warn('[Attention] turn failed')); }, delay);
        turn.timer.unref?.();
    }

    edit(message: ChatMessage, addressed: boolean): void {
        this.observe(message);
        const key = `${message.channelId}:${message.author.id}`;
        const turn = this.pending.get(key) || this.active.get(key);
        if (turn?.items.some(item => item.message.id === message.id)) this.schedule(message, addressed);
    }

    remove(channelId: string, messageId: string): void {
        this.revisions.delete(messageId);
        if (this.recent.has(channelId)) this.recent.set(channelId, this.recent.get(channelId)!.filter(item => item.id !== messageId));
        for (const [key, turn] of this.pending) {
            turn.items = turn.items.filter(item => item.message.id !== messageId);
            if (!turn.items.length) { clearTimeout(turn.timer); this.pending.delete(key); }
        }
    }

    private async run(turn: PendingTurn): Promise<void> {
        if (this.pending.get(turn.key) !== turn) return;
        clearTimeout(turn.timer);
        this.pending.delete(turn.key);
        this.active.set(turn.key, turn);
        const message = turn.items.at(-1)!.message;
        const revisions = turn.items.map(item => [item.message.id, this.revisions.get(item.message.id)] as const);
        const isCurrent = () => this.active.get(turn.key) === turn
            && revisions.every(([id, revision]) => revision !== undefined && this.revisions.get(id) === revision);
        try {
            if (!isCurrent() || !(await this.deps.canRespond(message))) return;
            const addressed = turn.items.some(item => item.addressed);
            const burstContext = turn.items.length > 1 ? JSON.stringify(turn.items.map(item => ({ id: item.message.id,
                authorId: item.message.author.id, content: neutralizeControlTokens(item.message.content || '').slice(0, 1200) }))).slice(0, 6000) : undefined;
            const attachmentSources = turn.items.slice(0, -1).map(item => item.message);
            if (addressed) await this.deps.respond(message, { addressed: true, isCurrent, burstContext, attachmentSources });
            else {
                const decision = await this.deps.decide(message, this.recent.get(message.channelId) || []);
                if (!isCurrent() || !(await this.deps.canRespond(message))) return;
                // These reasons are fixed routing outcomes, never the model's
                // private promptHint, message text, or social-state explanations.
                console.log(`[Attention] source=${message.id} action=${decision.reactionEmoji ? 'react' : decision.shouldChime ? 'reply' : 'ignore'} reason=${decision.reason}`);
                if (decision.reactionEmoji) {
                    const result = await this.deps.react(message, decision.reactionEmoji, isCurrent);
                    if (result && typeof result === 'object' && 'ok' in result && result.ok === false)
                        console.warn(`[Attention] source=${message.id} action=react outcome=failed`);
                }
                // The planner only chooses whether/how to engage. Its freeform
                // reason can contain an inference about the conversation, so
                // the answer model must ground itself in the actual messages.
                else if (decision.shouldChime) await this.deps.respond(message, { ...(decision.continuation
                    ? { continuation: true }
                    : { spontaneous: true }), isCurrent, burstContext, attachmentSources });
            }
        } finally { if (this.active.get(turn.key) === turn) this.active.delete(turn.key); }
    }

    /** Drain pending bursts; deterministic tests need no artificial sleeps. */
    async flush(): Promise<void> { await Promise.all([...this.pending.values()].map(turn => this.run(turn))); }
    dispose(): void { for (const turn of this.pending.values()) clearTimeout(turn.timer); this.pending.clear(); this.active.clear(); }
}
