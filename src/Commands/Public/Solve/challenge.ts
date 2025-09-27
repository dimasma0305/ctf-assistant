
import { SubCommand } from "../../../Model/command";
import { EmbedBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { solveModel, ChallengeModel, UserModel } from "../../../Database/connect";
import { 
    getChallengeInfo, 
    getChannelAndCTFData, 
    validateCTFEvent, 
    extractAndProcessUserIds, 
    markThreadAsSolved 
} from "./utils";
import { UserSchemaType } from "../../../Database/userSchema";

// Helper function to create or update challenge data
async function createOrUpdateChallenge(challengeName: string, category: string, ctfId: string, points: number = 100) {
    // Try to find existing challenge
    let challenge = await ChallengeModel.findOne({
        ctf_id: ctfId,
        name: challengeName
    });

    if (challenge) {
        // Update existing challenge
        challenge.category = category;
        challenge.updated_at = new Date();
        await challenge.save();
        return challenge;
    } else {
        // Create new challenge
        challenge = new ChallengeModel({
            name: challengeName,
            category: category,
            points: points,
            ctf_id: ctfId,
            is_solved: false,
            solves: 0,
            created_at: new Date(),
            updated_at: new Date()
        });
        await challenge.save();
        return challenge;
    }
}

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
        const userObjectIds = await extractAndProcessUserIds(players, interaction.user.id, interaction);

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

        // Create or update challenge in database
        const challengeData = await createOrUpdateChallenge(challengeName, category, ctfData.id.toString(), 100);
        
        const existingSolve = await solveModel.findOne({ challenge_ref: challengeData._id, ctf_id: ctfData.id.toString() });
        if (existingSolve) {
            existingSolve.users = userObjectIds;
            existingSolve.challenge_ref = challengeData._id; // Update challenge reference
            await existingSolve.save();
        } else {
            const newSolve = new solveModel({
                ctf_id: ctfData.id.toString(),
                users: userObjectIds,
                challenge_ref: challengeData._id,
            });
            await newSolve.save();
        }

        // Mark challenge as solved
        challengeData.is_solved = true;
        await challengeData.save();
        
        // Get Discord IDs for mentions by populating the users
        const populatedSolve = await solveModel.findOne({ challenge_ref: challengeData._id, ctf_id: ctfData.id.toString() }).populate<{users: UserSchemaType[]}>('users');
        const discordIds = populatedSolve?.users?.map((user) => user.discord_id) || [];
        
        const winnerEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Congratulations!')
            .setDescription(`Congratulations to ${discordIds.map(id => `<@${id}>`).join(', ')} for solving the **[${category}]** challenge **${challengeName}**!`)
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
                .setDescription(`This challenge has been marked as solved by ${discordIds.map(id => `<@${id}>`).join(', ')}`)
                .setTimestamp()
                .setFooter({ text: 'Challenge Status Update', iconURL: 'https://tcp1p.team/favicon.ico' });
            
            await interaction.reply({ embeds: [threadNotificationEmbed] });
            return;
        }
        
        await interaction.reply({ content: "success", flags: ["Ephemeral"] });
    },
};
