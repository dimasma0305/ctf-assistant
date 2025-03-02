
import { SubCommand } from "../../../Model/command";
import { Embed, EmbedBuilder, SlashCommandSubcommandBuilder, TextChannel } from "discord.js";
import { translate } from "../../../Functions/discord-utils";
import { CTFEvent, infoEvent } from "../../../Functions/ctftime-v2";
import { solveModel } from "../../../Database/connect";

const regex = /<@[^>]*>/g;

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('challenge')
        .setDescription('delete all role and channel associate with ctf event')
        .addStringOption(input=>input
            .setName("players")
            .setDescription("Players that contribute, use @ tag")
            .setRequired(false)
        )
        .addStringOption(input=>input
            .setName("name")
            .setDescription("Challenge name")
            .setRequired(false)
        ),
    async execute(interaction, _client) {
        var channel = interaction.channel;
        if (!channel){
            interaction.reply("This command can only be used in a channel.");
            return
        }
        const players = interaction.options.getString("players");
        var challengeName = interaction.options.getString("name");
        var users, data;
        
        if (!challengeName) {
            if (channel.isThread()) {
                challengeName = channel.name;
            }else{
                interaction.reply("Please specify the challenge name or use this command in a thread.");
                return
            }
        }

        if (!players){
            users = [interaction.user.id]
        }else{
            const regex = /<@(\d+)>/g;
            users = players.match(regex)?.map(match => match.slice(2, -1));
            if (!users){
                users = [interaction.user.id]
            }
        }
        if (!(channel instanceof TextChannel)){
            if (channel.isThread()){
                if (channel.parent instanceof TextChannel){
                    channel = channel.parent
                    data = JSON.parse(channel.topic || "{}") as CTFEvent
                }else{
                    interaction.reply("This command can only be used in a server.");
                    return
                }
            }else{
                interaction.reply("This command can only be used in a server.");
                return
            }
        }else{
            data = JSON.parse(channel.topic || "{}") as CTFEvent
        }
        
        if (!data.ctf_id){
            interaction.reply("This channel does not have a valid CTF event associated with it.");
            return
        }
        const solve = new solveModel({
            challenge: challengeName,
            ctf_id: data.ctf_id,
            users: users
        })
        await solve.save()
        
        const winnerEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Congratulations!')
            .setDescription(`Congratulations to ${users.map(user => `<@${user}>`).join(', ')} for solving the challenge **${challengeName}**!`)
            .setTimestamp()
            .setFooter({ text: 'CTF Event', iconURL: 'https://tcp1p.team/favicon.ico' });

        await channel.send({ embeds: [winnerEmbed] });
        await interaction.reply({ content: "success", flags: ["Ephemeral"] });
    },
};
