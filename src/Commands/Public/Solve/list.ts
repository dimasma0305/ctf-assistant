import { SubCommand } from "../../../Model/command";
import { EmbedBuilder, SlashCommandSubcommandBuilder, TextChannel } from "discord.js";
import { solveModel } from "../../../Database/connect";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName('list')
    .setDescription('list all solved challenge'),
  async execute(interaction, _client) {
    var channel = interaction.channel;
    if (!channel){
      interaction.reply("This command can only be used in a channel.");
      return
    }
    if (!(channel instanceof TextChannel)){
      interaction.reply("This command can only be used in a server.");
      return
    }
    const data = JSON.parse(channel.topic || "{}") as any
    if (!data.ctf_id){
      interaction.reply("This channel does not have a valid CTF event associated with it.");
      return
    }
    const solves = await solveModel.find({ctf_id: data.ctf_id})
    var description;
    if (solves.length == 0){
        description = "No solved challenges found."
    }else{
        description = solves.map(solve => `**${solve.challenge}** solved by ${solve.users.map(user => `<@${user}>`).join(', ')}!`).join('\n')
    }
    const listEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Solved Challenges!')
      .setDescription(description)
      .setTimestamp()
    await interaction.reply({ embeds: [listEmbed]})
  },
};

