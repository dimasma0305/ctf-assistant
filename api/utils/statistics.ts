import { UserModel, solveModel, ChallengeSchemaType } from "../../src/Database/connect";
import { 
    UserProfile, 
    UserRankingResult, 
    GlobalStats, 
    PerformanceComparison, 
    CategoryStat, 
    UserSolve,
    MonthlyRank 
} from '../types';
import { categoryNormalize } from './common';
import { 
    ACHIEVEMENT_CRITERIA, 
} from '../../ui/lib/achievements';

type SolveWithChallenge = {
    users?: any[];
    solved_at: Date;
    ctf_id: string;
    // When populated, contains at least category/points/name.
    challenge_ref?: Partial<ChallengeSchemaType> | null;
    // Back-compat: some callers may still provide a raw category field.
    category?: string;
};

/**
 * Statistics and Calculation Utilities
 */

/**
 * Calculate user's rank among a collection of users
 */
export function calculateUserRank(userId: string, userScores: Map<string, UserProfile>): UserRankingResult {
    const allUsers = Array.from(userScores.values())
        .sort((a, b) => b.totalScore - a.totalScore);
    const userRank = allUsers.findIndex(user => user.userId === userId) + 1;
    const totalUsers = allUsers.length;
    const percentile = Math.round((userRank / totalUsers) * 100);
    
    return { rank: userRank, totalUsers, percentile };
}

/**
 * Calculate global statistics from user scores
 */
export function calculateGlobalStats(userScores: Map<string, UserProfile>): GlobalStats {
    const allUsers = Array.from(userScores.values());
    const totalSolves = allUsers.reduce((sum, user) => sum + user.solveCount, 0);
    const totalScore = allUsers.reduce((sum, user) => sum + user.totalScore, 0);
    const avgScore = totalScore / allUsers.length;
    const sortedUsers = allUsers.sort((a, b) => b.totalScore - a.totalScore);
    const medianScore = sortedUsers[Math.floor(allUsers.length / 2)]?.totalScore || 0;
    
    return { totalSolves, totalScore, avgScore, medianScore };
}

/**
 * Calculate performance comparison against averages
 */
export function calculatePerformanceComparison(
    userProfile: UserProfile, 
    globalStats: GlobalStats, 
    totalUsers: number
): PerformanceComparison {
    return {
        scoreVsAverage: {
            user: Math.round(userProfile.totalScore * 100) / 100,
            average: Math.round(globalStats.avgScore * 100) / 100,
            percentageDiff: Math.round(((userProfile.totalScore - globalStats.avgScore) / globalStats.avgScore) * 100)
        },
        scoreVsMedian: {
            user: Math.round(userProfile.totalScore * 100) / 100,
            median: Math.round(globalStats.medianScore * 100) / 100,
            percentageDiff: Math.round(((userProfile.totalScore - globalStats.medianScore) / globalStats.medianScore) * 100)
        },
        solvesVsAverage: {
            user: userProfile.solveCount,
            average: Math.round(globalStats.totalSolves / totalUsers * 100) / 100,
            percentageDiff: Math.round(((userProfile.solveCount - (globalStats.totalSolves / totalUsers)) / (globalStats.totalSolves / totalUsers)) * 100)
        }
    };
}

/**
 * Calculate category statistics for a user - optimized version
 */
