import { TextChannel, Message } from "discord.js";
import { ChallengeSchemaType, solveModel, ChallengeModel } from "../../../../Database/connect";
import { ParsedChallenge } from './parsers/types';
import fg from 'fast-glob';
import path from 'path';

export * from './parsers/types';

type UpdateThreadsResult = {
    updatedMessages: number;
    createdThreads: number;
    errors: string[];
    skippedThreads: number;
};

// Serialize update runs per channel+ctf to avoid duplicate thread/message creation
const threadUpdateQueues = new Map<string, Promise<UpdateThreadsResult>>();
const threadInfoMessageCache = new Map<string, string>();

export function normalizeThreadLookupKey(value: string): string {
    return value
        .normalize('NFKC')
        // Remove invisible/formatting chars that frequently create "same-looking" duplicates:
        // - C0/C1 control and format characters (includes zero-width chars)
        // - variation selectors (basic + supplementary plane)
        // - Unicode tag characters U+E0000-U+E007F
        .replace(/[\p{Cc}\p{Cf}\uFE00-\uFE0F\u{E0100}-\u{E01EF}\u{E0000}-\u{E007F}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase('en-US');
}

function isChallengeInfoMessage(message: Message, challengeId: string | number): boolean {
    return message.content.includes(`*Challenge ID: ${challengeId}*`);
}

async function findBotChallengeInfoMessage(
    thread: any,
    botUserId: string,
    challengeId: string | number
): Promise<Message | null> {
    const cachedId = threadInfoMessageCache.get(thread.id);
    if (cachedId) {
        try {
            const cachedMessage = await thread.messages.fetch(cachedId);
            if (cachedMessage.author.id === botUserId && isChallengeInfoMessage(cachedMessage, challengeId)) {
                return cachedMessage;
            }
        } catch (_error) {
            // Cache might be stale (message deleted), fall through to re-scan.
        }
        threadInfoMessageCache.delete(thread.id);
    }

    // Scan from oldest to newest so we can keep the earliest challenge info message.
    let afterId = thread.id;
    let scannedCount = 0;
    const MAX_SCAN = 500;
    let oldestMatch: Message | null = null;

    while (scannedCount < MAX_SCAN) {
        const batch = await thread.messages.fetch({
            limit: 100,
            after: afterId
        });

        if (batch.size === 0) {
            break;
        }

        const ordered = Array.from(batch.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        for (const message of ordered) {
            if (message.author.id === botUserId && isChallengeInfoMessage(message, challengeId)) {
                oldestMatch = message;
                break;
            }
        }

        if (oldestMatch) {
            break;
        }

        scannedCount += ordered.length;
        afterId = ordered[ordered.length - 1].id;
    }

    if (oldestMatch) {
        threadInfoMessageCache.set(thread.id, oldestMatch.id);
        return oldestMatch;
    }

    return null;
}

async function findAllBotChallengeInfoMessages(
    thread: any,
    botUserId: string,
    challengeId: string | number
): Promise<Message[]> {
    let afterId = thread.id;
    let scannedCount = 0;
    const MAX_SCAN = 500;
    const matches: Message[] = [];

    while (scannedCount < MAX_SCAN) {
        const batch = await thread.messages.fetch({
            limit: 100,
            after: afterId
        });

        if (batch.size === 0) {
            break;
        }

        const ordered = Array.from(batch.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        for (const message of ordered) {
            if (message.author.id === botUserId && isChallengeInfoMessage(message, challengeId)) {
                matches.push(message);
            }
        }

        scannedCount += ordered.length;
        afterId = ordered[ordered.length - 1].id;
    }

    return matches.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

/**
 * Check if a challenge is solved by querying the solve schema
 * @param challengeName - The name of the challenge to check
 * @param ctfId - The CTF event ID
 * @returns Promise<boolean> - True if the challenge is solved, false otherwise
 */
export async function isChallengeSolved(challengeName: string, ctfId: string): Promise<boolean> {
    try {
        // First, find the challenge by name and ctf_id
        const challenge = await ChallengeModel.findOne({
            name: challengeName,
            ctf_id: ctfId
        });

        if (!challenge) {
            return false; // Challenge doesn't exist
        }

        // Check if there's a solve record for this challenge
        const solve = await solveModel.findOne({
            challenge_ref: challenge._id,
            ctf_id: ctfId
        });

        return solve !== null;
    } catch (error) {
        console.error(`Error checking solve status for challenge ${challengeName}:`, error);
        return false;
    }
}

/**
 * Check if a challenge is solved by challenge ID
 * @param challengeId - The ObjectId of the challenge
 * @param ctfId - The CTF event ID
 * @returns Promise<boolean> - True if the challenge is solved, false otherwise
 */
export async function isChallengeSolvedById(challengeId: string, ctfId: string): Promise<boolean> {
    try {
        const solve = await solveModel.findOne({
            challenge_ref: challengeId,
            ctf_id: ctfId
        });

        return solve !== null;
    } catch (error) {
        console.error(`Error checking solve status for challenge ID ${challengeId}:`, error);
        return false;
    }
}

/**
 * Get all solved challenges for a CTF event
 * @param ctfId - The CTF event ID
 * @returns Promise<string[]> - Array of solved challenge names
 */
export async function getSolvedChallenges(ctfId: string): Promise<string[]> {
    try {
        const solves = await solveModel.find({ ctf_id: ctfId }).populate<{challenge_ref: ChallengeSchemaType}>('challenge_ref');
        return solves
            .filter(solve => solve.challenge_ref)
            .map(solve => solve.challenge_ref.name);
    } catch (error) {
        console.error(`Error getting solved challenges for CTF ${ctfId}:`, error);
        return [];
    }
}

const currentScriptPath = import.meta.path;
const currentScriptDir = path.dirname(currentScriptPath);
// Load all parser files, excluding test files and types file
const parsers = fg.sync(`${currentScriptDir}/parsers/*.ts`, {
    ignore: ['**/*.test.ts', '**/*.spec.ts', '**/types.ts']
});
const parserFunctions: ((data: any) => ParsedChallenge[])[] | null[] = parsers.map(parser => {
    const p = require(parser);
    if (p.parse) {
        return p.parse;
    }
    return null;
});

// Parse challenges based on platform type
export async function parseChallenges(jsonData: string): Promise<ParsedChallenge[]> {
    let data: any;
    const errors: string[] = [];
    try {
        data = JSON.parse(jsonData);
    } catch (error) {
        errors.push('Error parsing JSON data:', (error as Error).message, jsonData);
        data = jsonData;
    }
    
    for (const parser of parserFunctions) {
        try {
            if (parser) {
                return parser(data);
            }
        } catch (error) {
            errors.push('Error parsing challenges:', (error as Error).message);
            continue;
        }
    }

    if (errors.length > 0) {
        throw new Error(errors.join('\n'));
    }else {
        throw new Error('No parser found for the given data');
    }
}

// Update thread status based on solved challenges
export async function updateThreadsStatus(challenges: ParsedChallenge[], channel: TextChannel, ctfId: number): Promise<UpdateThreadsResult> {
    const queueKey = `${channel.id}:${ctfId}`;
    const previousRun = threadUpdateQueues.get(queueKey) || Promise.resolve({
        updatedMessages: 0,
        createdThreads: 0,
        errors: [],
        skippedThreads: 0
    });

    const nextRun = previousRun
        .catch(() => ({
            updatedMessages: 0,
            createdThreads: 0,
            errors: [],
            skippedThreads: 0
        }))
        .then(() => runThreadStatusUpdate(challenges, channel, ctfId))
        .finally(() => {
            if (threadUpdateQueues.get(queueKey) === nextRun) {
                threadUpdateQueues.delete(queueKey);
            }
        });

    threadUpdateQueues.set(queueKey, nextRun);
    return nextRun;
}

async function runThreadStatusUpdate(challenges: ParsedChallenge[], channel: TextChannel, ctfId: number): Promise<UpdateThreadsResult> {
    try {
        // Get all solved challenges for this CTF using the solve schema (more reliable than challenge.is_solved)
        // This directly queries the solve schema to determine which challenges have been solved
        const solvedChallengeNames = await getSolvedChallenges(ctfId.toString());
        const solvedChallenges = new Set(solvedChallengeNames.map(name => normalizeThreadLookupKey(name)));

        let updatedMessages = 0;
        let createdThreads = 0;
        const errors: string[] = [];
        let skippedThreads = 0;

        // Fetch all active threads ONCE at the beginning to avoid race conditions
        const activeThreads = await channel.threads.fetch();
        
        // Create a map to track threads by their expected name (without prefix)
        // This prevents race conditions when creating multiple threads
        const threadMap = new Map<string, any>();
        for (const [_, thread] of activeThreads.threads) {
            const threadNameWithoutPrefix = thread.name.replace(/^[✅❌]\s*/, '');
            const lookupKey = normalizeThreadLookupKey(threadNameWithoutPrefix);
            if (!threadMap.has(lookupKey)) {
                threadMap.set(lookupKey, []);
            }
            threadMap.get(lookupKey)!.push(thread);
        }

        for (const challenge of challenges) {
            try {
                // Check if challenge is solved using the solve schema (more reliable than challenge.is_solved)
                const isSolved = solvedChallenges.has(normalizeThreadLookupKey(challenge.name));
                const category = challenge.category.toUpperCase();
                const expectedName = `[${category}] ${challenge.name}`;
                const expectedNameLookupKey = normalizeThreadLookupKey(expectedName);
                const threadPrefix = isSolved ? '✅' : '❌';
                const threadName = `${threadPrefix} ${expectedName}`;

                // Check our local map for existing threads
                const matchingThreads = threadMap.get(expectedNameLookupKey) || [];

                let existingThread = null;

                // Handle duplicates: keep oldest, delete the rest
                if (matchingThreads.length > 1) {
                    console.log(`Found ${matchingThreads.length} duplicate threads for ${expectedName}, cleaning up...`);
                    
                    // Sort by creation date (oldest first)
                    const sortedThreads = matchingThreads.sort((a: any, b: any) => a.createdTimestamp! - b.createdTimestamp!);
                    
                    // Keep the first (oldest) thread
                    existingThread = sortedThreads[0];
                    
                    // Delete all duplicate threads
                    for (let i = 1; i < sortedThreads.length; i++) {
                        try {
                            await sortedThreads[i].delete('Duplicate thread cleanup');
                            console.log(`Deleted duplicate thread: ${sortedThreads[i].name} (ID: ${sortedThreads[i].id})`);
                        } catch (deleteError) {
                            console.error(`Failed to delete duplicate thread ${sortedThreads[i].id}:`, deleteError);
                        }
                    }
                    
                    // Update the map to only keep the oldest thread
                    threadMap.set(expectedNameLookupKey, [existingThread]);
                } else if (matchingThreads.length === 1) {
                    existingThread = matchingThreads[0];
                }

                // If thread doesn't exist, create it
                if (!existingThread) {
                    // Re-check channel state right before create to reduce cross-run race duplication.
                    const latestThreads = await channel.threads.fetch();
                    const latestMatches = Array.from(latestThreads.threads.values()).filter(
                        (t: any) => normalizeThreadLookupKey(t.name.replace(/^[✅❌]\s*/, '')) === expectedNameLookupKey
                    );
                    if (latestMatches.length > 0) {
                        existingThread = latestMatches.sort((a: any, b: any) => a.createdTimestamp! - b.createdTimestamp!)[0];
                        skippedThreads++;
                    }
                }

                if (!existingThread) {
                    existingThread = await channel.threads.create({
                        name: threadName,
                        autoArchiveDuration: 10080, // 7 days
                        reason: `CTF Challenge thread for ${challenge.name}`
                    });
                    createdThreads++;
                    console.log(`Created new thread: ${threadName}`);
                    
                    // Add to our local map to prevent duplicate creation in this session
                    threadMap.set(expectedNameLookupKey, [existingThread]);
                } else {
                    skippedThreads++;
                }

                // Update thread name if status changed
                if (existingThread.name !== threadName) {
                    await existingThread.setName(threadName);
                    console.log(`Updated thread name from ${existingThread.name} to ${threadName}`);
                }

                // Create updated challenge info
                const solveStatus = isSolved ? '🎉 **SOLVED!** 🎉' : '🔍 **Unsolved**';
                
                // Sanitize description for Discord display
                let sanitizedDescription = challenge.description 
                    ? challenge.description
                        .replace(/```/g, '`\u200B``') // Escape code blocks
                        .trim()
                    : '';
                
                // Calculate base message size (without description)
                const baseMessageParts = [
                    `# ${challenge.name}`,
                    `**Status:** ${solveStatus}`,
                    `**Category:** ${challenge.category}`,
                    `**Points:** ${challenge.points}`,
                    `**Solves:** ${challenge.solves}`,
                    challenge.tags && challenge.tags.length > 0 ? `**Tags:** ${challenge.tags.join(', ')}` : '',
                    '',
                    '💡 **Use this thread to discuss and solve this challenge!**',
                    isSolved ? '✅ This challenge has been marked as solved!' : '📝 When solved, use `/solve challenge` to mark it as complete.',
                    '',
                    '---',
                    `*Challenge ID: ${challenge.id}*`
                ];
                const baseMessageSize = baseMessageParts.filter(l => l !== '').join('\n').length;
                
                // Discord message limit is 4000, leave room for description header and code blocks
                const MAX_MESSAGE_LENGTH = 2000;
                const DESCRIPTION_OVERHEAD = 30; // "\n**Description:**\n```\n```\n"
                const maxDescriptionLength = MAX_MESSAGE_LENGTH - baseMessageSize - DESCRIPTION_OVERHEAD - 100; // Extra buffer
                
                // Truncate description if needed
                let descriptionText = '';
                if (sanitizedDescription) {
                    if (sanitizedDescription.length > maxDescriptionLength) {
                        sanitizedDescription = sanitizedDescription.substring(0, maxDescriptionLength - 50) + '\n\n... (truncated, too long for Discord)';
                    }
                    descriptionText = `\n**Description:**\n\`\`\`\n${sanitizedDescription}\n\`\`\``;
                }
                
                const challengeInfo = [
                    ...baseMessageParts.slice(0, 6), // Everything up to tags
                    descriptionText,
                    ...baseMessageParts.slice(6) // Everything after tags
                ].filter(line => line !== '').join('\n');

                const botMessage = await findBotChallengeInfoMessage(existingThread, channel.client.user.id, challenge.id);
                const allBotMessages = await findAllBotChallengeInfoMessages(existingThread, channel.client.user.id, challenge.id);
                let primaryBotMessage = botMessage;

                if (allBotMessages.length > 1) {
                    const [primaryMessage, ...duplicateMessages] = allBotMessages;
                    primaryBotMessage = primaryMessage;
                    threadInfoMessageCache.set(existingThread.id, primaryMessage.id);
                    for (const duplicateMessage of duplicateMessages) {
                        try {
                            await duplicateMessage.delete();
                            console.log(`Deleted duplicate challenge info message ${duplicateMessage.id} in thread: ${existingThread.name}`);
                        } catch (deleteError) {
                            console.warn(`Failed to delete duplicate challenge info message ${duplicateMessage.id}:`, deleteError);
                        }
                    }
                } else if (!primaryBotMessage && allBotMessages.length === 1) {
                    primaryBotMessage = allBotMessages[0];
                    threadInfoMessageCache.set(existingThread.id, allBotMessages[0].id);
                }

                if (primaryBotMessage) {
                    // Check if the message content needs updating
                    if (primaryBotMessage.content !== challengeInfo) {
                        try {
                            if (primaryBotMessage.editable) {
                                // Check if the message is a system message (e.g. thread starter message if it was a system message)
                                // System messages (type !== 0) cannot be edited
                                if (primaryBotMessage.type === 0 || primaryBotMessage.type === 19) { // 0: Default, 19: Reply
                                    await primaryBotMessage.edit(challengeInfo);
                                    updatedMessages++;
                                    console.log(`Updated bot message in thread: ${existingThread.name}`);
                                } else {
                                    console.warn(`Found bot message in ${existingThread.name} but it is a system message (type ${primaryBotMessage.type}). Creating new message.`);
                                    await existingThread.send(challengeInfo);
                                    updatedMessages++;
                                }
                            } else {
                                // If we found our message but can't edit it, that's weird. 
                                // Maybe we lost permissions? Log it.
                                console.warn(`Found bot message in ${existingThread.name} but it is not editable.`);
                            }
                        } catch (editError) {
                            console.error(`Failed to edit message in ${existingThread.name}:`, editError);
                            // If edit fails (e.g. Unknown Message), maybe we should create a new one?
                            // But checking error code is safer.
                            if ((editError as any).code === 10008 || (editError as any).code === 50021) { // 10008: Unknown Message, 50021: Cannot execute action on a system message
                                await existingThread.send(challengeInfo);
                                updatedMessages++;
                                console.log(`Re-created message in thread after edit failure: ${existingThread.name}`);
                            }
                        }
                    }
                } else {
                    // No bot message exists, create one
                    const createdMessage = await existingThread.send(challengeInfo);
                    threadInfoMessageCache.set(existingThread.id, createdMessage.id);
                    updatedMessages++;
                    console.log(`Created first message in thread: ${existingThread.name}`);
                }
            } catch (error) {
                errors.push(`${challenge.name}: ${error}`);
                console.error(`Failed to process thread for ${challenge.name}:`, error);
            }
        }

        console.log(`Thread processing complete: ${createdThreads} threads created, ${updatedMessages} messages updated`);
        if (errors.length > 0) {
            console.warn(`Thread processing errors:`, errors);
        }
        return { updatedMessages, createdThreads, errors, skippedThreads };
    } catch (error) {
        console.error("Error updating thread status:", error);
        throw error;
    }
}
