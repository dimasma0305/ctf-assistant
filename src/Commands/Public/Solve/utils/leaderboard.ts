import { EmbedBuilder } from "discord.js";

/**
 * Interface for leaderboard entries
 */
export interface LeaderboardEntry {
    userId: string;
    totalScore: number;
    solveCount: number;
    ctfCount: number;
    categories: Set<string>;
    recentSolves: any[];
    ctfBreakdown: Map<string, any>;
}

/**
 * Creates a leaderboard embed with consistent formatting
 */
export function createLeaderboardEmbed(
    leaderboard: LeaderboardEntry[], 
    isGlobal: boolean, 
    limit: number, 
    autoUpdate: boolean = false
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${isGlobal ? 'Global ' : ''}Leaderboard 🏆`)
        .setTimestamp()
        .setFooter({ 
            text: autoUpdate ? 'CTF Assistant • Auto-updating hourly' : 'CTF Assistant',
            iconURL: 'https://tcp1p.team/favicon.ico' 
        });

    if (leaderboard.length === 0) {
        embed.setColor('#ff9900')
            .setDescription('No solves found yet!');
        return embed;
    }

    if (!isGlobal && leaderboard.length > 0) {
        // Show CTF-specific description if available
        const firstEntry = leaderboard[0];
        if (firstEntry.ctfBreakdown.size === 1) {
            const ctfInfo = Array.from(firstEntry.ctfBreakdown.values())[0] as { ctfTitle: string; weight: number; };
            embed.setDescription(`Showing results for **${ctfInfo.ctfTitle}** (Weight: ${ctfInfo.weight})`);
        }
    }

    // Create leaderboard description
    let description = '';
    const medals = ['🥇', '🥈', '🥉'];
    
    for (let i = 0; i < leaderboard.length; i++) {
        const entry = leaderboard[i];
        const position = i + 1;
        const medal = i < 3 ? medals[i] : `**${position}.**`;
        
        description += `${medal} <@${entry.userId}> - **${entry.totalScore}** pts (${entry.solveCount} solves)\n`;
        
        // Add detailed stats for top 3
        if (i < 3) {
            const diversityStats = [];
            if (entry.ctfCount > 1) diversityStats.push(`${entry.ctfCount} CTFs`);
            if (entry.categories.size > 1) diversityStats.push(`${entry.categories.size} categories`);
            
            if (diversityStats.length > 0) {
                description += `   └ *Diversity:* ${diversityStats.join(', ')}\n`;
            }
            
            // Show recent high-value solves
            if (entry.recentSolves.length > 0) {
                const topSolves = entry.recentSolves.slice(0, 3);
                const solveList = topSolves.map((s: any) => `**[${s.category}]** ${s.challenge} (${s.points}pts)`).join(', ');
                description += `   └ *Top solves:* ${solveList}\n`;
            }
        }
        description += '\n';
    }

    // Add total statistics
    const totalUniquePlayers = leaderboard.length;
    const totalSolves = leaderboard.reduce((sum, entry) => sum + entry.solveCount, 0);
    const totalScore = leaderboard.reduce((sum, entry) => sum + entry.totalScore, 0);
    const uniqueCTFs = new Set(leaderboard.flatMap(entry => Array.from(entry.ctfBreakdown.keys()))).size;

    embed.addFields(
        { 
            name: 'Competition Stats', 
            value: `👥 **${totalUniquePlayers}** players\n🎯 **${totalSolves}** total solves\n🏆 **${totalScore}** total points\n🏁 **${uniqueCTFs}** unique CTFs`, 
            inline: true 
        },
        {
            name: 'Scoring System',
            value: `📊 Normalized challenge score × CTF weight\n⚖️ All CTFs weighted equally regardless of point system`,
            inline: true
        }
    );

    if (description.length > 4096) {
        // Truncate if too long
        description = description.substring(0, 4000) + '\n... (truncated)';
    }

    embed.setDescription((embed.data.description || '') + '\n' + description);

    return embed;
}
