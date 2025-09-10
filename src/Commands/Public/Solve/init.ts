import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, TextChannel, ThreadAutoArchiveDuration } from "discord.js";
import { CTFEvent } from "../../../Functions/ctftime-v2";
import { solveModel } from "../../../Database/connect";

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

// Generic challenge interface for different platforms
interface ParsedChallenge {
    id: string | number;
    name: string;
    category: string;
    points: number;
    solves: number;
    solved: boolean;
    tags?: string[];
}

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('init')
        .setDescription('Initialize challenges from CTF platform JSON (creates threads with ❌ prefix)')
        .addStringOption(option => option
            .setName("json")
            .setDescription("JSON data from CTF platform (CTFd format)")
            .setRequired(true)
        )
        .addStringOption(option => option
            .setName("platform")
            .setDescription("CTF platform type")
            .setRequired(false)
            .addChoices(
                { name: 'CTFd', value: 'ctfd' },
                { name: 'rCTF', value: 'rctf' },
                { name: 'Generic', value: 'generic' }
            )
        ),
    async execute(interaction, _client) {
        await interaction.deferReply({ flags: ["Ephemeral"] });
        
        const channel = interaction.channel;
        if (!channel || !(channel instanceof TextChannel)) {
            await interaction.editReply("This command can only be used in a text channel.");
            return;
        }

        const jsonData = interaction.options.getString("json", true);
        const platform = interaction.options.getString("platform") || "ctfd";

        // Parse channel topic to get CTF event data
        let ctfData: CTFEvent;
        try {
            ctfData = JSON.parse(channel.topic || "{}") as CTFEvent;
            if (!ctfData.id) {
                await interaction.editReply("This channel does not have a valid CTF event associated with it.");
                return;
            }
        } catch (error) {
            await interaction.editReply("Failed to parse channel topic. Make sure this is a CTF event channel.");
            return;
        }

        // Parse challenges based on platform
        let challenges: ParsedChallenge[];
        try {
            challenges = await parseChallenges(jsonData, platform);
        } catch (error) {
            await interaction.editReply(`Failed to parse JSON data: ${error}`);
            return;
        }

        if (challenges.length === 0) {
            await interaction.editReply("No challenges found in the provided JSON data.");
            return;
        }

        // Get existing solves from database
        const existingSolves = await solveModel.find({ ctf_id: ctfData.id });
        const solvedChallenges = new Set(existingSolves.filter(solve => solve.challenge).map(solve => solve.challenge!.toLowerCase()));

        // Group challenges by category
        const challengesByCategory = challenges.reduce((acc, challenge) => {
            const category = challenge.category || 'misc';
            if (!acc[category]) {
                acc[category] = [];
            }
            acc[category].push(challenge);
            return acc;
        }, {} as Record<string, ParsedChallenge[]>);

        let createdThreads = 0;
        let skippedThreads = 0;
        const errors: string[] = [];

        // Create threads for each challenge
        for (const [category, categoryChallenges] of Object.entries(challengesByCategory)) {
            // Sort challenges by points (ascending)
            const sortedChallenges = categoryChallenges.sort((a, b) => a.points - b.points);
            
            for (const challenge of sortedChallenges) {
                try {
                    // Determine prefix based on solve status
                    const isSolved = solvedChallenges.has(challenge.name.toLowerCase());
                    const prefix = isSolved ? '✅' : '❌';
                    
                    // Format thread name: "❌ [Category] Challenge Name"
                    const threadName = `${prefix} [${category.toUpperCase()}] ${challenge.name}`;
                    
                    // Check if thread already exists
                    const existingThread = channel.threads.cache.find(thread => 
                        thread.name === threadName || 
                        thread.name === `✅ [${category.toUpperCase()}] ${challenge.name}` ||
                        thread.name === `❌ [${category.toUpperCase()}] ${challenge.name}`
                    );
                    
                    if (existingThread) {
                        skippedThreads++;
                        continue;
                    }

                    // Create thread
                    const thread = await channel.threads.create({
                        name: threadName,
                        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
                        reason: `CTF Challenge: ${challenge.name} (${category})`
                    });

                    // Send initial message with challenge info
                    const challengeInfo = [
                        `# ${challenge.name}`,
                        `**Category:** ${category}`,
                        `**Points:** ${challenge.points}`,
                        `**Solves:** ${challenge.solves}`,
                        challenge.tags && challenge.tags.length > 0 ? `**Tags:** ${challenge.tags.join(', ')}` : '',
                        '',
                        '💡 **Use this thread to discuss and solve this challenge!**',
                        '📝 When solved, use `/solve challenge` to mark it as complete.',
                        '',
                        '---',
                        `*Challenge ID: ${challenge.id}*`
                    ].filter(line => line !== '').join('\n');

                    await thread.send(challengeInfo);
                    createdThreads++;
                    
                } catch (error) {
                    errors.push(`${challenge.name}: ${error}`);
                    console.error(`Failed to create thread for ${challenge.name}:`, error);
                }
            }
        }

        // Summary message
        const summary = [
            `✅ **Challenge Initialization Complete!**`,
            '',
            `📊 **Summary:**`,
            `• Created: ${createdThreads} threads`,
            `• Skipped (already exist): ${skippedThreads} threads`,
            `• Total challenges: ${challenges.length}`,
            '',
            `📂 **Categories processed:**`,
            Object.keys(challengesByCategory).map(cat => `• ${cat}: ${challengesByCategory[cat].length} challenges`).join('\n')
        ];

        if (errors.length > 0) {
            summary.push('', '⚠️ **Errors encountered:**');
            summary.push(...errors.slice(0, 5).map(error => `• ${error}`));
            if (errors.length > 5) {
                summary.push(`• ... and ${errors.length - 5} more errors`);
            }
        }

        await interaction.editReply(summary.join('\n'));
    },
};

