import { SlashCommandSubcommandBuilder } from "discord.js";
import { SubCommand } from "../../../Model/command";
import { solveModel } from "../../../Database/connect";
import { 
    getChallengeInfo, 
    getChannelAndCTFData, 
    validateCTFEvent, 
    markThreadAsUnsolved 
} from "./utils";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('delete')
        .setDescription('Delete a challenge solve and update thread name')
        .addStringOption(input=>input
            .setName("name")
            .setDescription("Challenge name")
            .setRequired(false)
        ),
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
            return
        }
        
        await solveModel.deleteOne({ctf_id: ctfData.id, challenge: challengeName, category: category});
        
        // Update thread name to show unsolved status
        await markThreadAsUnsolved(interaction.channel!);
        
        return interaction.reply({ content: `Challenge solve for "[${category}] ${challengeName}" has been deleted`, ephemeral: true });
    },
};



