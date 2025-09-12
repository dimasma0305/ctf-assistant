import { Message as DiscordMessage } from "discord.js";
import MessageCache from "../../Database/messageCacheSchema";

export const MAX_CACHE_SIZE = 20; // Max number of messages to keep per channel cache

export interface SimplifiedMessage {
    id: string;
    content: string;
    createdTimestamp: number;
    author: {
        id: string;
        username: string;
        tag: string;
    };
    member: {
        displayName: string;
        nickname: string | null;
    } | null;
}

export async function updateChannelCache(message: DiscordMessage) {
    const channelId = message.channel.id;
    
    // Create a simplified message object for storage
    const simplifiedMessage = {
        id: message.id,
        content: message.content,
        createdTimestamp: message.createdTimestamp,
        author: {
            id: message.author.id,
            username: message.author.username,
            tag: message.author.tag
        },
        member: message.member ? {
            displayName: message.member.displayName,
            nickname: message.member.nickname
        } : null
    };
    
    await MessageCache.findOneAndUpdate(
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
}

export async function getChannelCache(channelId: string): Promise<SimplifiedMessage[]> {
    const cache = await MessageCache.findOne({ channelId });
    return cache ? cache.messages : [];
}
