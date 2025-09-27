import { SlashCommandSubcommandBuilder, EmbedBuilder } from "discord.js";
import { SubCommand } from "../../../Model/command";
import { solveModel, ChallengeSchemaType, ChallengeModel } from "../../../Database/connect";
import { 
    getChallengeInfo, 
    getChannelAndCTFData, 
    validateCTFEvent, 
    markThreadAsUnsolved 
} from "./utils";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('delete')
        .setDescription('Delete a challenge solve and update thread name'),
    async execute(interaction, _client) {
        const channel = interaction.channel;
        if (!channel) {
            interaction.reply("This command can only be used in a channel.");
            return;
        }

        const challengeInfo = getChallengeInfo(interaction);
        if (!challengeInfo) {
            interaction.reply("This command can only be used in a thread.");
            return;
        }
        
        const { challengeName, category } = challengeInfo;

        const result = await getChannelAndCTFData(channel);
        if (!result) {
            interaction.reply("This command can only be used in a server.");
            return;
        }

        const { ctfData } = result;
        
        if (!validateCTFEvent(ctfData)) {
            interaction.reply("This channel does not have a valid CTF event associated with it.");
            return;
        }
        
        if (interaction.guild?.ownerId !== interaction.user.id) {
            interaction.reply("Only the server owner can delete solve lists.");
            return;
        }
        
        const challenge = await ChallengeModel.findOne({ 
            name: challengeName, 
            category 
          });
          
        if (!challenge) {
            throw new Error("Challenge not found");
        }
          
        const deletedSolve = await solveModel.deleteOne({
            ctf_id: ctfData.id,
            challenge_ref: challenge._id
        });

        if (deletedSolve.deletedCount === 0) {
            interaction.reply("This challenge solve does not exist.");
            return;
        }

        // Update thread name to show unsolved status
        await markThreadAsUnsolved(interaction.channel!);
        
        // Send notification in the thread
        if (interaction.channel && interaction.channel.isThread()) {
            const threadNotificationEmbed = new EmbedBuilder()
                .setColor('#ff6600')
                .setTitle('↩️ Challenge Solve Revoked')
                .setDescription(`The solve status for this challenge has been revoked by <@${interaction.user.id}>`)
                .setTimestamp()
                .setFooter({ text: 'Challenge Status Update', iconURL: 'https://tcp1p.team/favicon.ico' });
            
            await interaction.reply({ embeds: [threadNotificationEmbed] });
            return;
        }
        
        await interaction.reply({ content: `Challenge solve for "[${category}] ${challengeName}" has been deleted`, flags: ["Ephemeral"] });
    },
};
