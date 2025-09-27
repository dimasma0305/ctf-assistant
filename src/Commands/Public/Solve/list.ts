import { SubCommand } from "../../../Model/command";
import { EmbedBuilder, SlashCommandSubcommandBuilder, TextChannel } from "discord.js";
import { ChallengeSchemaType, UserSchemaType, solveModel, SolveSchemaType } from "../../../Database/connect";

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
    const solves = await solveModel.find({ctf_id: data.id}).populate<{users: UserSchemaType[]}>('users').populate<{challenge_ref: ChallengeSchemaType}>('challenge_ref')
    var description;
    if (solves.length == 0){
        description = "No solved challenges found."
    }else{
        // Group solves by category
        const solvesByCategory = solves.reduce((acc: any, solve) => {
            const category = solve.challenge_ref.category || "Legacy"; // Use "Legacy" for old solves without category
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
                    .map((solve: any) => {
                        // Extract discord_ids from populated users
                        const userMentions = solve.users.map((user: UserSchemaType) => {
                            if (typeof user === 'object' && user !== null && 'discord_id' in user) {
                                return `<@${user.discord_id}>`;
                            } else if (typeof user === 'string') {
                                // Fallback for old data
                                return `<@${user}>`;
                            }
                            return '<@unknown>';
                        }).join(', ');
                        return `• **${solve.challenge_ref.name}** solved by ${userMentions}`;
                    })
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

