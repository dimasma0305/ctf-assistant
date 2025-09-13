import { TextChannel, ThreadAutoArchiveDuration } from "discord.js";
import { solveModel } from "../../../../Database/connect";

// Generic challenge interface for different platforms
export interface ParsedChallenge {
    id: string | number;
    name: string;
    category: string;
    points: number;
    solves: number;
    solved: boolean;
    tags?: string[];
}

// Interface for CTFd challenge format
interface CTFdChallenge {
    id: number;
    type: string;
    name: string;
    value: number;
    solves: number;
    solved_by_me: boolean;
    category: string;
    tags: Array<{ value: string }>;
    template: string;
    script: string;
}

// Interface for CTFd API response
interface CTFdResponse {
    success: boolean;
    data: CTFdChallenge[];
}

// Helper function to validate and sanitize parsed challenge data
function validateAndSanitizeChallenge(challenge: any, index: number): ParsedChallenge {
    // Ensure required fields have valid values
    const id = challenge.id || index + 1;
    const name = String(challenge.name || `Challenge ${index + 1}`).trim();
    const category = String(challenge.category || 'misc').toLowerCase().trim();
    const points = Math.max(0, parseInt(String(challenge.points || 0)) || 0);
    const solves = Math.max(0, parseInt(String(challenge.solves || 0)) || 0);
    const solved = Boolean(challenge.solved);
    const tags = Array.isArray(challenge.tags) ? challenge.tags.filter((tag: any) => tag && String(tag).trim()) : [];
    
    // Validate that name is not empty
    if (!name || name === `Challenge ${index + 1}` && !challenge.name) {
        throw new Error(`Challenge at index ${index} has no valid name`);
    }
    
    return {
        id,
        name,
        category,
        points,
        solves,
        solved,
        tags
    };
}