export async function calculateCategoryStats(
    userProfile: UserProfile,
    allUsers: UserProfile[],
    options?: { ctfId?: string }
): Promise<CategoryStat[]> {
    try {
        // IMPORTANT: userProfile.recentSolves is intentionally capped (currently top 10),
        // so using it for category breakdown massively undercounts categories for users
        // with >10 solves (often showing ~1% per category in the UI). For accurate
        // category stats, fetch solves from the DB unless the user has <= recentSolves.

        const buildCtfIdMatcher = (ctfId: string) => {
            const asNumber = Number(ctfId);
            if (Number.isFinite(asNumber)) {
                return { $in: [ctfId, asNumber] };
            }
            return ctfId;
        };

        const needsDb = userProfile.solveCount > userProfile.recentSolves.length || !!options?.ctfId;

        let relevantSolves: UserSolve[] = userProfile.recentSolves;

        if (needsDb) {
            const userDoc = await UserModel.findOne({ discord_id: userProfile.userId }, { _id: 1 }).lean();
            if (!userDoc) {
                console.error('User document not found for Discord ID:', userProfile.userId);
                return [];
            }

            const allSolvesQuery: any = { users: userDoc._id };
            if (options?.ctfId) {
                allSolvesQuery.ctf_id = buildCtfIdMatcher(options.ctfId);
            }

            // Fetch only the data we need for category grouping.
            const allSolves = await solveModel
                .find(allSolvesQuery, { ctf_id: 1, challenge_ref: 1, solved_at: 1, users: 1 })
                .populate<{ challenge_ref: ChallengeSchemaType }>('challenge_ref', 'name category')
                .lean();

            relevantSolves = allSolves
                .filter((solve) => solve.challenge_ref)
                .map((solve) => ({
                    ctf_id: solve.ctf_id,
                    challenge: solve.challenge_ref.name || 'Challenge',
                    category: categoryNormalize(solve.challenge_ref.category || 'misc'),
                    // points are not required for category % bars; keep a safe default
                    points: 100,
                    solved_at: solve.solved_at,
                    users: Array.isArray(solve.users) ? solve.users.map((id: any) => id.toString()) : []
                }));
        } else {
            // Normalize categories even when using the cached sample.
            relevantSolves = relevantSolves.map((s) => ({
                ...s,
                category: categoryNormalize(s.category || 'misc')
            }));
        }

        // Process solves efficiently to calculate scores per category
        const categoryStats = new Map<string, { solves: number; totalScore: number }>();

        // Precompute solve count per CTF for score attribution without O(n^2) filtering.
        const ctfSolveCounts = new Map<string, number>();
        for (const solve of relevantSolves) {
            const ctfId = solve.ctf_id;
            if (!ctfId) continue;
            ctfSolveCounts.set(ctfId, (ctfSolveCounts.get(ctfId) || 0) + 1);
        }

        for (const solve of relevantSolves) {
            const challengeCategory = categoryNormalize(solve.category || 'misc');

            const ctfBreakdown = userProfile.ctfBreakdown.get(solve.ctf_id);
            if (!ctfBreakdown) continue;

            const ctfSolveCount = ctfSolveCounts.get(solve.ctf_id) || 0;
            if (ctfSolveCount === 0) continue;

            const scorePerSolve = ctfBreakdown.score / ctfSolveCount;

            const existing = categoryStats.get(challengeCategory) || { solves: 0, totalScore: 0 };
            categoryStats.set(challengeCategory, {
                solves: existing.solves + 1,
                totalScore: existing.totalScore + scorePerSolve
            });
        }

        // Convert to CategoryStat array with efficient ranking calculation
        return Array.from(categoryStats.entries())
            .filter(([_category, stats]) => stats.solves > 0)
            .map(([category, stats]) => {
                // Simplified ranking calculation using existing data
                const categoryParticipants = allUsers.filter((p) =>
                    Array.from(p.categories).some((c) => categoryNormalize(c) === category)
                );
                
                // Estimate ranking based on solve count and total score
                const totalInCategory = categoryParticipants.length;
                const categoryRank = totalInCategory > 0
                    ? Math.max(1, Math.floor(totalInCategory * 0.3)) // Rough estimate
                    : 1;
                
                return {
                    name: category,
                    solves: stats.solves,
                    totalScore: Math.round(stats.totalScore * 100) / 100,
                    avgPoints: stats.solves > 0 ? Math.round((stats.totalScore / stats.solves) * 100) / 100 : 0,
                    rankInCategory: categoryRank,
                    totalInCategory: totalInCategory,
                    percentile: totalInCategory > 0 ? Math.round((categoryRank / totalInCategory) * 100) : 100
                };
            })
            .sort((a, b) => b.totalScore - a.totalScore);
            
    } catch (error) {
        console.error('Error calculating category stats:', error);
        return [];
    }
}

/**
 * Calculate extended achievement metrics for multiple user profiles efficiently
 */
