import { Router } from 'express';
import { getCachedUserScores, getAvailableTimeRanges } from '../services/dataService';
import { calculateGlobalStats, generateAchievementIds } from '../utils/statistics';
import { formatErrorResponse, validatePaginationParams, filterUsersBySearch, categoryNormalize } from '../utils/common';
import { UserSolve } from '../types';

const router = Router();

/**
 * GET /api/scoreboard
 * 
 * Returns paginated leaderboard data with optional filtering and time-based scoping
 */
router.get("/", async (req, res) => {
    try {
        // Parse query parameters
        const ctfId = req.query.ctf_id as string;
        const isGlobal = req.query.global !== 'false'; // default to true unless explicitly set to false
        const searchTerm = req.query.search as string; // new search parameter
        const month = req.query.month as string; // YYYY-MM format
        const year = req.query.year ? parseInt(req.query.year as string) : undefined;
        
        // Validate parameters using utility function
        const validation = validatePaginationParams(req.query.limit as string, req.query.offset as string);
        if (!validation.isValid) {
            res.status(400).json(formatErrorResponse(400, validation.error!, undefined, req));
            return;
        }
        const { limit, offset } = validation;

        // Validate monthly parameters
        if (month && !/^\d{4}-\d{2}$/.test(month)) {
            res.status(400).json(formatErrorResponse(400, "Month must be in YYYY-MM format", undefined, req));
            return;
        }

        if (year && (year < 2020 || year > 2100)) {
            res.status(400).json(formatErrorResponse(400, "Year must be between 2020 and 2030", undefined, req));
            return;
        }

        // Build query for leaderboard data
        let query: any = {};
        if (!isGlobal && ctfId) {
            query.ctf_id = ctfId;
        }

        // Add date filtering to query
        if (month) {
            // Parse month string (YYYY-MM)
            const [yearStr, monthStr] = month.split('-');
            const targetYear = parseInt(yearStr);
            const targetMonth = parseInt(monthStr) - 1; // JavaScript months are 0-indexed
            
            // Create start and end dates for the month
            const startDate = new Date(targetYear, targetMonth, 1);
            const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
            
            query.solved_at = {
                $gte: startDate,
                $lte: endDate
            };
        } else if (year) {
            // Filter by year
            const startDate = new Date(year, 0, 1);
            const endDate = new Date(year, 11, 31, 23, 59, 59, 999);
            
            query.solved_at = {
                $gte: startDate,
                $lte: endDate
            };
        }

        // Get leaderboard data using cache - extended metrics only needed for achievements
        const includeExtendedMetrics = !searchTerm && (!limit || limit >= 50); // Only for larger result sets
        let allUserScores = await getCachedUserScores(query, undefined, includeExtendedMetrics);
        
        // For monthly/yearly filtering, use separate rankings based on filtered data
        // For global leaderboard, use true rankings from complete dataset
        let userRankMap = new Map<string, number>();
        
        if (month || year) {
            // Monthly/yearly leaderboard: calculate rankings from filtered data only
            const filteredSortedUsers = Array.from(allUserScores.values())
                .sort((a, b) => b.totalScore - a.totalScore);
            
            filteredSortedUsers.forEach((user, index) => {
                userRankMap.set(user.userId, index + 1);
            });
        } else {
            // Global leaderboard: get rankings from complete unfiltered dataset
            const globalUserScores = await getCachedUserScores({}); // No query filters for true global rankings
            const allSortedUsers = Array.from(globalUserScores.values())
                .sort((a, b) => b.totalScore - a.totalScore);
            
            allSortedUsers.forEach((user, index) => {
                userRankMap.set(user.userId, index + 1);
            });
        }
        
        // Apply search filtering if search term is provided
        let filteredUserScores = allUserScores;
        if (searchTerm) {
            filteredUserScores = filterUsersBySearch(allUserScores, searchTerm);
        }
        
        // Sort filtered users (this is for pagination, not ranking)
        const sortedLeaderboard = Array.from(filteredUserScores.values())
            .sort((a, b) => b.totalScore - a.totalScore);
        
        const totalFilteredUsers = sortedLeaderboard.length;
        
        // For monthly/yearly leaderboards, total users should be from filtered dataset
        // For global leaderboard, use complete dataset count
        let totalUsers: number;
        if (month || year) {
            totalUsers = allUserScores.size; // Users with activity in the specified time period
        } else {
            // Get total from global dataset
            const globalUserScores = await getCachedUserScores({});
            totalUsers = globalUserScores.size;
        }
        
        // Apply pagination after filtering
        const paginatedLeaderboard = sortedLeaderboard.slice(offset, offset + limit);
        
        // Get available months and years for metadata
        const availableTimeRanges = await getAvailableTimeRanges();

        // Calculate global stats for metadata and achievement generation
        const globalStats = calculateGlobalStats(allUserScores);
        
        // Get all categories for achievement calculations
        const allCategories = new Set<string>();
        Array.from(allUserScores.values()).forEach(user => {
            user.categories.forEach(cat => allCategories.add(cat));
        });

        // Format data for JSON response (convert Sets and Maps to arrays/objects)
        const formattedLeaderboard = paginatedLeaderboard.map((entry) => {
            const userRank = userRankMap.get(entry.userId) || 1;
            const scope = isGlobal ? 'global' : 'ctf';
            
            // Generate achievements for this user
            const achievementIds = generateAchievementIds(
                entry,
                userRank,
                totalUsers,
                globalStats,
                allCategories,
                scope as 'global' | 'ctf',
                ctfId ? 'CTF' : undefined // CTF title fallback
            );

            const categories = new Set(Array.from(entry.categories).map(category => categoryNormalize(category)));

            return {
                rank: userRank, // Use rank from appropriate dataset (monthly/yearly separate rankings, global for overall)
                user: {
                    userId: entry.userId,
                    username: entry.username,
                    displayName: entry.displayName,
                    avatar: entry.avatar
                },
                totalScore: Math.round(entry.totalScore * 100) / 100, // round to 2 decimal places
                solveCount: entry.solveCount,
                ctfCount: entry.ctfCount,
                categories: categories,
                achievementIds: achievementIds,
                recentSolves: entry.recentSolves.map((solve: UserSolve) => ({
                    ctf_id: solve.ctf_id,
                    challenge: solve.challenge,
                    category: categoryNormalize(solve.category),
                    points: solve.points,
                    solved_at: solve.solved_at
                }))
            };
        });
        
        // Response metadata
        const metadata = {
            total: totalFilteredUsers,
            totalUsers: totalUsers, // Use the actual total count of all users
            totalSolves: globalStats.totalSolves, // Add total solves for contribution calculations
            limit,
            offset,
            returned: formattedLeaderboard.length,
            isGlobal,
            ctfId: ctfId || null,
            searchTerm: searchTerm || null,
            isFiltered: !!(searchTerm || month || year),
            month: month || null,
            year: year || null,
            availableMonths: availableTimeRanges.months,
            availableYears: availableTimeRanges.years,
            timestamp: new Date().toISOString()
        };

        res.json({
            metadata,
            data: formattedLeaderboard
        });

    } catch (error) {
        console.error("Error fetching scoreboard:", error);
        res.status(500).json(formatErrorResponse(
            500,
            "Internal server error",
            process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
            req
        ));
    }
});

export default router;
