import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, TextChannel, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder, ChatInputCommandInteraction, ModalSubmitInteraction } from "discord.js";
import { CTFEvent, infoEvent } from "../../../Functions/ctftime-v2";
import { parseChallenges, ParsedChallenge, parseFetchCommand, ParsedFetchCommand, saveFetchCommand, updateThreadsStatus } from "./utils";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('init')
        .setDescription('Initialize challenges from CTF platform JSON (creates threads with ❌ prefix)')
        .addStringOption(option => option
            .setName("fetch_command")
            .setDescription("JavaScript fetch command to run every 5 minutes for auto-updates (optional)")
            .setRequired(false)
        )
        .addAttachmentOption(option => option
            .setName("json_file")
            .setDescription("Upload a JSON file containing challenge data (alternative to modal input)")
            .setRequired(false)
        ),
    async execute(interaction, _client) {
        let finalJsonData: string | null = null;
        let currentInteraction: ChatInputCommandInteraction | ModalSubmitInteraction = interaction;
        
        const channel = interaction.channel;
        if (!channel || !(channel instanceof TextChannel)) {
            await interaction.reply({ content: "This command can only be used in a text channel.", ephemeral: true });
            return;
        }

        const fetchCommand = interaction.options.getString("fetch_command");
        const jsonFile = interaction.options.getAttachment("json_file");

        // Priority: File upload > Fetch command > Modal input
        if (jsonFile) {
            await interaction.deferReply({ ephemeral: true });
            
            // Validate file type
            if (!jsonFile.name.endsWith('.json') && !jsonFile.name.endsWith('.txt')) {
                await interaction.editReply("❌ Please upload a .json or .txt file containing the JSON data.");
                return;
            }

            // Validate file size (Discord limit is 25MB for nitro, 8MB for regular users)
            if (jsonFile.size > 25 * 1024 * 1024) {
                await interaction.editReply("❌ File is too large. Maximum file size is 25MB.");
                return;
            }

            try {
                const response = await fetch(jsonFile.url);
                if (!response.ok) {
                    await interaction.editReply(`❌ Failed to download file: ${response.status} ${response.statusText}`);
                    return;
                }
                
                finalJsonData = await response.text();
                
                if (!finalJsonData.trim()) {
                    await interaction.editReply("❌ The uploaded file is empty.");
                    return;
                }
            } catch (error) {
                await interaction.editReply(`❌ Failed to read file: ${error}`);
                return;
            }
        } else if (fetchCommand) {
            await interaction.deferReply({ ephemeral: true });
            // Handle fetch command (existing code)
        } else {
            // Show modal with multiple inputs for large JSON
            const modal = new ModalBuilder()
                .setCustomId('json_data_modal')
                .setTitle('CTF Platform JSON Data');

            // Create multiple text inputs for larger data
            const jsonInput1 = new TextInputBuilder()
                .setCustomId('json_data_input_1')
                .setLabel('JSON Data (Part 1/3)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Paste the first part of your JSON data here...')
                .setRequired(true)
                .setMaxLength(4000);

            const jsonInput2 = new TextInputBuilder()
                .setCustomId('json_data_input_2')
                .setLabel('JSON Data (Part 2/3) - Optional')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Continue your JSON data here if it was too long...')
                .setRequired(false)
                .setMaxLength(4000);

            const jsonInput3 = new TextInputBuilder()
                .setCustomId('json_data_input_3')
                .setLabel('JSON Data (Part 3/3) - Optional')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Final part of your JSON data...')
                .setRequired(false)
                .setMaxLength(4000);

            const actionRow1 = new ActionRowBuilder<TextInputBuilder>().addComponents(jsonInput1);
            const actionRow2 = new ActionRowBuilder<TextInputBuilder>().addComponents(jsonInput2);
            const actionRow3 = new ActionRowBuilder<TextInputBuilder>().addComponents(jsonInput3);
            
            modal.addComponents(actionRow1, actionRow2, actionRow3);

            await interaction.showModal(modal);

            try {
                const modalSubmitInteraction = await interaction.awaitModalSubmit({
                    time: 300000, // 5 minutes timeout
                    filter: (i) => i.user.id === interaction.user.id && i.customId === 'json_data_modal'
                });

                const jsonPart1 = modalSubmitInteraction.fields.getTextInputValue('json_data_input_1');
                const jsonPart2 = modalSubmitInteraction.fields.getTextInputValue('json_data_input_2') || '';
                const jsonPart3 = modalSubmitInteraction.fields.getTextInputValue('json_data_input_3') || '';
                
                // Combine all parts
                const combinedJson = (jsonPart1 + jsonPart2 + jsonPart3).trim();
                
                if (!combinedJson) {
                    await modalSubmitInteraction.reply({ 
                        content: "❌ No JSON data provided. Command cancelled.", 
                        ephemeral: true 
                    });
                    return;
                }
                
                finalJsonData = combinedJson;
                
                await modalSubmitInteraction.deferReply({ ephemeral: true });
                currentInteraction = modalSubmitInteraction;
                
            } catch (error) {
                return;
            }
        }

        // Parse channel topic to get CTF event data
        let ctfData: CTFEvent;
        try {
            const id = JSON.parse(channel.topic || "{}").id;

            if (!id) {
                await currentInteraction.editReply("This channel does not have a valid CTF event associated with it.");
                return;
            }

            ctfData = await infoEvent(id, false);
            if (!ctfData.id) {
                await currentInteraction.editReply("This channel does not have a valid CTF event associated with it.");
                return;
            }
        } catch (error) {
            await currentInteraction.editReply("Failed to parse channel topic. Make sure this is a CTF event channel.");
            return;
        }

        // Handle fetch command if provided
        let parsedFetch: ParsedFetchCommand | null = null;
        
        if (fetchCommand && !finalJsonData) {
            try {
                parsedFetch = parseFetchCommand(fetchCommand);
                
                const response = await fetch(parsedFetch.url, {
                    method: parsedFetch.method,
                    headers: parsedFetch.headers,
                    body: parsedFetch.body
                });

                await saveFetchCommand(parsedFetch, ctfData, channel.id);

                if (!response.ok) {
                    await currentInteraction.editReply(`❌ Fetch command failed: ${response.status} ${response.statusText}`);
                    return;
                }

                finalJsonData = await response.text();
                
                if (!finalJsonData.trim()) {
                    await currentInteraction.editReply("❌ Fetch command returned empty data.");
                    return;
                }
            } catch (error) {
                await currentInteraction.editReply(`❌ Fetch command failed: ${error}`);
                return;
            }
        }

        // Validate that we have JSON data before proceeding
        if (!finalJsonData || !finalJsonData.trim()) {
            await currentInteraction.editReply("❌ No valid JSON data obtained. Please provide JSON data via file upload, fetch command, or modal input.");
            return;
        }

        // Parse challenges based on platform
        let challenges: ParsedChallenge[];
        try {
            challenges = await parseChallenges(finalJsonData);
        } catch (error) {
            await currentInteraction.editReply(`❌ Failed to parse JSON data: ${error}`);
            return;
        }

        if (challenges.length === 0) {
            await currentInteraction.editReply("No challenges found in the provided JSON data.");
            return;
        }

        const { updatedMessages, createdThreads, errors, skippedThreads } = await updateThreadsStatus(challenges, channel, ctfData.id);

        // Summary message
        const summary = [
            `✅ **Challenge Initialization Complete!**`,
            '',
            `📊 **Summary:**`,
            `• Created: ${createdThreads} new threads`,
            `• Updated: ${updatedMessages} messages`,
            `• Skipped (already exist): ${skippedThreads} threads`,
            `• Total challenges: ${challenges.length}`,
        ];

        if (errors.length > 0) {
            summary.push('', '⚠️ **Errors encountered:**');
            summary.push(...errors.slice(0, 5).map(error => `• ${error}`));
            if (errors.length > 5) {
                summary.push(`• ... and ${errors.length - 5} more errors`);
            }
        }

        await currentInteraction.editReply(summary.join('\n'));
        
        // Handle fetch command if provided - save it for periodic updates
        if (fetchCommand && parsedFetch) {
            try {
                await saveFetchCommand(parsedFetch, ctfData, channel.id);
                await currentInteraction.followUp({ 
                    content: "✅ Auto-update fetch command saved! The bot will now fetch updates every 5 minutes until the CTF ends.", 
                    ephemeral: true 
                });
            } catch (error) {
                await currentInteraction.followUp({ 
                    content: `⚠️ Failed to save fetch command for auto-updates: ${error}`, 
                    ephemeral: true 
                });
            }
        }
    },
};