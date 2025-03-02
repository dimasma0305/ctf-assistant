import { SlashCommandSubcommandBuilder, TextChannel } from "discord.js";
import { SubCommand } from "../../../Model/command";
import { solveModel } from "../../../Database/connect";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('clean')
        .setDescription('delete all solve list'),
    async execute(interaction, _client) {
        var channel = interaction.channel;
        if (!channel || !(channel instanceof TextChannel)){
            interaction.reply("This command can only be used in a channel.");
            return
        }
        const data = JSON.parse(channel.topic || "{}") as any
        if (!data.ctf_id){
            interaction.reply("This channel does not have a valid CTF event associated with it.");
            return
        }
        if (interaction.guild?.ownerId !== interaction.user.id) {
            interaction.reply("Only the server owner can delete solve lists.");
            return
        }
        await solveModel.deleteMany({ctf_id: data.ctf_id});
        return interaction.reply({ content: "All solve list deleted", ephemeral: true });
    },
};
