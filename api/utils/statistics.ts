import { UserModel, solveModel } from "../../src/Database/connect";
import { 
    UserProfile, 
    UserRankingResult, 
    GlobalStats, 
    PerformanceComparison, 
    CategoryStat, 
    Achievement,
    UserSolve 
} from '../types';

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
 * Calculate category statistics for a user
 */
export async function calculateCategoryStats(
    userProfile: UserProfile,
    allUsers: UserProfile[],
    solveFilter?: (solve: UserSolve) => boolean
): Promise<CategoryStat[]> {
    // Get the User ObjectId from Discord ID first
    const userDoc = await UserModel.findOne({ discord_id: userProfile.userId }).lean();
    if (!userDoc) {
        console.error('User document not found for Discord ID:', userProfile.userId);
        return [];
    }

    // Get all solves for this user from database to ensure we have complete data
    const allSolvesQuery: any = { users: userDoc._id };
    if (solveFilter) {
        // If there's a CTF filter, apply it
        const sampleSolve = userProfile.recentSolves.find(s => solveFilter(s));
        if (sampleSolve) {
            allSolvesQuery.ctf_id = sampleSolve.ctf_id;
        }
    }

    const allSolves = await solveModel.find(allSolvesQuery).populate('challenge_ref').lean();
    
    // Process all solves to calculate scores per category
    const categoryStats = new Map<string, { solves: number; totalScore: number; solveList: any[] }>();
    
    for (const solve of allSolves) {
        // Get challenge data
        let challengeCategory = solve.category || 'misc';
        let challengePoints = 100;
        
        if (solve.challenge_ref && typeof solve.challenge_ref === 'object' && solve.challenge_ref !== null && 'points' in solve.challenge_ref) {
            const challengeRef = solve.challenge_ref as any;
            challengeCategory = challengeRef.category || challengeCategory;
            challengePoints = challengeRef.points || 100;
        }

        // Apply filter if provided
        const mockSolve = { category: challengeCategory, ctf_id: solve.ctf_id };
        if (solveFilter && !solveFilter(mockSolve as any)) {
            continue;
        }

        // Get CTF data for scoring calculation
        const ctfBreakdown = userProfile.ctfBreakdown.get(solve.ctf_id);
        if (!ctfBreakdown) continue;

        // Calculate the score for this individual solve using the same logic as FairScoringSystem
        // Get the average score per solve for this CTF
        const ctfSolveCount = allSolves.filter(s => s.ctf_id === solve.ctf_id).length;
        if (ctfSolveCount === 0) continue;
        
        const scorePerSolve = ctfBreakdown.score / ctfSolveCount;

        // Initialize category if not exists
        if (!categoryStats.has(challengeCategory)) {
            categoryStats.set(challengeCategory, { solves: 0, totalScore: 0, solveList: [] });
        }

        const categoryStat = categoryStats.get(challengeCategory)!;
        categoryStat.solves += 1;
        categoryStat.totalScore += scorePerSolve;
        categoryStat.solveList.push(solve);
    }

    // Convert to CategoryStat array
    return Array.from(categoryStats.entries())
        .filter(([_category, stats]) => stats.solves > 0)
        .map(([category, stats]) => {
            // Calculate category ranking
            const categoryParticipants = allUsers.filter(p => p.categories.has(category));
            const categoryRank = categoryParticipants
                .map(p => {
                    // Calculate score for this category for comparison
                    let pCategoryScore = 0;
                    const pCategorySolves = p.recentSolves.filter(s => 
                        s.category === category && (!solveFilter || solveFilter(s))
                    );
                    for (const solve of pCategorySolves) {
                        const ctfBreakdown = p.ctfBreakdown.get(solve.ctf_id);
                        if (ctfBreakdown) {
                            const ctfSolveCount = p.recentSolves.filter(s => s.ctf_id === solve.ctf_id).length;
                            if (ctfSolveCount > 0) {
                                pCategoryScore += ctfBreakdown.score / ctfSolveCount;
                            }
                        }
                    }
                    return pCategoryScore;
                })
                .filter(score => score > stats.totalScore).length + 1;

            return {
                name: category,
                solves: stats.solves,
                totalScore: Math.round(stats.totalScore * 100) / 100,
                avgPoints: stats.solves > 0 ? Math.round((stats.totalScore / stats.solves) * 100) / 100 : 0,
                rankInCategory: categoryRank,
                totalInCategory: categoryParticipants.length,
                percentile: Math.round((categoryRank / categoryParticipants.length) * 100)  
            };
        })
        .sort((a, b) => b.totalScore - a.totalScore);
}

