import type { ImageReference } from './vision';
import type { MentionReference } from './mentions';

export interface MessageSource {
    messageId: string;
    authorId: string;
    authorName?: string;
    kind: 'reply' | 'media';
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    name?: string;
    content: string;
    /** Provider reasoning needed for subsequent tool-enabled turns; internal only. */
    reasoning_content?: string;
    /** Ephemeral, channel-scoped Discord references; never profile transcripts. */
    images?: ImageReference[];
    hadImages?: boolean;
    /** Discord chronology; rendered as context, never extra API properties. */
    messageId?: string;
    at?: number;
    replyToMessageId?: string;
    /** Backend-owned source authors; references are not actions by the caller. */
    sources?: MessageSource[];
    /** Public Discord identities for explicit tags, scoped to this channel turn. */
    mentions?: MentionReference[];
}

// AI conversation memory — keyed by **channelId** (not userId). One thread per
// channel, with multiple users contributing via the `name` field on user
// messages. This lets Hackerika participate naturally in multi-party chats
// instead of having a separate brain per person.
interface ChannelMemory {
    messages: ChatMessage[];
    lastAccessed: number;
}

export const memory: Record<string, ChannelMemory> = {};
const ONE_HOUR = 60 * 60 * 1000;

function cleanupInactiveMemory() {
    const now = Date.now();
    let clearedCount = 0;
    for (const channelId in memory) {
        if (now - memory[channelId].lastAccessed > ONE_HOUR) {
            delete memory[channelId];
            clearedCount++;
        }
    }
    if (clearedCount > 0) {
        console.log(`🧹 Cleared conversation memory for ${clearedCount} inactive channel(s).`);
    }
}

setInterval(cleanupInactiveMemory, ONE_HOUR / 2).unref?.();
