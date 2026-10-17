import { SlashCommandSubcommandBuilder, MessageFlags } from "discord.js";
import { SubCommand } from "../../../Model/command";
import { solveModel, ChallengeModel } from "../../../Database/connect";
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
            await interaction.reply({ content: "This command can only be used in a channel.", flags: MessageFlags.Ephemeral });
            return;
        }

        const challengeInfo = getChallengeInfo(interaction);
        if (!challengeInfo) {
            await interaction.reply({ content: "This command can only be used in a thread.", flags: MessageFlags.Ephemeral });
            return;
        }
        
        const { challengeName, category } = challengeInfo;

        const result = await getChannelAndCTFData(channel);
        if (!result) {
            await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
            return;
        }

        const { ctfData } = result;
        
        if (!validateCTFEvent(ctfData)) {
            await interaction.reply({ content: "This channel does not have a valid CTF event associated with it.", flags: MessageFlags.Ephemeral });
            return;
        }
        
        if (interaction.guild?.ownerId !== interaction.user.id) {
            await interaction.reply({ content: "Only the server owner can delete solve lists.", flags: MessageFlags.Ephemeral });
            return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            const ctfId = ctfData.id.toString();
            const challenge = await ChallengeModel.findOne({
                ctf_id: ctfId, name: challengeName,
                ...(category !== "Unknown" ? { category } : {}),
            });
            if (!challenge) {
                await interaction.editReply(`Challenge "${challengeName}" tidak ditemukan di event ini.`);
                return;
            }
            const deletedSolve = await solveModel.deleteOne({ ctf_id: ctfId, challenge_ref: challenge._id });
            challenge.is_solved = await solveModel.exists({ ctf_id: ctfId, challenge_ref: challenge._id }) !== null;
            await challenge.save();
            if (!challenge.is_solved) await markThreadAsUnsolved(channel);
            await interaction.editReply(deletedSolve.deletedCount
                ? `Solve "${challengeName}" dihapus. /solve list berikutnya akan mengikuti data terbaru.`
                : `Solve "${challengeName}" memang sudah tidak ada; status challenge sudah diselaraskan.`);
        } catch (error) {
            console.error('[solve/delete] failed:', error);
            await interaction.editReply('Gagal menghapus solve. Cek log bot sebelum mencoba lagi.');
        }
    },
};