// Parse challenges based on platform type
export async function parseChallenges(jsonData: string, platform: string): Promise<ParsedChallenge[]> {
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
    
    switch (platform.toLowerCase()) {
        case 'ctfd':
            return parseCTFdChallenges(data);
        case 'rctf':
            return parseRCTFChallenges(data);
        case 'gzctf':
            return parseGzCTFChallenges(data);
        case 'picoctf':
            return parsePicoCTFChallenges(data);
        case 'generic':
            return parseGenericChallenges(data);
        default:
            try {
                return parseGenericChallenges(data);
            } catch (error) {
                try {
                    return parseCTFdChallenges(data);
                } catch (error) {
                    try {
                        return parseRCTFChallenges(data);
                    } catch (error) {
                        try {
                            return parseGzCTFChallenges(data);
                        } catch (error) {
                            try {
                                return parsePicoCTFChallenges(data);
                            } catch (error) {
                                try {
                                    return parse07CTFChallenges(data);
                                } catch (error) {
                                    throw new Error(`Invalid response format - unable to parse with any known CTF platform format. Last error: ${error instanceof Error ? error.message : 'Unknown error'}`);
                                }
                            }
                        }
                    }
                }
            }
    }
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

// Parse CTFd format
function parseCTFdChallenges(data: CTFdResponse): ParsedChallenge[] {
    if (!data.success || !Array.isArray(data.data)) {
        throw new Error('Invalid CTFd response format');
    }
    
    return data.data.map((challenge, index) => validateAndSanitizeChallenge({
        id: challenge.id,
        name: challenge.name,
        category: challenge.category,
        points: challenge.value,
        solves: challenge.solves,
        solved: challenge.solved_by_me,
        tags: challenge.tags?.map(tag => tag.value) || []
    }, index));
}

// Parse rCTF format 
function parseRCTFChallenges(data: any): ParsedChallenge[] {
    // rCTF can return data in different formats:
    // 1. Direct array of challenges
    // 2. Object with challenges property
    // 3. Object with data property containing challenges
    let challenges: any[];
    
    if (Array.isArray(data)) {
        challenges = data;
    } else if (data.challenges && Array.isArray(data.challenges)) {
        challenges = data.challenges;
    } else if (data.data && Array.isArray(data.data)) {
        challenges = data.data;
    } else if (data.challs && Array.isArray(data.challs)) {
        challenges = data.challs;
    } else {
        throw new Error('Invalid rCTF response format - expected array of challenges or object with challenges/data/challs property');
    }
    
    return challenges.map((challenge: any, index: number) => {
        // rCTF typically uses these field names
        const id = challenge.id || challenge._id || challenge.chall_id || index + 1;
        const name = challenge.name || challenge.title || challenge.chall_name || `Challenge ${index + 1}`;
        const category = challenge.category || challenge.genre || challenge.type || 'misc';
        const points = challenge.points || challenge.value || challenge.score || challenge.weight || 0;
        const solves = challenge.solves || challenge.solve_count || challenge.num_solves || 0;
        const solved = challenge.solved || challenge.is_solved || challenge.solved_by_me || false;
        const tags = challenge.tags || challenge.hints || [];
        
        return validateAndSanitizeChallenge({
            id,
            name,
            category,
            points,
            solves,
            solved,
            tags: Array.isArray(tags) ? tags : []
        }, index);
    });
}

// Parse GzCTF format
function parseGzCTFChallenges(data: any): ParsedChallenge[] {
    // GzCTF can return data in multiple formats:
    // 1. Direct array of challenges
    // 2. Object with 'data' property containing challenges
    // 3. Object with 'challenges' property
    // 4. Object with 'result' property containing challenges
    let challenges: any[];
    
    if (Array.isArray(data)) {
        challenges = data;
    } else if (data.data && Array.isArray(data.data)) {
        challenges = data.data;
    } else if (data.challenges && Array.isArray(data.challenges)) {
        challenges = data.challenges;
    } else if (data.result && Array.isArray(data.result)) {
        challenges = data.result;
    } else {
        throw new Error('Invalid GzCTF response format - expected array of challenges or object with data/challenges/result property');
    }
    
    return challenges.map((challenge: any, index: number) => {
        // GzCTF uses various field names depending on version
        const id = challenge.id || challenge.challengeId || challenge.Id || index + 1;
        const name = challenge.title || challenge.name || challenge.challengeName || `Challenge ${index + 1}`;
        const category = challenge.category || challenge.type || challenge.categoryName || 'misc';
        
        // GzCTF can have different point calculation methods
        const points = challenge.originalScore || 
                      challenge.minScore || 
                      challenge.points || 
                      challenge.score || 
                      challenge.value || 
                      challenge.baseScore || 0;
        
        const solves = challenge.acceptedCount || 
                      challenge.solvedCount || 
                      challenge.solved || 
                      challenge.solves || 
                      challenge.submissionCount || 0;
        
        const solved = challenge.isSolved || 
                      challenge.solved_by_me || 
                      challenge.solved || 
                      challenge.status === 'solved' ||
                      challenge.isAccepted || false;
        
        // Tags can be in different formats
        let tags: string[] = [];
        if (challenge.tags && Array.isArray(challenge.tags)) {
            tags = challenge.tags.map((tag: any) => 
                typeof tag === 'string' ? tag : (tag.name || tag.value || String(tag))
            );
        } else if (challenge.hints && Array.isArray(challenge.hints)) {
            tags = challenge.hints;
        }
        
        return validateAndSanitizeChallenge({
            id,
            name,
            category,
            points,
            solves,
            solved,
            tags
        }, index);
    });
}

// Parse picoCTF format
function parsePicoCTFChallenges(data: any): ParsedChallenge[] {
    let challenges: any[];
    
    if (Array.isArray(data)) {
        challenges = data;
    } else if (data.problems && Array.isArray(data.problems)) {
        challenges = data.problems;
    } else if (data.data && Array.isArray(data.data)) {
        challenges = data.data;
    } else if (data.challenges && Array.isArray(data.challenges)) {
        challenges = data.challenges;
    } else {
        throw new Error('Invalid picoCTF response format - expected array of problems or object with problems/data/challenges property');
    }
    
    return challenges.map((challenge: any, index: number) => {
        // picoCTF field mappings
        const id = challenge.id || 
                  challenge.pid || 
                  challenge.problem_id || 
                  index + 1;
                  
        const name = challenge.name || 
                    challenge.title || 
                    challenge.problem_name || 
                    `Challenge ${index + 1}`;
                    
        const category = challenge.category || 
                        challenge.genre || 
                        challenge.type || 
                        'misc';
                        
        const points = challenge.points || 
                      challenge.value || 
                      challenge.score || 
                      challenge.worth || 0;
                      
        const solves = challenge.solves || 
                      challenge.solve_count || 
                      challenge.num_solves || 
                      challenge.solved_by || 0;
                      
        const solved = challenge.solved || 
                      challenge.solved_by_me || 
                      challenge.is_solved || 
                      challenge.status === 'solved' || false;
                      
        // Handle hints as tags
        let tags: string[] = [];
        if (challenge.hints && Array.isArray(challenge.hints)) {
            tags = challenge.hints;
        } else if (challenge.tags && Array.isArray(challenge.tags)) {
            tags = challenge.tags;
        }
        
        return validateAndSanitizeChallenge({
            id,
            name,
            category,
            points,
            solves,
            solved,
            tags
        }, index);
    });
}

// Parse generic format - handles multiple common formats
function parseGenericChallenges(data: any): ParsedChallenge[] {
    let challenges: any[];
    
    if (Array.isArray(data)) {
        challenges = data;
    } else if (data.data && Array.isArray(data.data)) {
        challenges = data.data;
    } else if (data.challenges && Array.isArray(data.challenges)) {
        challenges = data.challenges;
    } else if (data.challs && Array.isArray(data.challs)) {
        challenges = data.challs;
    } else if (data.problems && Array.isArray(data.problems)) {
        challenges = data.problems;
    } else if (data.tasks && Array.isArray(data.tasks)) {
        challenges = data.tasks;
    } else if (data.items && Array.isArray(data.items)) {
        challenges = data.items;
    } else {
        throw new Error('Generic format expects an array of challenges or object with data/challenges/challs/problems/tasks/items property');
    }
    
    return challenges.map((challenge: any, index: number) => {
        // Try to map common field variations
        const id = challenge.id || 
                  challenge._id || 
                  challenge.challengeId || 
                  challenge.problem_id || 
                  challenge.task_id || 
                  index + 1;
                  
        const name = challenge.name || 
                    challenge.title || 
                    challenge.problem_name || 
                    challenge.task_name || 
                    challenge.challenge_name || 
                    `Challenge ${index + 1}`;
                    
        const category = challenge.category || 
                        challenge.type || 
                        challenge.genre || 
                        challenge.topic || 
                        challenge.section || 
                        'misc';
                        
        const points = challenge.points || 
                      challenge.value || 
                      challenge.score || 
                      challenge.weight || 
                      challenge.difficulty || 
                      challenge.worth || 0;
                      
        const solves = challenge.solves || 
                      challenge.solve_count || 
                      challenge.solved_count || 
                      challenge.submissions || 
                      challenge.completions || 
                      challenge.num_solves || 0;
                      
        const solved = challenge.solved || 
                      challenge.solved_by_me || 
                      challenge.is_solved || 
                      challenge.completed || 
                      challenge.status === 'solved' || 
                      challenge.status === 'complete' || false;
                      
        // Handle tags in various formats
        let tags: string[] = [];
        if (challenge.tags && Array.isArray(challenge.tags)) {
            tags = challenge.tags.map((tag: any) => 
                typeof tag === 'string' ? tag : (tag.name || tag.value || tag.tag || String(tag))
            );
        } else if (challenge.hints && Array.isArray(challenge.hints)) {
            tags = challenge.hints;
        } else if (challenge.keywords && Array.isArray(challenge.keywords)) {
            tags = challenge.keywords;
        } else if (typeof challenge.tags === 'string') {
            // Handle comma-separated tags
            tags = challenge.tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0);
        }
        
        return validateAndSanitizeChallenge({
            id,
            name,
            category,
            points,
            solves,
            solved,
            tags
        }, index);
    });
}

// Parse 07CTF format
function parse07CTFChallenges(data: any): ParsedChallenge[] {
    // 07CTF returns data with challenges array
    let challenges: any[];
    
    if (data.challenges && Array.isArray(data.challenges)) {
        challenges = data.challenges;
    } else if (Array.isArray(data)) {
        challenges = data;
    } else {
        throw new Error('Invalid 07CTF response format - expected object with challenges array or direct array');
    }
    
    return challenges.map((challenge: any, index: number) => {
        // 07CTF field mappings
        const id = challenge.id || index + 1;
        const name = challenge.title || `Challenge ${index + 1}`;
        const category = challenge.category || 'misc';
        
        // Dynamic points calculation: start at 500, reduce by 10 per solve, minimum 100
        const solveCount = challenge.solve_count || 0;
        const points = Math.max(100, 500 - (solveCount * 10));
        
        const solves = solveCount;
        const solved = challenge.solved || false;
        
        // No specific tags in 07CTF format, but we can derive from difficulty
        const tags: string[] = [];
        if (challenge.difficulty) {
            tags.push(challenge.difficulty.toLowerCase());
        }
        
        return validateAndSanitizeChallenge({
            id,
            name,
            category,
            points,
            solves,
            solved,
            tags
        }, index);
    });
}
