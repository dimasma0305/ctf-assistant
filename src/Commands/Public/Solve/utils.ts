import { TextChannel, CommandInteraction, Channel } from "discord.js";
import { CTFEvent } from "../../../Functions/ctftime-v2";

/**
 * Extracts challenge name from thread name format
 * Supports formats: "❌ [CATEGORY] Challenge Name" or "✅ [CATEGORY] Challenge Name"
 */
export function extractChallengeNameFromThread(threadName: string): string {
    const formatMatch = threadName.match(/^[❌✅]\s*\[([^\]]+)\]\s*(.+)$/);
    if (formatMatch) {
        return formatMatch[2].trim(); // Extract the challenge name part
    }
    return threadName; // Fallback to full thread name
}

/**
 * Extracts both category and challenge name from thread name format
 * Returns {category, challengeName} object
 */
export function extractChallengeInfoFromThread(threadName: string): { category: string; challengeName: string } {
    const formatMatch = threadName.match(/^[❌✅]\s*\[([^\]]+)\]\s*(.+)$/);
    if (formatMatch) {
        return {
            category: formatMatch[1].trim(),
            challengeName: formatMatch[2].trim()
        };
    }
    return {
        category: "Unknown",
        challengeName: threadName
    };
}

/**
 * Gets the parent TextChannel and CTF event data from either a TextChannel or Thread
 */
export async function getChannelAndCTFData(channel: Channel): Promise<{ textChannel: TextChannel; ctfData: CTFEvent } | null> {
    let textChannel: TextChannel;
    
    if (channel instanceof TextChannel) {
        textChannel = channel;
    } else if (channel.isThread() && channel.parent instanceof TextChannel) {
        textChannel = channel.parent;
    } else {
        return null;
    }
    
    const ctfData = JSON.parse(textChannel.topic || "{}") as CTFEvent;
    return { textChannel, ctfData };
}

/**
 * Updates thread name to show solved status (✅)
 */
export async function markThreadAsSolved(channel: Channel): Promise<void> {
    try {
        if (channel && 'name' in channel && channel.name && channel.isThread()) {
            const currentName = channel.name;
            let newName = currentName;
            
            // Check if thread follows init.ts format: "❌ [CATEGORY] Challenge Name"
            if (currentName.startsWith('❌')) {
                newName = currentName.replace('❌', '✅');
            } else if (!currentName.includes('✅')) {
                // For threads not following init.ts format, add ✅ prefix
                newName = `✅ ${currentName}`;
            }
            
            // Only rename if the name actually changed
            if (newName !== currentName) {
                await channel.setName(newName);
            }
        }
    } catch (error) {
        console.error("Failed to update thread name to solved:", error);
        // Don't throw error, just log it
    }
}

/**
 * Updates thread name to show unsolved status (❌)
 */
export async function markThreadAsUnsolved(channel: Channel): Promise<void> {
    try {
        if (channel && 'name' in channel && channel.name && channel.isThread()) {
            const currentName = channel.name;
            let newName = currentName;
            
            // Check if thread follows init.ts format: "✅ [CATEGORY] Challenge Name"
            if (currentName.startsWith('✅')) {
                newName = currentName.replace('✅', '❌');
            } else if (!currentName.includes('❌')) {
                // For threads not following init.ts format, add ❌ prefix
                newName = `❌ ${currentName}`;
            }
            
            // Only rename if the name actually changed
            if (newName !== currentName) {
                await channel.setName(newName);
            }
        }
    } catch (error) {
        console.error("Failed to update thread name to unsolved:", error);
        // Don't throw error, just log it
    }
}

/**
 * Gets challenge name from thread name (no longer supports manual name option)
 */
export function getChallengeName(interaction: CommandInteraction): string | null {
    const channel = interaction.channel;
    if (channel && channel.isThread()) {
        return extractChallengeNameFromThread(channel.name);
    }
    
    return null;
}

/**
 * Gets both challenge name and category from thread name
 */
export function getChallengeInfo(interaction: CommandInteraction): { category: string; challengeName: string } | null {
    const channel = interaction.channel;
    if (channel && channel.isThread()) {
        return extractChallengeInfoFromThread(channel.name);
    }
    
    return null;
}

/**
 * Validates that the channel has a valid CTF event
 */
export function validateCTFEvent(ctfData: CTFEvent): boolean {
    return !!ctfData.id;
}

/**
 * Extracts user IDs from Discord mention string
 */
export function extractUserIdsFromMentions(players: string | null, fallbackUserId: string): string[] {
    if (!players) {
        return [fallbackUserId];
    }
    
    const regex = /<@(\d+)>/g;
    const users = players.match(regex)?.map(match => match.slice(2, -1));
    return users || [fallbackUserId];
}
