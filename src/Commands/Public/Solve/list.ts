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
    if (!data.id){
      interaction.reply("This channel does not have a valid CTF event associated with it.");
      return
    }
    const solves = await solveModel.find({ctf_id: data.id})
    var description;
    if (solves.length == 0){
        description = "No solved challenges found."
    }else{
        // Group solves by category
        const solvesByCategory = solves.reduce((acc: any, solve: any) => {
            const category = solve.category || "Legacy"; // Use "Legacy" for old solves without category
            if (!acc[category]) {
                acc[category] = [];
            }
            acc[category].push(solve);
            return acc;
        }, {});

        // Format the description by category
        description = Object.keys(solvesByCategory)
            .sort() // Sort categories alphabetically
            .map(category => {
                const categoryHeader = `**[${category}]**`;
                const challengesList = solvesByCategory[category]
                    .map((solve: any) => `• **${solve.challenge}** solved by ${solve.users.map((user: string) => `<@${user}>`).join(', ')}`)
                    .join('\n');
                return `${categoryHeader}\n${challengesList}`;
            })
            .join('\n\n');
    }
    const listEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Solved Challenges!')
      .setDescription(description)
      .setTimestamp()
    await interaction.reply({ embeds: [listEmbed]})
  },
};