export async function calculateExtendedMetricsForUsers(
    userProfiles: Map<string, UserProfile>, 
    includeExtendedMetrics: boolean = true
): Promise<Map<string, Partial<UserProfile>>> {
    const results = new Map<string, Partial<UserProfile>>();
    
    // Skip extended metrics calculation if not needed
    if (!includeExtendedMetrics) {
        for (const discordId of userProfiles.keys()) {
            results.set(discordId, {});
        }
        return results;
    }
    
    // Early return for empty dataset
    if (userProfiles.size === 0) {
        return results;
    }
    
    try {
        // Get all Discord IDs
        const discordIds = Array.from(userProfiles.keys());
        
        // Get all user documents in one optimized query
        const userDocs = await UserModel.find({ 
            discord_id: { $in: discordIds } 
        }, { discord_id: 1, _id: 1 }).lean(); // Only fetch needed fields
        
        // Create efficient lookup maps
        const userDocLookup = new Map<string, any>();
        const objectIdToDiscordId = new Map<string, string>();
        
        userDocs.forEach(doc => {
            userDocLookup.set(doc.discord_id, doc);
            objectIdToDiscordId.set(doc._id.toString(), doc.discord_id);
        });
        
        // Early return if no user docs found
        if (userDocs.length === 0) {
            for (const discordId of userProfiles.keys()) {
                results.set(discordId, {});
            }
            return results;
        }
        
        // Get all solves for all users in one optimized query
        const userObjectIds = userDocs.map(doc => doc._id);
        const allSolves = await solveModel.find({ 
            users: { $in: userObjectIds } 
        }, {
            // Only fetch essential fields to reduce memory usage
            users: 1, 
            solved_at: 1, 
            ctf_id: 1, 
            challenge_ref: 1
        }).lean();

        // Solve docs do not store category/points; populate challenge_ref so achievements can
        // reliably compute categorySolves (e.g. 20+ web) and difficulty heuristics.
        await solveModel.populate(allSolves, { path: "challenge_ref", select: "name category points" });
        
        // Efficiently group solves by user using the lookup map
        const solvesByUser = new Map<string, any[]>();
        
        // Initialize empty arrays for all users
        for (const discordId of discordIds) {
            solvesByUser.set(discordId, []);
        }
        
        // Group solves efficiently
        for (const solve of allSolves) {
            for (const userId of solve.users) {
                const discordId = objectIdToDiscordId.get(userId.toString());
                if (discordId && solvesByUser.has(discordId)) {
                    solvesByUser.get(discordId)!.push(solve);
                }
            }
        }
        
        // Calculate metrics for each user in parallel batches
        const batchSize = 50; // Process in smaller batches to avoid memory issues
        const discordIdArray = Array.from(userProfiles.keys());
        
        for (let i = 0; i < discordIdArray.length; i += batchSize) {
            const batch = discordIdArray.slice(i, i + batchSize);
            const batchPromises = batch.map(async (discordId) => {
                const userProfile = userProfiles.get(discordId)!;
                const userSolves = solvesByUser.get(discordId) || [];
                const metrics = await calculateExtendedMetricsSync(userProfile, userSolves);
                return { discordId, metrics };
            });
            
            const batchResults = await Promise.all(batchPromises);
            batchResults.forEach(({ discordId, metrics }) => {
                results.set(discordId, metrics);
            });
        }
        
    } catch (error) {
        console.error('Error calculating extended metrics:', error);
        // Return empty metrics for all users on error
        for (const discordId of userProfiles.keys()) {
            results.set(discordId, {});
        }
    }
    
    return results;
}

/**
 * Calculate extended achievement metrics for a user profile
 */
export async function calculateExtendedMetrics(userProfile: UserProfile, allSolves?: any[]): Promise<Partial<UserProfile>> {
    return calculateExtendedMetricsForSingleUser(userProfile, allSolves);
}

/**
 * Synchronous version of extended metrics calculation when data is already available
 */
export async function calculateExtendedMetricsSync(userProfile: UserProfile, allSolves: any[]): Promise<Partial<UserProfile>> {
    return await calculateExtendedMetricsCore(userProfile, allSolves);
}

/**
 * Internal function to calculate extended metrics for a single user
 */
