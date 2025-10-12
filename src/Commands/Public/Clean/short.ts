import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, TextChannel, ChannelType, Message, Collection, GuildChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('short')
        .setDescription('Remove short messages from a specific channel recursively')
        .addChannelOption((option) => option
            .setName("channel")
            .setDescription("Select the channel to clean")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
        .addIntegerOption((option) => option
            .setName("max_length")
            .setDescription("Maximum character length to consider a message 'short' (default: 10)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(100)
        )
        .addIntegerOption((option) => option
            .setName("batch_size")
            .setDescription("Number of messages to process per batch (default: 50)")
            .setRequired(false)
            .setMinValue(10)
            .setMaxValue(100)
        )
        .addIntegerOption((option) => option
            .setName("total_limit")
            .setDescription("Maximum total messages to scan (default: 1000)")
            .setRequired(false)
            .setMinValue(50)
            .setMaxValue(5000)
        ),
    async execute(interaction, _client) {
        await interaction.deferReply({ flags: ["Ephemeral"] });
        
        try {
            const rawChannel = interaction.options.getChannel('channel');
            const maxLength = interaction.options.getInteger('max_length') || 10;
            const batchSize = interaction.options.getInteger('batch_size') || 50;
            const totalLimit = interaction.options.getInteger('total_limit') || 1000;

            if (!rawChannel) {
                await interaction.editReply('Please select a valid channel.');
                return;
            }

            // Get the actual channel from the guild to have full channel object
            const targetChannel = await interaction.guild?.channels.fetch(rawChannel.id);
            
            if (!targetChannel || !targetChannel.isTextBased()) {
                await interaction.editReply('Please select a valid text channel.');
                return;
            }

            // Check permissions
            const botMember = interaction.guild?.members.me;
            if (!botMember?.permissionsIn(targetChannel).has(['ViewChannel', 'ReadMessageHistory', 'ManageMessages'])) {
                await interaction.editReply('I don\'t have the required permissions in the selected channel.');
                return;
            }

            // Create confirmation buttons
            const confirmButton = new ButtonBuilder()
                .setCustomId('confirm_delete')
                .setLabel('Yes, Delete Short Messages')
                .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
                .setCustomId('cancel_delete')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(confirmButton, cancelButton);

            // Show confirmation message
            const confirmationMessage = `⚠️  **Confirmation Required**\n\n` +
                `You are about to delete short messages from **${targetChannel.name}**\n\n` +
                `**Settings:**\n` +
                `• Maximum message length: **${maxLength} characters**\n` +
                `• Batch size: **${batchSize} messages**\n` +
                `• Total scan limit: **${totalLimit} messages**\n\n` +
                `**This action cannot be undone!**\n` +
                `Are you sure you want to proceed?`;

            const confirmationReply = await interaction.editReply({
                content: confirmationMessage,
                components: [row]
            });

            // Wait for button interaction
            let buttonInteraction;
            try {
                buttonInteraction = await confirmationReply.awaitMessageComponent({
                    componentType: ComponentType.Button,
                    time: 30000, // 30 seconds timeout
                    filter: (i: any) => i.user.id === interaction.user.id
                });

                if (buttonInteraction.customId === 'cancel_delete') {
                    await buttonInteraction.update({
                        content: '✅ Operation cancelled. No messages were deleted.',
                        components: []
                    });
                    return;
                }

                // User confirmed, proceed with deletion
                await buttonInteraction.update({
                    content: `🔍 Starting to scan messages in ${targetChannel.name} for messages shorter than ${maxLength} characters...`,
                    components: []
                });

            } catch (error) {
                await interaction.editReply({
                    content: '❌ Operation timed out or failed. No action was taken.',
                    components: []
                });
                return;
            }

            let deletedCount = 0;
            let scannedCount = 0;
            let lastMessageId: string | undefined;

            // Recursive message processing
            while (scannedCount < totalLimit) {
                const currentBatchSize = Math.min(batchSize, totalLimit - scannedCount);
                const fetchOptions: any = { limit: currentBatchSize };
                
                if (lastMessageId) {
                    fetchOptions.before = lastMessageId;
                }

                const messages = await (targetChannel as any).messages.fetch(fetchOptions) as Collection<string, Message>;
                
                if (messages.size === 0) {
                    // No more messages to process
                    break;
                }

                // Process messages using forEach (following existing pattern exactly)
                messages.forEach(async (message) => {
                    // Check if message is short and should be deleted
                    if (message.content.length <= maxLength && 
                        message.content.length > 0 && 
                        !message.pinned &&
                        !message.author.bot) {
                        try {
                            await message.delete();
                            deletedCount++;
                        } catch (error) {
                            console.error(`Failed to delete message ${message.id}:`, error);
                        }
                    }
                });

                scannedCount += messages.size;
                lastMessageId = messages.last()?.id;

                // Update progress every few batches
                if (scannedCount % (batchSize * 2) === 0) {
                    try {
                        await interaction.editReply(
                            `🔍 Progress: Scanned ${scannedCount}/${totalLimit} messages, deleted ${deletedCount} short messages...`
                        );
                    } catch (error) {
                        // Continue silently if edit fails (interaction might be expired)
                        console.log('Progress update failed, continuing...');
                    }
                }

                // Small delay to respect rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            try {
                await interaction.editReply(
                    `✅ **Cleanup completed!**\n` +
                    `📊 **Statistics:**\n` +
                    `• Messages scanned: ${scannedCount}\n` +
                    `• Short messages deleted: ${deletedCount}\n` +
                    `• Channel: ${targetChannel.name}\n` +
                    `• Max length threshold: ${maxLength} characters`
                );
            } catch (error) {
                // If edit fails, try to send a new message
                try {
                    await interaction.followUp({
                        content: `✅ **Cleanup completed!**\n` +
                        `📊 **Statistics:**\n` +
                        `• Messages scanned: ${scannedCount}\n` +
                        `• Short messages deleted: ${deletedCount}\n` +
                        `• Channel: ${targetChannel.name}\n` +
                        `• Max length threshold: ${maxLength} characters`,
                        ephemeral: true
                    });
                } catch (followUpError) {
                    console.error('Failed to send completion message:', followUpError);
                }
            }

        } catch (error) {
            console.error('Error in short message cleanup:', error);
            try {
                await interaction.editReply({
                    content: '❌ An error occurred while processing your request. Please check my permissions and try again.',
                    components: []
                });
            } catch (editError) {
                // If edit fails, try follow up
                try {
                    await interaction.followUp({
                        content: '❌ An error occurred while processing your request. Please check my permissions and try again.',
                        ephemeral: true
                    });
                } catch (followUpError) {
                    console.error('Failed to send error message:', followUpError);
                }
            }
        }
    },
};
