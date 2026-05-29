import { Message as DiscordMessage } from "discord.js";
import {MessageCacheModel, IndexedMessageModel} from "../../Database/connect";
import { embedViaWorker, scoreImportance } from "./embeddings";

export const MAX_CACHE_SIZE = 20; // Max number of messages to keep per channel cache

export interface SimplifiedMessage {
    id: string;
    content: string;
    createdTimestamp: number;
    type: number;
    system: boolean;
    author: {
        id: string;
        username: string;
        tag: string;
    };
    member: {
        displayName: string;
        nickname: string | null;
    } | null;
    attachments: boolean;
    embeds: boolean;
}

export async function updateChannelCache(message: DiscordMessage) {
    const channelId = message.channel.id;
    
    // Create a simplified message object for storage
    const simplifiedMessage = {
        id: message.id,
        content: message.content,
        createdTimestamp: message.createdTimestamp,
        type: message.type,
        system: message.system,
        author: {
            id: message.author.id,
            username: message.author.username,
            tag: message.author.tag
        },
        member: message.member ? {
            displayName: message.member.displayName,
            nickname: message.member.nickname
        } : null,
        attachments: message.attachments.size > 0,
        embeds: message.embeds.length > 0
    };
    
    await MessageCacheModel.updateOne(
        { channelId },
        {
            $push: {
                messages: {
                    $each: [simplifiedMessage],
                    $slice: -MAX_CACHE_SIZE
                }
            }
        },
        { upsert: true }
    );

    // Also persist to the long-lived indexed-message store for deep search.
    // Fire-and-forget — failures here must not block message handling.
    void indexMessage(message);
}

async function indexMessage(message: DiscordMessage): Promise<void> {
    // Only index messages we'd actually want searchable. Skip DMs (no guild)
    // and empty content with no attachments/embeds.
    if (!message.guildId) return;
    if (!message.content && message.attachments.size === 0 && message.embeds.length === 0) return;

    const content = (message.content || '').trim();
    const displayName = message.member?.displayName || message.author.username;
    // Importance is now a cheap LOCAL heuristic (no per-message LLM call) —
    // compute it inline and store it directly in the main upsert.
    const importance = scoreImportance(content, displayName);

    try {
        await IndexedMessageModel.updateOne(
            { messageId: message.id },
            {
                $set: {
                    messageId: message.id,
                    guildId: message.guildId,
                    channelId: message.channelId,
                    authorId: message.author.id,
                    authorUsername: message.author.username,
                    authorDisplayName: displayName,
                    isBot: message.author.bot,
                    content: message.content || '',
                    hasAttachments: message.attachments.size > 0,
                    hasEmbeds: message.embeds.length > 0,
                    createdAt: new Date(message.createdTimestamp),
                    importance,
                },
                // indexedAt drives the 90d TTL; only set on first insert so re-
                // indexing an edit doesn't extend the lifetime artificially.
                $setOnInsert: { indexedAt: new Date() },
            },
            { upsert: true }
        );

        // Embedding enrichment: a network round-trip to the CF Worker. Skip the
        // bot's own (often long) replies and trivial content, and bound total
        // in-flight embeds (embedAndStore) so a message burst can't open
        // hundreds of concurrent fetches. Fire-and-forget — best-effort recall.
        if (content.length >= 4 && !message.author.bot) {
            void embedAndStore(message.id, content);
        }
    } catch (error) {
        console.error('[IndexedMessage] failed to index message:', error);
    }
}

// Bounded fan-out for the embedding network call: DROP (do not queue) when
// saturated. Embeddings are a best-effort recall signal, so skipping a few
// under a burst is fine — and far better than spawning hundreds of concurrent
// Worker fetches + sockets the moment a channel floods.
const MAX_INFLIGHT_EMBEDS = 6;
let inflightEmbeds = 0;

/**
 * Compute an embedding for the message and patch it onto the indexed doc.
 * Silent on all failures — the doc is already keyword-searchable and carries a
 * local importance score; the embedding only improves semantic recall.
 */
async function embedAndStore(messageId: string, content: string): Promise<void> {
    if (inflightEmbeds >= MAX_INFLIGHT_EMBEDS) return;  // saturated — drop, don't pile up
    inflightEmbeds++;
    try {
        const embedding = await embedViaWorker(content);
        if (Array.isArray(embedding) && embedding.length > 0) {
            await IndexedMessageModel.updateOne({ messageId }, { $set: { embedding } }).catch(() => undefined);
        }
    } catch {
        // Silent — enrichment is best-effort.
    } finally {
        inflightEmbeds--;
    }
}

export async function getChannelCache(channelId: string): Promise<SimplifiedMessage[]> {
    const cache = await MessageCacheModel.findOne({ channelId });
    return cache ? cache.messages : [];
}
