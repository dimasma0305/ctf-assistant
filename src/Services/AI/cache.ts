import { Message as DiscordMessage } from "discord.js";
import MessageCache from "../../Database/messageCacheSchema";

export const MAX_CACHE_SIZE = 20; // Max number of messages to keep per channel cache

export async function updateChannelCache(message: DiscordMessage) {
    const channelId = message.channel.id;
    await MessageCache.findOneAndUpdate(
        { channelId },
        {
            $push: {
                messages: {
                    $each: [message],
                    $slice: -MAX_CACHE_SIZE
                }
            }
        },
        { upsert: true }
    );
}

export async function getChannelCache(channelId: string): Promise<DiscordMessage[]> {
    const cache = await MessageCache.findOne({ channelId });
    return cache ? cache.messages : [];
}
