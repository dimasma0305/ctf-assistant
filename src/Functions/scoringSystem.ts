import { solveModel, ChallengeModel } from '../Database/connect';
import { infoEvent } from './ctftime-v2';

/**
 * NEW:
 * Get max challenge points for multiple CTFs at once (the "max_score" per CTF)
 */
export async function getBulkCTFMaxPoints(ctfIds: string[]): Promise<Map<string, number>> {
    try {
        const challenges = await ChallengeModel.find({ ctf_id: { $in: ctfIds } }).lean();
        const ctfMaxPoints = new Map<string, number>();

        // Initialize with 0
        ctfIds.forEach(ctfId => ctfMaxPoints.set(ctfId, 0));

        // For each challenge, set the max for its CTF
        challenges.forEach(challenge => {
            const ctfId = challenge.ctf_id;
            const points = challenge.points || 100;
            const currentMax = ctfMaxPoints.get(ctfId) || 0;
            if (points > currentMax) {
                ctfMaxPoints.set(ctfId, points);
            }
        });

        return ctfMaxPoints;
    } catch (error) {
        console.error('Error calculating bulk CTF max points:', error);
        return new Map();
    }
}

interface UserSolve {
    ctf_id: string;
    challenge: string;
    category: string;
    points: number;
    solved_at: Date;
    users: string[];
}

interface UserScore {
    userId: string; // This will be the discord_id for Discord mentions
    totalScore: number;
    solveCount: number;
    ctfCount: number;
    categories: Set<string>;
    recentSolves: UserSolve[];
    ctfBreakdown: Map<string, {
        ctfTitle: string;
        weight: number;
        solves: number;
        points: number;
        score: number;
        logo: string;
    }>;
}

/**
 * Calculate normalized score based on:
 * - Challenge points normalized by max challenge points in that CTF (max_score)
 * - CTF weight as the only differentiating multiplier
 * - Makes all CTFs equal in base scoring regardless of their internal point systems,
 *   but now using (challenge_point / max_score) * ctf_weight as requested.
 */
export class FairScoringSystem {
    
    /**
     * Calculate normalized score for a solve
     *
     * Formula: (challengePoints / maxScore) * ctfWeight
     *
     * Note: keep signature to avoid changing interfaces. The third parameter is treated
     * as the "max score" for the CTF (maximum single-challenge points within the CTF).
     */
    private static calculateBaseScore(challengePoints: number, ctfWeight: number, maxScore: number): number {
        // Prevent divide-by-zero by falling back to challengePoints if maxScore is falsy
        const effectiveMax = (typeof maxScore === 'number' && maxScore > 0) ? maxScore : challengePoints || 1;
        const normalizedScore = challengePoints / effectiveMax;
        return (normalizedScore * ctfWeight);
    }

    /**
     * Get user scores with normalized scoring algorithm
     */
    static async calculateUserScores(globalQuery: any = {}): Promise<Map<string, UserScore>> {
        // Get solves with populated challenge data and user data
        const solves = await solveModel.find(globalQuery).populate('challenge_ref').populate('users').lean();
        const userScores = new Map<string, UserScore>();

        // Get unique CTF IDs from solves
        const ctfIds = Array.from(new Set(solves.map(solve => solve.ctf_id || '').filter(id => id)));
        
        // ALSO calculate the max single-challenge points per CTF (max_score)
        const ctfMaxPoints = await getBulkCTFMaxPoints(ctfIds);

        // Group solves by user
        for (const solve of solves) {
            // Get challenge data from populated reference
            let challengeName = solve.challenge || 'Unknown';
            let challengeCategory = solve.category || 'Unknown';
            let challengePoints = 100;

            if (solve.challenge_ref && typeof solve.challenge_ref === 'object' && solve.challenge_ref !== null && 'points' in solve.challenge_ref) {
                const challengeRef = solve.challenge_ref as any;
                challengeName = challengeRef.name || challengeName;
                challengeCategory = challengeRef.category || challengeCategory;
                challengePoints = challengeRef.points || 100;
            }

            // Extract discord_ids from populated users
            const userDiscordIds: string[] = [];
            if (Array.isArray(solve.users)) {
                for (const user of solve.users) {
                    if (typeof user === 'object' && user !== null && 'discord_id' in user) {
                        // User is populated
                        const populatedUser = user as any;
                        userDiscordIds.push(populatedUser.discord_id);
                    } else if (typeof user === 'string') {
                        // Fallback: if not populated, assume it's a discord_id (shouldn't happen with new system)
                        console.warn('User not populated in solve:', solve._id);
                        userDiscordIds.push(user);
                    }
                }
            }

            for (const discordId of userDiscordIds) {
                if (!userScores.has(discordId)) {
                    userScores.set(discordId, {
                        userId: discordId,
                        totalScore: 0,
                        solveCount: 0,
                        ctfCount: 0,
                        categories: new Set<string>(),
                        recentSolves: [],
                        ctfBreakdown: new Map()
                    });
                }

                const userScore = userScores.get(discordId)!;
                userScore.recentSolves.push({
                    ctf_id: solve.ctf_id || '',
                    challenge: challengeName,
                    category: challengeCategory,
                    points: challengePoints,
                    solved_at: solve.solved_at || new Date(),
                    users: userDiscordIds
                });
            }
        }

        // Calculate scores for each user
        for (const [_userId, userScore] of userScores) {
            for (const solve of userScore.recentSolves) {
                const ctfData = await infoEvent(solve.ctf_id);
                if (ctfData.weight === 0) {
                    ctfData.weight = 10;
                }

                // Get the CTF max single-challenge points (max_score) and fallback if missing
                const ctfMax = ctfMaxPoints.get(solve.ctf_id) || solve.points || 100;

                // Calculate normalized score using (challengePoints / max_score) * ctfWeight
                const totalSolveScore = this.calculateBaseScore(solve.points, ctfData.weight, ctfMax);
                
                // Update user stats
                userScore.totalScore += totalSolveScore;
                userScore.solveCount += 1;
                userScore.categories.add(solve.category);

                // Update CTF breakdown
                if (!userScore.ctfBreakdown.has(solve.ctf_id)) {
                    userScore.ctfBreakdown.set(solve.ctf_id, {
                        ctfTitle: ctfData.title,
                        weight: ctfData.weight,
                        solves: 0,
                        points: 0,
                        score: 0,
                        logo: ctfData.logo || ''
                    });
                }
                
                const ctfBreakdown = userScore.ctfBreakdown.get(solve.ctf_id)!;
                ctfBreakdown.solves += 1;
                ctfBreakdown.points += solve.points;
                ctfBreakdown.score += totalSolveScore;
            }

            userScore.ctfCount = userScore.ctfBreakdown.size;
            
            // Sort recent solves by points descending
            userScore.recentSolves = userScore.recentSolves
                .sort((a, b) => b.points - a.points)
                .slice(0, 10); // Keep only top 10 for display
        }

        return userScores;
    }

    /**
     * Get formatted leaderboard data
     */
    static async getLeaderboard(globalQuery: any = {}, limit: number = 10) {
        const userScores = await this.calculateUserScores(globalQuery);
        
        return Array.from(userScores.values())
            .sort((a, b) => b.totalScore - a.totalScore)
            .slice(0, limit);
    }
}

export default FairScoringSystem;
