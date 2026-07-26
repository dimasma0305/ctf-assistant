import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, TextChannel, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder, ChatInputCommandInteraction, ModalSubmitInteraction, MessageFlags } from "discord.js";
import { CTFEvent, infoEvent } from "../../../Functions/ctftime-v2";
import { parseChallenges, ParsedChallenge, parseCTFEventIdFromTopic, parseFetchCommand, ParsedFetchCommand, saveFetchCommand, updateThreadsStatus } from "./utils";
import {
    readResponseTextWithLimit,
    ResponseTooLargeError,
    safeFetch,
    SafeFetchError,
} from "../../../utils/urlGuard";

const FETCH_TIMEOUT_MS = 20_000;
const MAX_FETCH_JSON_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export const command: SubCommand = {
    // Registers a persistent server-side fetch loop + mass-creates threads —
    // organizers only (2026-06-09 audit fix: was ungated, enabling SSRF +
    // thread spam by any member). URL safety is also enforced in utils.
    allowedRoles: ["Mabar Manager", "Gas Mabar"],
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
        const truncateForDiscord = (content: string, maxLength: number = 2000): string => {
            if (content.length <= maxLength) {
                return content;
            }
            const suffix = '\n... (truncated)';
            return `${content.slice(0, Math.max(0, maxLength - suffix.length))}${suffix}`;
        };

        let finalJsonData: string | null = null;
        let currentInteraction: ChatInputCommandInteraction | ModalSubmitInteraction = interaction;
        
        const channel = interaction.channel;
        if (!channel || !(channel instanceof TextChannel)) {
            await interaction.reply({ content: "This command can only be used in a text channel.", flags: MessageFlags.Ephemeral });
            return;
        }

        const fetchCommand = interaction.options.getString("fetch_command");
        const jsonFile = interaction.options.getAttachment("json_file");

        // Priority: File upload > Fetch command > Modal input
        if (jsonFile) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            
            // Validate file type
            if (!jsonFile.name.endsWith('.json') && !jsonFile.name.endsWith('.txt')) {
                await interaction.editReply("❌ Please upload a .json or .txt file containing the JSON data.");
                return;
            }

            // Validate file size (Discord limit is 25MB for nitro, 8MB for regular users)
            if (jsonFile.size > MAX_ATTACHMENT_BYTES) {
                await interaction.editReply("❌ File is too large. Maximum file size is 25MB.");
                return;
            }

            try {
                const response = await safeFetch(jsonFile.url, {
                    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                });
                if (!response.ok) {
                    await interaction.editReply(`❌ Failed to download file: ${response.status} ${response.statusText}`);
                    return;
                }
                
                finalJsonData = await readResponseTextWithLimit(response, MAX_ATTACHMENT_BYTES);
                
                if (!finalJsonData.trim()) {
                    await interaction.editReply("❌ The uploaded file is empty.");
                    return;
                }
            } catch (error) {
                if (error instanceof ResponseTooLargeError) {
                    await interaction.editReply("❌ The uploaded file exceeds the 25MB size limit.");
                } else {
                    console.error("[solve/init] failed to read uploaded challenge file:", error instanceof Error ? error.name : "unknown error");
                    await interaction.editReply("❌ Failed to read the uploaded file.");
                }
                return;
            }
        } else if (fetchCommand) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
                        flags: MessageFlags.Ephemeral 
                    });
                    return;
                }
                
                finalJsonData = combinedJson;
                
                await modalSubmitInteraction.deferReply({ flags: MessageFlags.Ephemeral });
                currentInteraction = modalSubmitInteraction;
                
            } catch (error) {
                return;
            }
        }

        // Parse the channel metadata separately from the CTFtime lookup. A
        // database/network failure in infoEvent must not be reported as a
        // malformed Discord topic.
        let ctfEventId: string | null;
        try {
            ctfEventId = parseCTFEventIdFromTopic(channel.topic);
        } catch (error) {
            await currentInteraction.editReply("Failed to parse channel topic. Make sure this is a CTF event channel.");
            return;
        }

        if (!ctfEventId) {
            await currentInteraction.editReply("This channel does not have a valid CTF event associated with it.");
            return;
        }

        let ctfData: CTFEvent;
        try {
            ctfData = await infoEvent(ctfEventId, false);
        } catch (error) {
            console.error("Failed to load CTF event data for solve init:", {
                channelId: channel.id,
                ctfEventId,
                error,
            });
            await currentInteraction.editReply("Failed to load CTF event data right now. Please try again later.");
            return;
        }

        if (!ctfData.id) {
            await currentInteraction.editReply("This channel does not have a valid CTF event associated with it.");
            return;
        }

        // Handle fetch command if provided
        let parsedFetch: ParsedFetchCommand | null = null;
        
        if (fetchCommand && !finalJsonData) {
            try {
                parsedFetch = parseFetchCommand(fetchCommand);

                // Validate the initial URL and every redirect hop. Native
                // redirect following would allow a public URL to redirect the
                // bot into localhost, metadata, Mongo, or another private host.
                const response = await safeFetch(parsedFetch.url, {
                    method: parsedFetch.method,
                    headers: parsedFetch.headers,
                    body: parsedFetch.body,
                    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                });

                if (!response.ok) {
                    await currentInteraction.editReply(`❌ Fetch command failed: ${response.status} ${response.statusText}`);
                    return;
                }

                finalJsonData = await readResponseTextWithLimit(response, MAX_FETCH_JSON_BYTES);
                
                if (!finalJsonData.trim()) {
                    await currentInteraction.editReply("❌ Fetch command returned empty data.");
                    return;
                }
            } catch (error) {
                if (error instanceof SafeFetchError) {
                    await currentInteraction.editReply(`❌ Fetch URL rejected (${error.code}). Only public http(s) URLs are allowed.`);
                } else if (error instanceof ResponseTooLargeError) {
                    await currentInteraction.editReply("❌ Fetch response is too large (maximum 10MB).");
                } else {
                    console.error("[solve/init] challenge fetch failed:", error instanceof Error ? error.name : "unknown error");
                    await currentInteraction.editReply("❌ Fetch command failed. Check the URL and request options, then try again.");
                }
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
        const finish = new Date(ctfData.finish);
        const finishText = finish.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
        const now = new Date();
        const finalScoreNote = now < finish
            ? `⚠️ **Final Score Note:** After the CTF ends (${finishText}), run \`/solve init\` again to refresh points/solves for the final scoreboard.`
            : `⚠️ **Final Score Note:** This CTF ended (${finishText}). If you need final scoreboard accuracy, run \`/solve init\` again to refresh points/solves.`;

        const summary = [
            `✅ **Challenge Initialization Complete!**`,
            '',
            `📊 **Summary:**`,
            `• Created: ${createdThreads} new threads`,
            `• Updated: ${updatedMessages} messages`,
            `• Skipped (already exist): ${skippedThreads} threads`,
            `• Total challenges: ${challenges.length}`,
            '',
            finalScoreNote,
        ];

        if (errors.length > 0) {
            summary.push('', '⚠️ **Errors encountered:**');
            summary.push(...errors.slice(0, 5).map(error => `• ${error}`));
            if (errors.length > 5) {
                summary.push(`• ... and ${errors.length - 5} more errors`);
            }
        }

        await currentInteraction.editReply(truncateForDiscord(summary.join('\n')));
        
        // Handle fetch command if provided - save it for periodic updates
        if (fetchCommand && parsedFetch) {
            try {
                await saveFetchCommand(parsedFetch, ctfData, channel.id);
                await currentInteraction.followUp({ 
                    content: "✅ Auto-update fetch command saved! The bot will now fetch updates every 5 minutes until the CTF ends.", 
                    flags: MessageFlags.Ephemeral 
                });
            } catch (error) {
                await currentInteraction.followUp({ 
                    content: truncateForDiscord(`⚠️ Failed to save fetch command for auto-updates: ${error}`), 
                    flags: MessageFlags.Ephemeral 
                });
            }
        }
    },
};
