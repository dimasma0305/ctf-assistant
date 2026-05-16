import { Message as DiscordMessage } from "discord.js";
import {MessageCacheModel, IndexedMessageModel} from "../../Database/connect";

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
    
    await MessageCacheModel.findOneAndUpdate(
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
                    authorDisplayName: message.member?.displayName || message.author.username,
                    isBot: message.author.bot,
                    content: message.content || '',
                    hasAttachments: message.attachments.size > 0,
                    hasEmbeds: message.embeds.length > 0,
                    createdAt: new Date(message.createdTimestamp),
                },
                // indexedAt drives the 90d TTL; only set on first insert so re-
                // indexing an edit doesn't extend the lifetime artificially.
                $setOnInsert: { indexedAt: new Date() },
            },
            { upsert: true }
        );
    } catch (error) {
        console.error('[IndexedMessage] failed to index message:', error);
    }
}

export async function getChannelCache(channelId: string): Promise<SimplifiedMessage[]> {
    const cache = await MessageCacheModel.findOne({ channelId });
    return cache ? cache.messages : [];
}
