import { solveModel, CTFCacheModel } from '../Database/connect';
import { infoEvent } from './ctftime-v2';

interface UserSolve {
    ctf_id: string;
    challenge: string;
    category: string;
    points: number;
    solved_at: Date;
    users: string[];
}

interface UserScore {
    userId: string;
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
    }>;
}

/**
 * Calculate normalized score based on:
 * - Challenge points normalized by total CTF points (percentage of CTF completion)
 * - CTF weight as the only differentiating multiplier
 * - Makes all CTFs equal in base scoring regardless of their internal point systems
 */
export class FairScoringSystem {
    
    /**
     * Calculate normalized score for a solve
     */
    private static calculateBaseScore(challengePoints: number, ctfWeight: number, ctfTotalPoints: number): number {
        // Normalize challenge score by dividing by total CTF points (percentage of CTF)
        // Then multiply by CTF weight as the only differentiating factor
        // This makes all CTFs equal in base scoring, with only weight as multiplier
        const normalizedScore = challengePoints / ctfTotalPoints;
        return normalizedScore * ctfWeight;
    }

    /**
     * Get user scores with normalized scoring algorithm
     */
    static async calculateUserScores(globalQuery: any = {}): Promise<Map<string, UserScore>> {
        const solves = await solveModel.find(globalQuery).lean();
        const userScores = new Map<string, UserScore>();

        // Calculate total points for each CTF for normalization
        const ctfTotalPoints = new Map<string, number>();
        for (const solve of solves) {
            const ctfId = solve.ctf_id || '';
            const points = solve.points || 100;
            ctfTotalPoints.set(ctfId, (ctfTotalPoints.get(ctfId) || 0) + points);
        }

        // Group solves by user
        for (const solve of solves) {
            for (const userId of solve.users) {
                if (!userScores.has(userId)) {
                    userScores.set(userId, {
                        userId,
                        totalScore: 0,
                        solveCount: 0,
                        ctfCount: 0,
                        categories: new Set<string>(),
                        recentSolves: [],
                        ctfBreakdown: new Map()
                    });
                }

                const userScore = userScores.get(userId)!;
                userScore.recentSolves.push({
                    ctf_id: solve.ctf_id || '',
                    challenge: solve.challenge || 'Unknown',
                    category: solve.category || 'Unknown',
                    points: solve.points || 100,
                    solved_at: solve.solved_at || new Date(),
                    users: solve.users || []
                });
            }
        }

        // Calculate scores for each user
        for (const [userId, userScore] of userScores) {
            for (const solve of userScore.recentSolves) {
                const ctfData = await infoEvent(solve.ctf_id);
                if (ctfData.weight === 0) {
                    ctfData.weight = 10;
                }

                // Calculate normalized score
                const ctfTotal = ctfTotalPoints.get(solve.ctf_id) || solve.points;
                const totalSolveScore = this.calculateBaseScore(solve.points, ctfData.weight, ctfTotal);
                
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
                        score: 0
                    });
                }
                
                const ctfBreakdown = userScore.ctfBreakdown.get(solve.ctf_id)!;
                ctfBreakdown.solves += 1;
                ctfBreakdown.points += solve.points;
                ctfBreakdown.score += totalSolveScore;
            }

            userScore.ctfCount = userScore.ctfBreakdown.size;
            
            // Sort recent solves by score descending
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
