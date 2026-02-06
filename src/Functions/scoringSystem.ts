import { solveModel, ChallengeModel } from '../Database/connect';
import { infoEvent } from './ctftime-v2';
import { ChallengeSchemaType } from '../Database/challengeSchema';
import { UserSchemaType } from '../Database/userSchema';
import { getEffectiveWeight } from './weightUtils';

/**
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

/**
 * Get max solve count for multiple CTFs at once
 * This represents the maximum number of teams/users that solved any challenge in each CTF
 */
export async function getBulkCTFMaxSolves(ctfIds: string[]): Promise<Map<string, number>> {
    try {
        const challenges = await ChallengeModel.find({ ctf_id: { $in: ctfIds } }).lean();
        const ctfMaxSolves = new Map<string, number>();

        // Initialize with 1 (minimum to avoid division by zero)
        ctfIds.forEach(ctfId => ctfMaxSolves.set(ctfId, 1));

        // For each challenge, track the max solve count for its CTF
        challenges.forEach(challenge => {
            const ctfId = challenge.ctf_id;
            const solves = challenge.solves || 0;
            const currentMax = ctfMaxSolves.get(ctfId) || 1;
            if (solves > currentMax) {
                ctfMaxSolves.set(ctfId, solves);
            }
        });

        return ctfMaxSolves;
    } catch (error) {
        console.error('Error calculating bulk CTF max solves:', error);
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
    solves: number;
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
        logo: string;
    }>;
}

/**
 * ABSOLUTELY FAIR Scoring System:
 * - Rare solves highly appreciated (up to 25x multiplier)
 * - Less extreme penalties (minimum 10% of base score guaranteed)
 * - No time-based scoring
 * - Balanced for all play styles
 */
export class FairScoringSystem {
    private defaultCtfWeight: number;
    private defaultChallengePoints: number;

    constructor(
        defaultCtfWeight: number = 10,
        defaultChallengePoints: number = 100
    ) {
        this.defaultCtfWeight = defaultCtfWeight;
        this.defaultChallengePoints = defaultChallengePoints;
    }
    
    /**
     * Calculate difficulty multiplier with APPRECIATION for rare solves
     * and REASONABLE penalties for common ones
     * 
     * Key improvements:
     * - Rare solves get HUGE appreciation (up to 25x)
     * - Common solves still have value (minimum 10% guaranteed)
     * - Smoother curve between extremes
     */
    private static calculateDifficultyMultiplier(challengeSolves: number, maxSolvesInCTF: number): number {
        const effectiveMax = maxSolvesInCTF > 0 ? maxSolvesInCTF : 1;
        const effectiveSolves = challengeSolves > 0 ? challengeSolves : 1;
        
        // Calculate solve ratio (0 to 1, where 0 = hardest, 1 = easiest)
        const solveRatio = effectiveSolves / effectiveMax;
        
        // Use a BALANCED exponential curve that appreciates rare solves
        // without destroying common ones
        // Formula: 15.0 * e^(-5 * solveRatio) with minimum floor
        // - 0.5% solve ratio (ultra rare) ≈ 14.9x multiplier
        // - 1% solve ratio ≈ 14.3x multiplier
        // - 2% solve ratio ≈ 13.5x multiplier
        // - 5% solve ratio ≈ 11.9x multiplier
        // - 10% solve ratio ≈ 9.5x multiplier
        // - 20% solve ratio ≈ 5.5x multiplier
        // - 30% solve ratio ≈ 3.2x multiplier
        // - 40% solve ratio ≈ 1.8x multiplier
        // - 50% solve ratio ≈ 1.0x multiplier
        // - 75% solve ratio ≈ 0.3x multiplier
        // - 100% solve ratio ≈ 0.1x multiplier
        let multiplier = 15.0 * Math.exp(-5 * solveRatio);
        
        // Apply penalty for challenges with more than 50 solves
        if (challengeSolves > 50) {
            multiplier *= 0.5;
        }
        
        // GUARANTEE MINIMUM: Every challenge is worth at least 10% of base
        // This ensures grinding still has value
        const minimumMultiplier = 0.10;
        return Math.max(minimumMultiplier, multiplier);
    }

    /**
     * Calculate normalized score for a solve
     */
    private calculateBaseScore(
        challengePoints: number, 
        ctfWeight: number, 
        maxScore: number,
        challengeSolves: number,
        maxSolvesInCTF: number
    ): number {
        const effectiveMax = (typeof maxScore === 'number' && maxScore > 0) ? maxScore : challengePoints || 1;
        const normalizedScore = challengePoints / effectiveMax;
        
        const difficultyMultiplier = FairScoringSystem.calculateDifficultyMultiplier(challengeSolves, maxSolvesInCTF);
        
        return (normalizedScore * ctfWeight * difficultyMultiplier);
    }