async function calculateExtendedMetricsForSingleUser(userProfile: UserProfile, allSolves?: any[]): Promise<Partial<UserProfile>> {
    // If we don't have allSolves, fetch them from database
    if (!allSolves) {
        // Get the User ObjectId from Discord ID first
        const userDoc = await UserModel.findOne({ discord_id: userProfile.userId }, { _id: 1 }).lean();
        if (!userDoc) {
            return {};
        }
        
        // Only fetch essential fields for single user
        allSolves = await solveModel.find({ users: userDoc._id }, {
            users: 1, 
            solved_at: 1, 
            ctf_id: 1, 
            challenge_ref: 1
        }).lean();

        await solveModel.populate(allSolves, { path: "challenge_ref", select: "name category points" });
    }
    
    return calculateExtendedMetricsCore(userProfile, allSolves);
}

/**
 * Core calculation logic for extended metrics - optimized and synchronous
 */
async function calculateExtendedMetricsCore(userProfile: UserProfile, allSolves: any[]): Promise<Partial<UserProfile>> {
    // Early return for empty solves
    if (!allSolves || allSolves.length === 0) {
        return {
            categorySolves: {},
            fastSolves: 0,
            ultraFastSolves: 0,
            longestStreak: 0,
            weekendSolveRatio: 0,
            nightSolves: 0,
            morningSolves: 0,
            firstBloods: 0,
            hardSolves: 0,
            expertSolves: 0,
            uniqueChallengeTypes: 0,
            teamCTFs: 0,
            membershipDays: 365, // Default
            helpedUsers: 0,
            rankImprovement: 0
        };
    }
    
    // Initialize counters
    const categorySolves: Record<string, number> = {};
    let fastSolves = 0;
    let ultraFastSolves = 0;
    let nightSolves = 0;
    let morningSolves = 0;
    let weekendSolves = 0;
    let hardSolves = 0;
    let expertSolves = 0;
    let firstBloods = 0;
    let helpedUsers = 0; // Count of challenges solved together with others
    
    const solveDates: number[] = []; // Use timestamps for better performance
    const challengeTypes = new Set<string>();
    // get user by discord id
    const user = await UserModel.findOne({ discord_id: userProfile.userId }, { _id: 1, created_at: 1 }).lean();
    if (!user) {
        return {};
    }
    const membershipDays = Math.floor((new Date().getTime() - user.created_at.getTime()) / (1000 * 60 * 60 * 24));
    
    // Calculate rank improvement from monthly rank history
    // Note: This is now calculated in the bulk processing function above for efficiency
    // Individual calculations will use placeholder logic to avoid expensive calls
    let rankImprovement = 0;
    if (userProfile.solveCount > 50) {
        // Estimate rank improvement based on solve activity and scoring patterns
        const recentActivity = userProfile.recentSolves.length;
        const avgScore = userProfile.totalScore / Math.max(userProfile.solveCount, 1);
        rankImprovement = Math.floor((recentActivity * avgScore) / 100); // Rough estimate
    }
    
    // Single pass through all solves for efficiency
    for (const solve of allSolves as SolveWithChallenge[]) {
        const solveTime = new Date(solve.solved_at).getTime();
        solveDates.push(solveTime);
        
        // Get challenge data with defaults (Solve does not store category/points directly).
        const rawCategory = solve.challenge_ref?.category || solve.category || 'misc';
        const challengeCategory = categoryNormalize(rawCategory);
        const challengePoints = typeof solve.challenge_ref?.points === 'number' ? solve.challenge_ref.points : 100;
        
        // Count category solves
        categorySolves[challengeCategory] = (categorySolves[challengeCategory] || 0) + 1;
        challengeTypes.add(challengeCategory);
        
        // Calculate timing-based metrics
        const solveDate = new Date(solveTime);
        const hour = solveDate.getHours();
        const dayOfWeek = solveDate.getDay();
        
        // Fast solves based on points (heuristic)
        if (challengePoints <= 100) {
            fastSolves++;
            if (challengePoints <= 50) {
                ultraFastSolves++;
            }
        }
        
        // Time-based metrics
        if (hour >= 22 || hour < 6) nightSolves++;
        if (hour >= 5 && hour < 8) morningSolves++;
        if (dayOfWeek === 0 || dayOfWeek === 6) weekendSolves++;
        
        // Difficulty-based metrics (heuristic based on points)
        if (challengePoints >= 400) hardSolves++;
        if (challengePoints >= 500) {
            expertSolves++;
            firstBloods++; // High-point challenges might be first bloods
        }
        
        // Team solve detection - count challenges solved together with others
        if (solve.users && solve.users.length > 1) {
            helpedUsers++; // Each challenge solved with others counts as helping/being helped
        }
    }

    // Calculate consecutive solving streak efficiently
    let longestStreak = 0;
    if (solveDates.length > 0) {
        solveDates.sort((a, b) => a - b); // Sort timestamps
        
        let currentStreak = 1;
        let lastDay = Math.floor(solveDates[0] / (1000 * 60 * 60 * 24));
        
        for (let i = 1; i < solveDates.length; i++) {
            const currentDay = Math.floor(solveDates[i] / (1000 * 60 * 60 * 24));
            if (currentDay === lastDay + 1 || currentDay === lastDay) {
                if (currentDay !== lastDay) {
                    currentStreak++;
                }
            } else {
                longestStreak = Math.max(longestStreak, currentStreak);
                currentStreak = 1;
            }
            lastDay = currentDay;
        }
        longestStreak = Math.max(longestStreak, currentStreak);
    }
    
    const totalSolves = allSolves.length;
    
    // Return optimized metrics object
    return {
        categorySolves,
        fastSolves,
        ultraFastSolves,
        longestStreak,
        weekendSolveRatio: totalSolves > 0 ? weekendSolves / totalSolves : 0,
        nightSolves,
        morningSolves,
        firstBloods,
        hardSolves,
        expertSolves,
        uniqueChallengeTypes: challengeTypes.size,
        teamCTFs: Math.max(1, Math.floor(helpedUsers / 3)), // Estimate team CTFs from collaborative solves
        membershipDays,
        
        // Community-based metrics
        helpedUsers,
        rankImprovement
    };
}

