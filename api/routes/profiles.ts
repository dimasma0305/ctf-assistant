import { Router } from 'express';
import { getCachedUserScores } from '../services/dataService';
import { 
    calculateUserRank, 
    calculateGlobalStats, 
    calculateCategoryStats, 
    calculatePerformanceComparison, 
    generateAchievementIds     
} from '../utils/statistics';
import { formatErrorResponse, categoryNormalize } from '../utils/common';
import { UserModel, solveModel } from '../../src/Database/connect';
import type { UserSchemaType, ChallengeSchemaType } from '../../src/Database/connect';

const router = Router();

function buildCtfIdMatcher(ctfId: string) {
    const asNumber = Number(ctfId);
    if (Number.isFinite(asNumber)) {
        return { $in: [ctfId, asNumber] };
    }
    return ctfId;
}

async function getUserCtfSolves(userId: string, ctfId: string) {
    // Resolve discord_id -> User _id, then fetch solves with populated challenge metadata.
    const userDoc = await UserModel.findOne({ discord_id: userId }, { _id: 1 }).lean();
    // Solve.users is an ObjectId[]; never include the raw Discord ID in the query
    // or Mongoose will throw a CastError.
    if (!userDoc) {
        return [];
    }
    const ctfIdMatcher = buildCtfIdMatcher(ctfId);

    const solves = await solveModel
        .find({ ctf_id: ctfIdMatcher, users: userDoc._id })
        .populate<{ challenge_ref: ChallengeSchemaType }>('challenge_ref')
        .populate<{ users: UserSchemaType[] }>('users')
        .sort({ solved_at: -1 })
        .lean();

    return solves
        .filter((solve) => solve.challenge_ref)
        .map((solve) => {
            const challenge = solve.challenge_ref as unknown as ChallengeSchemaType;
            const teammates = Array.isArray(solve.users)
                ? solve.users
                    .map((u) => {
                        if (u && typeof u === 'object' && 'discord_id' in u) return (u as unknown as UserSchemaType).discord_id;
                        if (typeof u === 'string') return u;
                        return undefined;
                    })
                    .filter((id): id is string => typeof id === 'string' && id !== userId)
                : [];

            return {
                ctf_id: solve.ctf_id,
                challenge: challenge.name || 'Unknown',
                category: categoryNormalize(challenge.category || 'misc'),
                points: challenge.points || 0,
                solved_at: solve.solved_at,
                isTeamSolve: teammates.length > 0,
                teammates,
            };
        });
}

/**
 * GET /api/profile/:id
 * 
 * Returns global user profile with comprehensive statistics
 */
router.get("/:id", async (req, res) => {
    try {
        const { id: userId } = req.params;
        
        if (!userId) {
            res.status(400).json(formatErrorResponse(400, "User ID is required", undefined, req));
            return;
        }

        // Get global user scores (using cache) - always include extended metrics for profiles
        const globalUserScores = await getCachedUserScores({}, undefined, true);
        const userProfile = globalUserScores.get(userId);
        
        if (!userProfile) {
            res.status(404).json(formatErrorResponse(
                404, 
                "User not found", 
                `No participation data found for user ${userId}`,
                req
            ));
            return;
        }

        // Calculate user's global rank using utility function
        const { rank: userRank, totalUsers, percentile } = calculateUserRank(userId, globalUserScores);
        
        // Calculate global statistics using utility function
        const globalStats = calculateGlobalStats(globalUserScores);
        
        // Get all users and categories for additional calculations
        const allUsers = Array.from(globalUserScores.values());
        const allCategories = new Set<string>();
        allUsers.forEach(user => {
            user.categories.forEach(cat => allCategories.add(cat));
        });

        // User's category performance across all CTFs using utility function
        const categoryStats = await calculateCategoryStats(userProfile, allUsers);

        // Recent solves across all CTFs (sorted by date)
        const recentSolves = userProfile.recentSolves
            .sort((a, b) => new Date(b.solved_at).getTime() - new Date(a.solved_at).getTime())
            .slice(0, 20) // Show last 20 solves
            .map(solve => ({
                ctf_id: solve.ctf_id,
                challenge: solve.challenge,
                category: categoryNormalize(solve.category),
                points: solve.points,
                solved_at: solve.solved_at,
                isTeamSolve: solve.users.length > 1,
                teammates: solve.users.filter(id => id !== userId)
            }));

        // CTF breakdown (convert Map to sorted array)
        const ctfBreakdown = Array.from(userProfile.ctfBreakdown.entries())
            .map(([ctfId, breakdown]) => ({
                ctf_id: ctfId,
                ctfTitle: breakdown.ctfTitle,
                weight: breakdown.weight,
                solves: breakdown.solves,
                points: breakdown.points,
                score: Math.round(breakdown.score * 100) / 100,
                logo: breakdown.logo
            }))
            .sort((a, b) => b.score - a.score);

        // Global achievements using utility function
        const achievements = generateAchievementIds(
            userProfile, 
            userRank, 
            totalUsers, 
            globalStats, 
            allCategories, 
            'global'
        );

        // Performance comparison using utility function
        const performanceComparison = calculatePerformanceComparison(userProfile, globalStats, totalUsers);

        // Response data
        const globalProfileData = {
            user: {
                userId,
                username: userProfile.username,
                displayName: userProfile.displayName,
                avatar: userProfile.avatar
            },
            globalRank: userRank,
            totalUsers: totalUsers,
            percentile: percentile,
            stats: {
                totalScore: Math.round(userProfile.totalScore * 100) / 100,
                solveCount: userProfile.solveCount,
                ctfCount: userProfile.ctfCount,
                categoriesCount: userProfile.categories.size,
                averagePointsPerSolve: userProfile.solveCount > 0 ? Math.round((userProfile.totalScore / userProfile.solveCount) * 100) / 100 : 0,
                contributionToTotal: Math.round((userProfile.solveCount / globalStats.totalSolves) * 100 * 100) / 100
            },
            categoryBreakdown: categoryStats,
            ctfBreakdown: ctfBreakdown,
            recentSolves: recentSolves,
            achievementIds: achievements,
            performanceComparison: performanceComparison,
            globalOverview: {
                totalUsers: totalUsers,
                totalSolves: globalStats.totalSolves,
                averageScore: Math.round(globalStats.avgScore * 100) / 100,
                medianScore: Math.round(globalStats.medianScore * 100) / 100,
                totalCategories: allCategories.size,
                categories: Array.from(allCategories)
            },
            metadata: {
                profileGenerated: new Date().toISOString(),
                dataSource: "Fair Scoring System",
                scope: "global"
            }
        };

        res.json(globalProfileData);

    } catch (error) {
        console.error("Error fetching global user profile:", error);
        res.status(500).json(formatErrorResponse(
            500,
            "Internal server error",
            process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
            req
        ));
    }
});

