import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, TextChannel, ThreadAutoArchiveDuration } from "discord.js";
import { CTFEvent, infoEvent } from "../../../Functions/ctftime-v2";
import { solveModel } from "../../../Database/connect";
import { parseChallenges, ParsedChallenge } from "./utils/parser";
import { parseFetchCommand, ParsedFetchCommand, saveFetchCommand } from "./utils/init";

// Moved to challengeUtils.ts

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('init')
        .setDescription('Initialize challenges from CTF platform JSON (creates threads with ❌ prefix)')
        .addStringOption(option => option
            .setName("json")
            .setDescription("JSON data from CTF platform API endpoint (optional if fetch_command is provided)")
            .setRequired(false)
        )
        .addStringOption(option => option
            .setName("platform")
            .setDescription("CTF platform type (default: ctfd)")
            .setRequired(false)
            .addChoices(
                { name: 'CTFd', value: 'ctfd' },
                { name: 'rCTF', value: 'rctf' },
                { name: 'GzCTF', value: 'gzctf' },
                { name: 'picoCTF', value: 'picoctf' },
                { name: 'Generic', value: 'generic' }
            )
        )
        .addStringOption(option => option
            .setName("fetch_command")
            .setDescription("JavaScript fetch command to run every 5 minutes for auto-updates (optional)")
            .setRequired(false)
        ),
    async execute(interaction, _client) {
        await interaction.deferReply({ flags: ["Ephemeral"] });
        
        const channel = interaction.channel;
        if (!channel || !(channel instanceof TextChannel)) {
            await interaction.editReply("This command can only be used in a text channel.");
            return;
        }

        const jsonData = interaction.options.getString("json");
        const platform = interaction.options.getString("platform") || "";
        const fetchCommand = interaction.options.getString("fetch_command");

        // Validate that either JSON data or fetch command is provided
        if (!jsonData && !fetchCommand) {
            await interaction.editReply("❌ You must provide either `json` data or a `fetch_command`.");
            return;
        }

        // Parse channel topic to get CTF event data
        let ctfData: CTFEvent;
        try {
            const id = JSON.parse(channel.topic || "{}").id;

            if (!id) {
                await interaction.editReply("This channel does not have a valid CTF event associated with it.");
                return;
            }

            ctfData = await infoEvent(id);
            if (!ctfData.id) {
                await interaction.editReply("This channel does not have a valid CTF event associated with it.");
                return;
            }
        } catch (error) {
            await interaction.editReply("Failed to parse channel topic. Make sure this is a CTF event channel.");
            return;
        }

        // Get JSON data either from user input or fetch command
        let finalJsonData: string;
        let parsedFetch: ParsedFetchCommand | null = null;
        
        if (fetchCommand) {
            try {
                // Parse and execute the fetch command to get JSON data
                parsedFetch = parseFetchCommand(fetchCommand);
                
                // Execute the fetch command
                const response = await fetch(parsedFetch.url, {
                    method: parsedFetch.method,
                    headers: parsedFetch.headers as any,
                    body: parsedFetch.body || undefined
                });

                if (!response.ok) {
                    await interaction.editReply(`❌ Fetch command failed: ${response.status} ${response.statusText}`);
                    return;
                }

                finalJsonData = await response.text();
                
                // Use provided JSON data as fallback if fetch fails to return data
                if (!finalJsonData.trim() && jsonData) {
                    finalJsonData = jsonData;
                }
            } catch (error) {
                if (jsonData) {
                    // Fallback to provided JSON data if fetch fails
                    finalJsonData = jsonData;
                    await interaction.followUp({ 
                        content: `⚠️ Fetch command failed (${error}), using provided JSON data as fallback.`, 
                        ephemeral: true 
                    });
                } else {
                    await interaction.editReply(`❌ Fetch command failed and no JSON fallback provided: ${error}`);
                    return;
                }
            }
        } else {
            finalJsonData = jsonData!; // We know it exists due to validation above
        }

        // Parse challenges based on platform
        let challenges: ParsedChallenge[];
        try {
            challenges = await parseChallenges(finalJsonData, platform);
        } catch (error) {
            await interaction.editReply(`❌ Failed to parse JSON data: ${error}`);
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
        
        // Handle fetch command if provided - save it for periodic updates
        if (fetchCommand && parsedFetch) {
            try {
                await saveFetchCommand(parsedFetch, ctfData, channel.id, platform);
                await interaction.followUp({ 
                    content: "✅ Auto-update fetch command saved! The bot will now fetch updates every 5 minutes until the CTF ends.", 
                    ephemeral: true 
                });
            } catch (error) {
                await interaction.followUp({ 
                    content: `⚠️ Failed to save fetch command for auto-updates: ${error}`, 
                    ephemeral: true 
                });
            }
        }
    },
};

