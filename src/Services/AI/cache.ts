import { Message as DiscordMessage } from "discord.js";
import {MessageCacheModel} from "../../Database/connect";

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
}

export async function getChannelCache(channelId: string): Promise<SimplifiedMessage[]> {
    const cache = await MessageCacheModel.findOne({ channelId });
    return cache ? cache.messages : [];
}