/**
 * GET /api/profile/:userId/ctf/:ctfId
 * 
 * Returns CTF-specific user profile
 */
router.get("/:userId/ctf/:ctfId", async (req, res) => {
    try {
        const { ctfId, userId } = req.params;
        
        if (!ctfId || !userId) {
            res.status(400).json(formatErrorResponse(400, "Both CTF ID and User ID are required", undefined, req));
            return;
        }

        // Get CTF-specific user scores (using cache) - always include extended metrics for profiles
        const ctfQuery = { ctf_id: buildCtfIdMatcher(ctfId) };
        const ctfUserScores = await getCachedUserScores(ctfQuery, undefined, true);
        const userProfile = ctfUserScores.get(userId);
        
        if (!userProfile) {
            res.status(404).json(formatErrorResponse(
                404, 
                "User not found in this CTF", 
                `No participation data found for user ${userId} in CTF ${ctfId}`,
                req
            ));
            return;
        }

        // Get CTF information from the user's breakdown
        const ctfInfo = userProfile.ctfBreakdown.get(ctfId);
        if (!ctfInfo) {
            res.status(404).json(formatErrorResponse(
                404, 
                "CTF data not found", 
                `No CTF data found for ${ctfId}`,
                req
            ));
            return;
        }

        // Calculate user's rank within this CTF using utility function
        const { rank: userRank, totalUsers: totalParticipants, percentile } = calculateUserRank(userId, ctfUserScores);

        // Calculate CTF statistics using utility function
        const ctfStats = calculateGlobalStats(ctfUserScores);

        // Get all participants and categories in this CTF
        const ctfParticipants = Array.from(ctfUserScores.values());
        const allCategories = new Set<string>();
        ctfParticipants.forEach(participant => {
            participant.categories.forEach(cat => allCategories.add(cat));
        });

        // User's category performance within this CTF using utility function with filter
        const categoryStats = await calculateCategoryStats(
            userProfile, 
            ctfParticipants,
            (solve) => solve.ctf_id === ctfId
        );

        // Fetch accurate solves for this user in this CTF from the database.
        // (The cached scoring data keeps only a small "recentSolves" window for UI previews.)
        const allCtfSolves = await getUserCtfSolves(userId, ctfId);

        // CTF-specific achievements using utility function
        const achievementIds = generateAchievementIds(
            userProfile,
            userRank,
            totalParticipants,
            ctfStats,
            allCategories,
            'ctf',
            ctfInfo.ctfTitle
        );

        // Performance comparison using utility function
        const performanceComparison = calculatePerformanceComparison(userProfile, ctfStats, totalParticipants);

        // Response data
        const ctfProfileData = {
            user: {
                userId,
                username: userProfile.username,
                displayName: userProfile.displayName,
                avatar: userProfile.avatar
            },
            ctfId,
            ctfInfo: {
                title: ctfInfo.ctfTitle,
                weight: ctfInfo.weight
            },
            ctfRank: userRank,
            totalParticipants,
            percentile: percentile,
            stats: {
                score: Math.round(userProfile.totalScore * 100) / 100,
                solveCount: userProfile.solveCount,
                categoriesCount: userProfile.categories.size,
                averagePointsPerSolve: allCtfSolves.length > 0
                    ? Math.round((allCtfSolves.reduce((sum, solve) => sum + (solve.points || 0), 0) / allCtfSolves.length) * 100) / 100
                    : 0,
                contributionToTotal: Math.round((userProfile.solveCount / ctfStats.totalSolves) * 100 * 100) / 100
            },
            categoryBreakdown: categoryStats,
            allSolves: allCtfSolves,
            achievementIds,
            performanceComparison,
            ctfOverview: {
                totalParticipants,
                totalSolves: ctfStats.totalSolves,
                averageScore: Math.round(ctfStats.avgScore * 100) / 100,
                medianScore: Math.round(ctfStats.medianScore * 100) / 100,
                totalCategories: allCategories.size,
                categories: Array.from(allCategories)
            },
            metadata: {
                profileGenerated: new Date().toISOString(),
                dataSource: "Fair Scoring System",
                scope: "CTF-specific"
            }
        };

        res.json(ctfProfileData);

    } catch (error) {
        console.error("Error fetching CTF user profile:", error);
        res.status(500).json(formatErrorResponse(
            500,
            "Internal server error",
            process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
            req
        ));
    }
});

export default router;
