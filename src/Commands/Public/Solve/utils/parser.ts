import { TextChannel } from "discord.js";
import { solveModel } from "../../../../Database/connect";
import { ParsedChallenge } from './parsers/types';
import fg from 'fast-glob';
import path from 'path';

export * from './parsers/types';

const currentScriptPath = import.meta.path;
const currentScriptDir = path.dirname(currentScriptPath);
const parsers = fg.sync(`${currentScriptDir}/parsers/*.ts`);
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
        throw new Error(`Invalid JSON data: ${error instanceof Error ? error.message : 'Unable to parse JSON'}`);
    }
    
    // Validate that data is not null or undefined
    if (data === null || data === undefined) {
        throw new Error('JSON data is null or undefined');
    }

    for (const parser of parserFunctions) {
        try {
            if (parser) {   
                return parser(data);
            }
        } catch (error) {
            console.error(error);
            continue;
        }
    }
    throw new Error('No parser found for the given data');
}

// Update thread status based on solved challenges
export async function updateThreadStatus(challenges: ParsedChallenge[], channel: TextChannel, ctfId: string) {
    try {
        // Get existing solves from database
        const existingSolves = await solveModel.find({ ctf_id: ctfId });
        const solvedChallenges = new Set(existingSolves.filter(solve => solve.challenge).map(solve => solve.challenge!.toLowerCase()));

        let updatedMessages = 0;
        const errors: string[] = [];

        for (const challenge of challenges) {
            try {
                const isSolved = solvedChallenges.has(challenge.name.toLowerCase());
                const category = challenge.category.toUpperCase();

                // Find existing thread with any prefix
                const existingThread = channel.threads.cache.find(thread => {
                    const threadNameWithoutPrefix = thread.name.replace(/^[✅❌]\s*/, '');
                    const expectedName = `[${category}] ${challenge.name}`;
                    return threadNameWithoutPrefix === expectedName;
                });

                if (existingThread) {
                    // Fetch starter message
                    const starter = await existingThread.fetchStarterMessage();

                    // Fetch oldest messages (after the starter ID)
                    const messages = await existingThread.messages.fetch({
                        limit: 1,
                        after: starter?.id,
                    });
                    const firstMessage = messages.first();
                    if (firstMessage && firstMessage.author.bot) {
                        // Create updated challenge info
                        const solveStatus = isSolved ? '🎉 **SOLVED!** 🎉' : '🔍 **Unsolved**';
                        const challengeInfo = [
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
                        ].filter(line => line !== '').join('\n');

                        // Check if the message content needs updating
                        if (firstMessage.content !== challengeInfo) {
                            await firstMessage.edit(challengeInfo);
                            updatedMessages++;
                            console.log(`Updated first message in thread: ${existingThread.name}`);
                        }
                    }
                }
            } catch (error) {
                errors.push(`${challenge.name}: ${error}`);
                console.error(`Failed to update thread message for ${challenge.name}:`, error);
            }
        }

        console.log(`Thread message update complete: ${updatedMessages} messages updated`);
        if (errors.length > 0) {
            console.warn(`Thread update errors:`, errors);
        }
        
    } catch (error) {
        console.error("Error updating thread status:", error);
        throw error;
    }
}