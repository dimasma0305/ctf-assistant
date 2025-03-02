import { SlashCommandSubcommandBuilder, TextChannel } from "discord.js";
import { SubCommand } from "../../../Model/command";
import { solveModel } from "../../../Database/connect";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('delete')
        .setDescription('delete a specific challenge by name')
        .addStringOption(input=>input
            .setName("name")
            .setDescription("Challenge name")
            .setRequired(true)
        ),
    async execute(interaction, _client) {
        var channel = interaction.channel;
        var challengeName = interaction.options.getString("name")
        if (!channel || !(channel instanceof TextChannel)){
            interaction.reply("This command can only be used in a channel.");
            return
        }
        const data = JSON.parse(channel.topic || "{}") as any
        if (!data.id){
            interaction.reply("This channel does not have a valid CTF event associated with it.");
            return
        }
        if (interaction.guild?.ownerId !== interaction.user.id) {
            interaction.reply("Only the server owner can delete solve lists.");
            return
        }
        await solveModel.deleteMany({ctf_id: data.id, challenge: challengeName});
        return interaction.reply({ content: "All solve list deleted", ephemeral: true });
    },
};



