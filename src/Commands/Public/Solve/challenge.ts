
import { SubCommand } from "../../../Model/command";
import { EmbedBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { CTFEvent } from "../../../Functions/ctftime-v2";
import { solveModel } from "../../../Database/connect";
import { 
    getChallengeInfo, 
    getChannelAndCTFData, 
    validateCTFEvent, 
    extractUserIdsFromMentions, 
    markThreadAsSolved 
} from "./utils";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('challenge')
        .setDescription('Mark a challenge as solved and update thread name')
        .addStringOption(input=>input
            .setName("players")
            .setDescription("Players that contribute, use @ tag")
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

        const players = interaction.options.getString("players");
        const users = extractUserIdsFromMentions(players, interaction.user.id);

        const result = await getChannelAndCTFData(channel);
        if (!result) {
            interaction.reply("This command can only be used in a server.");
            return;
        }

        const { textChannel, ctfData } = result;
        
        if (!validateCTFEvent(ctfData)) {
            interaction.reply("This channel does not have a valid CTF event associated with it.");
            return;
        }
        const existingSolve = await solveModel.findOne({ challenge: challengeName, ctf_id: ctfData.id });
        if (existingSolve) {
            existingSolve.users = users;
            existingSolve.category = category; // Update category in case it changed
            await existingSolve.save();
        } else {
            const newSolve = new solveModel({
                challenge: challengeName,
                ctf_id: ctfData.id,
                category: category,
                users: users
            });
            await newSolve.save();
        }
        
        const winnerEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Congratulations!')
            .setDescription(`Congratulations to ${users.map(user => `<@${user}>`).join(', ')} for solving the **[${category}]** challenge **${challengeName}**!`)
            .setTimestamp()
            .setFooter({ text: 'CTF Event', iconURL: 'https://tcp1p.team/favicon.ico' });

        await textChannel.send({ embeds: [winnerEmbed] });
        
        // Update thread name to show solved status
        await markThreadAsSolved(interaction.channel!);
        
        // Send notification in the thread
        if (interaction.channel && interaction.channel.isThread()) {
            const threadNotificationEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🎉 Challenge Solved!')
                .setDescription(`This challenge has been marked as solved by ${users.map(user => `<@${user}>`).join(', ')}`)
                .setTimestamp()
                .setFooter({ text: 'Challenge Status Update', iconURL: 'https://tcp1p.team/favicon.ico' });
            
            await interaction.reply({ embeds: [threadNotificationEmbed] });
        }
        
        await interaction.reply({ content: "success", flags: ["Ephemeral"] });
    },
};