    /**
     * Get user scores with ABSOLUTELY FAIR scoring algorithm
     */
    static async calculateUserScores(globalQuery: any = {}): Promise<Map<string, UserScore>> {
        const instance = new FairScoringSystem();
        const solves = await solveModel.find(globalQuery).populate<{challenge_ref: ChallengeSchemaType}>('challenge_ref').populate<{users: UserSchemaType[]}>('users').lean();
        const userScores = new Map<string, UserScore>();
        let processedCount = 0;
        const errors: { solveId: string; message: string }[] = [];

        const ctfIds = Array.from(new Set(solves.map(solve => solve.ctf_id || '').filter(id => id)));
        const ctfMaxPoints = await getBulkCTFMaxPoints(ctfIds);
        const ctfMaxSolves = await getBulkCTFMaxSolves(ctfIds);

        // Bulk-fetch CTF data
        const ctfDataMap = new Map<string, Awaited<ReturnType<typeof infoEvent>>>();
        try {
            const ctfDataPromises = ctfIds.map(async (id) => {
                try {
                    const data = await infoEvent(id);
                    ctfDataMap.set(id, data);
                } catch (err) {
                    errors.push({ solveId: id, message: `Failed to fetch CTF data for ${id}: ${(err as Error).message}` });
                }
            });
            await Promise.all(ctfDataPromises);
        } catch (err) {
            console.error('Error in bulk CTF data fetch:', err);
        }

        // Precompute effective weights once per CTF.
        // Important: CTFtime uses weight=0 for unrated/unvoted events. Using a global average here
        // makes unrated events score like high-weight events, which inflates results.
        const effectiveWeightMap = new Map<string, number>();
        await Promise.all(ctfIds.map(async (id) => {
            const ctfData = ctfDataMap.get(id);
            if (!ctfData) return;
            try {
                const effectiveWeight = await getEffectiveWeight(id, ctfData.weight || 0);
                effectiveWeightMap.set(id, effectiveWeight);
            } catch (err) {
                console.error(`Error computing effective weight for CTF ${id}:`, err);
                effectiveWeightMap.set(id, ctfData.weight || 0);
            }
        }));

        // Group solves by user
        for (const solve of solves) {
            processedCount++;
            try {
                if (!solve.challenge_ref) {
                    errors.push({ solveId: solve._id.toString(), message: 'Missing challenge_ref' });
                    continue;
                }
                
                let challengeName = solve.challenge_ref.name || 'Unknown';
                let challengeCategory = solve.challenge_ref.category || 'Unknown';
                let challengePoints = solve.challenge_ref.points || instance.defaultChallengePoints;
                let challengeSolves = solve.challenge_ref.solves || 0;

                const userDiscordIds: string[] = [];
                if (Array.isArray(solve.users)) {
                    for (const user of solve.users) {
                        if (typeof user === 'object' && user !== null && 'discord_id' in user) {
                            const populatedUser = user as UserSchemaType;
                            userDiscordIds.push(populatedUser.discord_id);
                        } else if (typeof user === 'string') {
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
                        users: userDiscordIds,
                        solves: challengeSolves
                    });
                }
            } catch (err) {
                errors.push({ solveId: solve._id.toString(), message: `Error processing solve: ${(err as Error).message}` });
            }
        }

        // Calculate scores for each user
        for (const [_userId, userScore] of userScores) {
            const allSolveScores: number[] = [];
            
            for (const solve of userScore.recentSolves) {
                try {
                    const ctfData = ctfDataMap.get(solve.ctf_id);
                    if (!ctfData) {
                        continue;
                    }
                    const ctfWeight = effectiveWeightMap.get(solve.ctf_id) ?? (ctfData.weight || 0);

                    const ctfMax = ctfMaxPoints.get(solve.ctf_id) || solve.points || instance.defaultChallengePoints;
                    const ctfMaxSolve = ctfMaxSolves.get(solve.ctf_id) || 1;

                    const totalSolveScore = instance.calculateBaseScore(
                        solve.points, 
                        ctfWeight, 
                        ctfMax,
                        solve.solves,
                        ctfMaxSolve
                    );
                    
                    allSolveScores.push(totalSolveScore);
                    userScore.solveCount += 1;
                    userScore.categories.add(solve.category);

                    if (!userScore.ctfBreakdown.has(solve.ctf_id)) {
                        userScore.ctfBreakdown.set(solve.ctf_id, {
                            ctfTitle: ctfData.title,
                            weight: ctfWeight,
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
                } catch (err) {
                    errors.push({ solveId: solve.ctf_id, message: `Error calculating score for solve in CTF ${solve.ctf_id}: ${(err as Error).message}` });
                }
            }

            // Pure sum of all solve scores
            userScore.totalScore = allSolveScores.reduce((sum, score) => sum + score, 0);
            userScore.ctfCount = userScore.ctfBreakdown.size;
            
            userScore.recentSolves = userScore.recentSolves
                .sort((a, b) => b.points - a.points)
                .slice(0, 10);
        }

        // Log metrics if errors occurred
        if (errors.length > 0) {
            console.error(`Processed ${processedCount} solves with ${errors.length} errors:`, errors);
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
