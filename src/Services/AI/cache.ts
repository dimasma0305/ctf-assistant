import { Message as DiscordMessage } from "discord.js";
import {MessageCacheModel, IndexedMessageModel} from "../../Database/connect";
import { embedViaWorker, scoreImportance } from "./embeddings";
import mongoose from 'mongoose';
import { isNoDbMode } from '../../utils/env';
import { mentionReferences, type MentionReference } from './mentions';

export const MAX_CACHE_SIZE = 40; // Enough for an active multi-person topic before a late summon.

// A deletion can race an in-flight cache/index write. Mark it synchronously,
// wait for that write, then remove both copies. Keep tombstones bounded.
const deletedMessages = new Set<string>();
const cacheWrites = new Map<string, Promise<void>>();
const localCache = new Map<string, SimplifiedMessage[]>();

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
    attachmentInfo?: { name: string; contentType: string }[];
    embeds: boolean;
    mentions?: MentionReference[];
}

export async function updateChannelCache(message: DiscordMessage) {
    if (deletedMessages.has(message.id)) return;
    const previous = cacheWrites.get(message.id) || Promise.resolve();
    const write = previous.catch(() => undefined).then(async () => {
        if (!deletedMessages.has(message.id)) await writeChannelCache(message);
    });
    cacheWrites.set(message.id, write);
    try { await write; } finally { if (cacheWrites.get(message.id) === write) cacheWrites.delete(message.id); }
}

async function writeChannelCache(message: DiscordMessage) {
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
        attachmentInfo: [...message.attachments.values()].slice(0, 3).map(attachment => ({
            name: (attachment.name || 'file').slice(0, 100),
            contentType: (attachment.contentType || '').slice(0, 60),
        })),
        embeds: message.embeds.length > 0,
        mentions: mentionReferences(message),
    };

    const local = (localCache.get(channelId) || []).filter(item => item.id !== message.id);
    local.push(simplifiedMessage);
    local.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    localCache.delete(channelId);
    localCache.set(channelId, local.slice(-MAX_CACHE_SIZE));
    while (localCache.size > 500) localCache.delete(localCache.keys().next().value!);
    if (isNoDbMode() || mongoose.connection.readyState !== 1) return;
    
    await MessageCacheModel.updateOne(
        { channelId },
        [{ $set: {
            channelId,
            createdAt: { $ifNull: ['$createdAt', '$$NOW'] },
            messages: { $slice: [{ $concatArrays: [
                { $filter: { input: { $ifNull: ['$messages', []] }, as: 'cached', cond: { $ne: ['$$cached.id', message.id] } } },
                { $literal: [simplifiedMessage] },
            ] }, -MAX_CACHE_SIZE] },
        } }],
        { upsert: true }
    );

    // Also persist to the long-lived indexed-message store for deep search.
    // Included in the tracked write so deletion can await it before purging.
    await indexMessage(message);
}

export async function forgetCachedMessage(channelId: string, messageId: string): Promise<void> {
    deletedMessages.add(messageId);
    if (localCache.has(channelId)) localCache.set(channelId, localCache.get(channelId)!.filter(item => item.id !== messageId));
    while (deletedMessages.size > 10_000) deletedMessages.delete(deletedMessages.values().next().value!);
    await cacheWrites.get(messageId)?.catch(() => undefined);
    if (isNoDbMode() || mongoose.connection.readyState !== 1) return;
    const results = await Promise.allSettled([
        MessageCacheModel.updateOne({ channelId }, { $pull: { messages: { id: messageId } } }).exec(),
        IndexedMessageModel.deleteOne({ messageId }).exec(),
    ]);
    if (results.some(result => result.status === 'rejected')) console.warn('[Cache] deletion cleanup incomplete');
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
    if (isNoDbMode() || mongoose.connection.readyState !== 1) return localCache.get(channelId) || [];
    const cache = await MessageCacheModel.findOne({ channelId }).setOptions({ timeoutMS: 3000 });
    return cache ? cache.messages.sort((a: SimplifiedMessage, b: SimplifiedMessage) => a.createdTimestamp - b.createdTimestamp) : localCache.get(channelId) || [];
}
