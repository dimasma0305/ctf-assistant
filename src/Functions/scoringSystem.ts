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
 * Calculate fair score based on:
 * - Challenge points
 * - CTF weight (difficulty multiplier)
 * - Diversity bonus (solving challenges from multiple CTFs)
 * - Category diversity bonus
 * - Diminishing returns for same CTF
 */
export class FairScoringSystem {
    
    /**
     * Calculate base score for a solve
     */
    private static calculateBaseScore(challengePoints: number, ctfWeight: number): number {
        // Base formula: points * (weight / 25) where 25 is average CTF weight
        // This ensures that higher weight CTFs give proportionally more points
        return challengePoints * (ctfWeight / 25.0);
    }

    /**
     * Apply diminishing returns for multiple solves in same CTF
     */
    private static applyDiminishingReturns(baseScore: number, solveCountInCTF: number): number {
        // Diminishing returns: 1.0, 0.9, 0.8, 0.7, 0.6, 0.5 (minimum)
        const multiplier = Math.max(0.5, 1.0 - (solveCountInCTF - 1) * 0.1);
        return baseScore * multiplier;
    }

    /**
     * Calculate diversity bonus based on number of unique CTFs and categories
     */
    private static calculateDiversityBonus(
        totalScore: number, 
        ctfCount: number, 
        categoryCount: number
    ): number {
        // CTF diversity: bonus for participating in multiple CTFs
        const ctfDiversityBonus = Math.min(ctfCount * 0.05, 0.3); // Max 30% bonus
        
        // Category diversity: bonus for solving different types of challenges
        const categoryDiversityBonus = Math.min(categoryCount * 0.02, 0.2); // Max 20% bonus
        
        return totalScore * (ctfDiversityBonus + categoryDiversityBonus);
    }

    /**
     * Calculate time bonus for early solves (within first 24 hours of CTF)
     */
    private static calculateTimeBonus(
        solve: UserSolve, 
        ctfStartTime: Date, 
        baseScore: number
    ): number {
        const solveTime = solve.solved_at.getTime();
        const startTime = ctfStartTime.getTime();
        const hoursFromStart = (solveTime - startTime) / (1000 * 60 * 60);
        
        // Early solve bonus: decreases from 20% to 0% over first 24 hours
        if (hoursFromStart <= 24) {
            const timeMultiplier = Math.max(0, 0.2 * (1 - hoursFromStart / 24));
            return baseScore * timeMultiplier;
        }
        
        return 0;
    }

    /**
     * Get user scores with fair scoring algorithm
     */
    static async calculateUserScores(globalQuery: any = {}): Promise<Map<string, UserScore>> {
        const solves = await solveModel.find(globalQuery).lean();
        const userScores = new Map<string, UserScore>();
        const ctfCache = new Map<string, any>();

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
            const ctfSolveCounts = new Map<string, number>();
            
            for (const solve of userScore.recentSolves) {
                // Get CTF data (cached or fetch)
                let ctfData;
                if (!ctfCache.has(solve.ctf_id)) {
                    try {
                        ctfData = await infoEvent(solve.ctf_id);
                        ctfCache.set(solve.ctf_id, ctfData);
                    } catch (error) {
                        console.error(`Error fetching CTF ${solve.ctf_id}:`, error);
                        // Use default values if fetch fails
                        ctfData = { weight: 25, title: `CTF ${solve.ctf_id}`, start: new Date() };
                        ctfCache.set(solve.ctf_id, ctfData);
                    }
                } else {
                    ctfData = ctfCache.get(solve.ctf_id);
                }

                // Track solve count for this CTF (for diminishing returns)
                const currentCtfSolves = ctfSolveCounts.get(solve.ctf_id) || 0;
                ctfSolveCounts.set(solve.ctf_id, currentCtfSolves + 1);

                // Calculate base score
                const baseScore = this.calculateBaseScore(solve.points, ctfData.weight);
                
                // Apply diminishing returns
                const diminishedScore = this.applyDiminishingReturns(baseScore, currentCtfSolves + 1);
                
                // Calculate time bonus
                const timeBonus = this.calculateTimeBonus(solve, ctfData.start, baseScore);
                
                const totalSolveScore = diminishedScore + timeBonus;
                
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

            // Calculate diversity bonuses
            userScore.ctfCount = userScore.ctfBreakdown.size;
            const diversityBonus = this.calculateDiversityBonus(
                userScore.totalScore,
                userScore.ctfCount,
                userScore.categories.size
            );
            
            userScore.totalScore += diversityBonus;
            
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