// Parse challenges based on platform type
async function parseChallenges(jsonData: string, platform: string): Promise<ParsedChallenge[]> {
    const data = JSON.parse(jsonData);
    
    switch (platform.toLowerCase()) {
        case 'ctfd':
            return parseCTFdChallenges(data);
        case 'rctf':
            return parseRCTFChallenges(data);
        case 'generic':
            return parseGenericChallenges(data);
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }
}

// Parse CTFd format
function parseCTFdChallenges(data: CTFdResponse): ParsedChallenge[] {
    if (!data.success || !Array.isArray(data.data)) {
        throw new Error('Invalid CTFd response format');
    }
    
    return data.data.map(challenge => ({
        id: challenge.id,
        name: challenge.name,
        category: challenge.category,
        points: challenge.value,
        solves: challenge.solves,
        solved: challenge.solved_by_me,
        tags: challenge.tags?.map(tag => tag.value)
    }));
}

// Parse rCTF format (placeholder - add actual format when needed)
function parseRCTFChallenges(data: any): ParsedChallenge[] {
    // TODO: Implement rCTF parsing when format is provided
    throw new Error('rCTF format parsing not yet implemented');
}

// Parse generic format (placeholder - add actual format when needed)  
function parseGenericChallenges(data: any): ParsedChallenge[] {
    // TODO: Implement generic parsing when format is provided
    // Expected format: array of challenges with name, category, points, etc.
    if (!Array.isArray(data)) {
        throw new Error('Generic format expects an array of challenges');
    }
    
    return data.map((challenge: any, index: number) => ({
        id: challenge.id || index + 1,
        name: challenge.name || `Challenge ${index + 1}`,
        category: challenge.category || 'misc',
        points: challenge.points || challenge.value || 0,
        solves: challenge.solves || 0,
        solved: challenge.solved || false,
        tags: challenge.tags || []
    }));
}
