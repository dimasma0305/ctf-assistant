import { SlashCommandSubcommandBuilder, EmbedBuilder } from "discord.js";
import { SubCommand } from "../../../Model/command";
import { 
    getChannelAndCTFData, 
    validateCTFEvent
} from "./utils";
import { infoEvent } from "../../../Functions/ctftime-v2";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('refresh')
        .setDescription('Refresh CTF data by fetching latest information without cache'),
    async execute(interaction, _client) {
        const channel = interaction.channel;
        if (!channel) {
            await interaction.reply("This command can only be used in a channel.");
            return;
        }

        // Get CTF data from channel
        const result = await getChannelAndCTFData(channel);
        if (!result) {
            await interaction.reply("This command can only be used in a server with CTF data.");
            return;
        }

        const { textChannel, ctfData } = result;
        
        if (!validateCTFEvent(ctfData)) {
            await interaction.reply("This channel does not have a valid CTF event associated with it.");
            return;
        }

        // Show loading message
        await interaction.reply("🔄 Refreshing CTF data from CTFtime without cache...");

        try {
            // Fetch fresh CTF info without cache
            const freshCTFData = await infoEvent(ctfData.id.toString(), false);
            
            // Create success embed
            const refreshEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ CTF Data Refreshed')
                .setDescription(`Successfully refreshed data for **${freshCTFData.title}**`)
                .addFields(
                    { name: 'CTF ID', value: `${freshCTFData.id}`, inline: true },
                    { name: 'Weight', value: `${freshCTFData.weight}`, inline: true },
                    { name: 'Participants', value: `${freshCTFData.participants}`, inline: true },
                    { name: 'Format', value: freshCTFData.format || 'N/A', inline: true },
                    { name: 'Status', value: 'Cache bypassed - Fresh data loaded', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'CTF Data Refresh', iconURL: 'https://tcp1p.team/favicon.ico' });

            await interaction.editReply({ content: '', embeds: [refreshEmbed] });
            
        } catch (error) {
            console.error('Error refreshing CTF data:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Refresh Failed')
                .setDescription('Failed to refresh CTF data. Please try again later.')
                .addFields(
                    { name: 'CTF ID', value: `${ctfData.id}`, inline: true },
                    { name: 'Error', value: 'Unable to fetch fresh data from CTFtime', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'CTF Data Refresh', iconURL: 'https://tcp1p.team/favicon.ico' });

            await interaction.editReply({ content: '', embeds: [errorEmbed] });
        }
    },
};