/**
 * Calculate rank improvement from monthly rank history data
 * This function should be called with actual monthly rank data when available
 */
export function calculateRankImprovement(monthlyRanks: MonthlyRank[]): number {
    if (!monthlyRanks || monthlyRanks.length < 2) {
        return 0;
    }
    
    // Sort by month to ensure chronological order
    const sortedRanks = monthlyRanks.sort((a, b) => a.month.localeCompare(b.month));
    
    // Calculate improvement from first to last recorded rank
    const firstRank = sortedRanks[0].rank;
    const lastRank = sortedRanks[sortedRanks.length - 1].rank;
    
    // Rank improvement is positive when rank number goes down (better position)
    const improvement = firstRank - lastRank;
    
    return Math.max(0, improvement); // Return 0 if rank got worse
}

/**
 * Generate achievements based on user performance using shared achievement definitions
 */
export function generateAchievementIds(
    userProfile: UserProfile,
    userRank: number,
    totalUsers: number,
    globalStats: GlobalStats,
    allCategories: Set<string>,
    scope: 'global' | 'ctf' = 'global',
    ctfTitle?: string
): string[] {
    const achievementIds: string[] = [];
    
    // Check all achievement criteria
    for (const criteria of ACHIEVEMENT_CRITERIA) {
        // Skip achievements that don't match the current scope
        if (scope === 'global' && criteria.scope === 'ctf') continue;
        if (scope === 'ctf' && criteria.scope === 'global') continue;
        
        let shouldAward = false;
        
        if (scope === 'global' && criteria.checkGlobal) {
            shouldAward = criteria.checkGlobal({
                userProfile,
                userRank,
                totalUsers,
                globalStats,
                allCategories
            });
        } else if (scope === 'ctf' && criteria.checkCTF) {
            shouldAward = criteria.checkCTF({
                userProfile,
                userRank,
                totalUsers,
                ctfStats: globalStats,
                allCategories,
                ctfTitle
            });
        }
        if (shouldAward) {
            achievementIds.push(criteria.id);
        }
    }
    
    return achievementIds;
}