/**
 * Generate achievements based on user performance
 */
export function generateAchievements(
    userProfile: UserProfile,
    userRank: number,
    totalUsers: number,
    globalStats: GlobalStats,
    allCategories: Set<string>,
    scope: 'global' | 'ctf' = 'global',
    ctfTitle?: string
): Achievement[] {
    const achievements: Achievement[] = [];
    const solvePercentage = (userProfile.solveCount / globalStats.totalSolves) * 100;
    
    // Ranking achievements
    if (userRank === 1) {
        achievements.push({ 
            name: scope === 'global' ? "Global Champion" : "CTF Champion", 
            description: scope === 'global' ? "#1 worldwide" : `#1 in ${ctfTitle}`, 
            icon: "👑" 
        });
    } else if (userRank <= 3) {
        const rankIcon = userRank === 2 ? "🥈" : "🥉";
        achievements.push({ 
            name: scope === 'global' ? "Global Podium" : "CTF Podium", 
            description: scope === 'global' ? `#${userRank} worldwide` : `#${userRank} in ${ctfTitle}`, 
            icon: rankIcon 
        });
    } else if (userRank <= Math.ceil(totalUsers * 0.05)) {
        achievements.push({ 
            name: "Elite", 
            description: scope === 'global' ? "Top 5% globally" : `Top 5% in ${ctfTitle}`, 
            icon: "⭐" 
        });
    } else if (userRank <= Math.ceil(totalUsers * 0.1)) {
        achievements.push({ 
            name: "Top 10%", 
            description: scope === 'global' ? "Top 10% globally" : `Top 10% in ${ctfTitle}`, 
            icon: "🌟" 
        });
    } else if (userRank <= Math.ceil(totalUsers * 0.25)) {
        achievements.push({ 
            name: "Top 25%", 
            description: scope === 'global' ? "Top 25% globally" : `Top 25% in ${ctfTitle}`, 
            icon: "⭐" 
        });
    }
    
    // Solve count achievements
    if (scope === 'global') {
        if (userProfile.solveCount >= 100) achievements.push({ name: "Century Club", description: "Solved 100+ challenges", icon: "💯" });
        else if (userProfile.solveCount >= 50) achievements.push({ name: "Veteran Solver", description: "Solved 50+ challenges", icon: "🎯" });
        else if (userProfile.solveCount >= 20) achievements.push({ name: "Active Solver", description: "Solved 20+ challenges", icon: "🔥" });
    } else {
        if (userProfile.solveCount >= 10) achievements.push({ name: "CTF Solver", description: "Solved 10+ challenges", icon: "🎯" });
    }
    
    // CTF participation achievements (global only)
    if (scope === 'global') {
        if (userProfile.ctfCount >= 10) achievements.push({ name: "CTF Explorer", description: "Participated in 10+ CTFs", icon: "🗺️" });
        else if (userProfile.ctfCount >= 5) achievements.push({ name: "Multi-CTF Player", description: "Participated in 5+ CTFs", icon: "🏆" });
    }
    
    // Category diversity achievements
    if (userProfile.categories.size >= Math.ceil(allCategories.size * 0.75)) {
        achievements.push({ 
            name: scope === 'global' ? "Polymath" : "Category Master", 
            description: scope === 'global' ? "Master of multiple categories" : "Solved challenges in most categories", 
            icon: "🧩" 
        });
    } else if (userProfile.categories.size >= Math.ceil(allCategories.size * 0.5)) {
        achievements.push({ name: "Versatile", description: "Active in many categories", icon: "🔧" });
    }
    
    // Contribution achievements
    const contributionThreshold = scope === 'global' ? 5 : 10;
    if (solvePercentage >= contributionThreshold) {
        achievements.push({ 
            name: scope === 'global' ? "Major Contributor" : "Active Participant", 
            description: `${Math.round(solvePercentage)}% of total ${scope === 'global' ? 'community' : 'CTF'} solves`, 
            icon: scope === 'global' ? "🌟" : "🔥" 
        });
    }
    
    return achievements;
}
