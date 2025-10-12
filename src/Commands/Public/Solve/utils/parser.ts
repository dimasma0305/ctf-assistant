import { TextChannel } from "discord.js";
import { ChallengeSchemaType, solveModel, ChallengeModel } from "../../../../Database/connect";
import { ParsedChallenge } from './parsers/types';
import fg from 'fast-glob';
import path from 'path';

export * from './parsers/types';

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
    try {
        data = JSON.parse(jsonData);
    } catch (error) {
        data = jsonData;
    }
    
    for (const parser of parserFunctions) {
        try {
            if (parser) {
                return parser(data);
            }
        } catch (error) {
            continue;
        }
    }
    throw new Error('No parser found for the given data');
}

// Update thread status based on solved challenges
export async function updateThreadsStatus(challenges: ParsedChallenge[], channel: TextChannel, ctfId: number) {
    try {
        // Get all solved challenges for this CTF using the solve schema (more reliable than challenge.is_solved)
        // This directly queries the solve schema to determine which challenges have been solved
        const solvedChallengeNames = await getSolvedChallenges(ctfId.toString());
        const solvedChallenges = new Set(solvedChallengeNames.map(name => name.toLowerCase()));

        let updatedMessages = 0;
        let createdThreads = 0;
        const errors: string[] = [];
        let skippedThreads = 0;

        for (const challenge of challenges) {
            try {
                // Check if challenge is solved using the solve schema (more reliable than challenge.is_solved)
                const isSolved = solvedChallenges.has(challenge.name.toLowerCase());
                const category = challenge.category.toUpperCase();
                const expectedName = `[${category}] ${challenge.name}`;
                const threadPrefix = isSolved ? '✅' : '❌';
                const threadName = `${threadPrefix} ${expectedName}`;

                // Find existing thread with any prefix
                let existingThread = channel.threads.cache.find(thread => {
                    const threadNameWithoutPrefix = thread.name.replace(/^[✅❌]\s*/, '');
                    return threadNameWithoutPrefix === expectedName;
                });

                // If thread doesn't exist, create it
                if (!existingThread) {
                    existingThread = await channel.threads.create({
                        name: threadName,
                        autoArchiveDuration: 10080, // 7 days
                        reason: `CTF Challenge thread for ${challenge.name}`
                    });
                    createdThreads++;
                    console.log(`Created new thread: ${threadName}`);
                } else {
                    skippedThreads++;
                }

                // Update thread name if status changed
                if (existingThread.name !== threadName) {
                    await existingThread.setName(threadName);
                    console.log(`Updated thread name from ${existingThread.name} to ${threadName}`);
                }

                // Handle the challenge info message
                const starter = await existingThread.fetchStarterMessage();

                // Fetch oldest messages (after the starter ID)
                const messages = await existingThread.messages.fetch({
                    limit: 1,
                    after: starter?.id,
                });
                const firstMessage = messages.first();

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

                if (firstMessage && firstMessage.author.bot) {
                    // Check if the message content needs updating
                    if (firstMessage.content !== challengeInfo) {
                        await firstMessage.edit(challengeInfo);
                        updatedMessages++;
                        console.log(`Updated first message in thread: ${existingThread.name}`);
                    }
                } else {
                    // No bot message exists, create one
                    await existingThread.send(challengeInfo);
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