import { UserModel, solveModel } from "../../src/Database/connect";
import FairScoringSystem from "../../src/Functions/scoringSystem";
import { cache } from '../utils/cache';
import { generateCacheKey } from '../utils/common';
import { UserProfile, AvailableTimeRanges, MonthlyRank } from '../types';
import { calculateExtendedMetricsForUsers, calculateRankImprovement } from '../utils/statistics';

/**
 * Data Service Functions
 * 
 * Handles data fetching, caching, and processing
 */

/**
 * Cached version of FairScoringSystem.calculateUserScores with user profile enrichment
 */
export async function getCachedUserScores(
    query: any = {}, 
    ttl?: number, 
    includeExtendedMetrics: boolean = true
): Promise<Map<string, UserProfile>> {
    const cacheKey = generateCacheKey('userScores', { ...query, extended: includeExtendedMetrics });
    
    // Try to get from cache first
    let userScores = cache.getCached<Map<string, UserProfile>>(cacheKey);
    
    if (!userScores) {
        try {
            // Calculate fresh scoring data
            const scoringData = await FairScoringSystem.calculateUserScores(query);
            
            // Early return for empty results
            if (scoringData.size === 0) {
                userScores = new Map<string, UserProfile>();
                cache.set(cacheKey, userScores, ttl);
                return userScores;
            }
            
            // Get all unique Discord IDs from the scoring data
            const discordIds = Array.from(scoringData.keys());
            
            // Fetch user profile data for all users in bulk - only essential fields
            const userProfiles = await UserModel.find({ 
                discord_id: { $in: discordIds } 
            }, {
                discord_id: 1,
                username: 1,
                display_name: 1,
                avatar: 1
            }).lean();
            
            // Create a lookup map for user profile data
            const userLookup = new Map<string, any>();
            userProfiles.forEach(user => {
                userLookup.set(user.discord_id, {
                    username: user.username,
                    displayName: user.display_name,
                    avatar: user.avatar
                });
            });
            
            // Create base user profiles efficiently
            const baseProfiles = new Map<string, UserProfile>();
            
            for (const [discordId, scoreData] of scoringData) {
                const userInfo = userLookup.get(discordId);
                const baseProfile: UserProfile = {
                    userId: discordId,
                    username: userInfo?.username || `User_${discordId}`,
                    displayName: userInfo?.displayName || userInfo?.username || `User_${discordId}`,
                    avatar: userInfo?.avatar,
                    totalScore: scoreData.totalScore,
                    solveCount: scoreData.solveCount,
                    ctfCount: scoreData.ctfCount,
                    categories: scoreData.categories,
                    recentSolves: scoreData.recentSolves,
                    ctfBreakdown: scoreData.ctfBreakdown
                };
                
                baseProfiles.set(discordId, baseProfile);
            }
            
            // Conditionally calculate extended metrics
            const extendedMetricsMap = await calculateExtendedMetricsForUsers(baseProfiles, includeExtendedMetrics);
            
            // Calculate rank improvement for users if extended metrics are enabled
            const rankImprovementMap = new Map<string, number>();
            if (includeExtendedMetrics) {
                // Process rank improvement in batches to avoid performance issues
                const userIds = Array.from(baseProfiles.keys());
                const batchSize = 10; // Process 10 users at a time
                
                for (let i = 0; i < userIds.length; i += batchSize) {
                    const batch = userIds.slice(i, i + batchSize);
                    const batchPromises = batch.map(async (userId) => {
                        const monthlyRanks = await getMonthlyRankHistory(userId);
                        const improvement = calculateRankImprovement(monthlyRanks);
                        return { userId, improvement };
                    });
                    
                    const batchResults = await Promise.all(batchPromises);
                    batchResults.forEach(({ userId, improvement }) => {
                        rankImprovementMap.set(userId, improvement);
                    });
                }
            }
            
            // Enrich profiles with extended metrics and rank improvement
            userScores = new Map<string, UserProfile>();
            for (const [discordId, baseProfile] of baseProfiles) {
                const extendedMetrics = extendedMetricsMap.get(discordId) || {};
                const rankImprovement = rankImprovementMap.get(discordId) || extendedMetrics.rankImprovement || 0;
                
                const enrichedProfile: UserProfile = {
                    ...baseProfile,
                    ...extendedMetrics,
                    rankImprovement // Override with real data when available
                };
                
                userScores.set(discordId, enrichedProfile);
            }
            
            // Cache the enriched result with appropriate TTL
            const cacheTTL = ttl || (includeExtendedMetrics ? 30 * 60 * 1000 : 10 * 60 * 1000); // 30min for extended, 10min for basic
            cache.set(cacheKey, userScores, cacheTTL);
            
        } catch (error) {
            console.error('Error in getCachedUserScores:', error);
            // Return empty map on error to prevent cascading failures
            return new Map<string, UserProfile>();
        }
    }
    
    return userScores;
}

/**
 * Get available months and years from solve data
 */
export async function getAvailableTimeRanges(): Promise<AvailableTimeRanges> {
    try {
        // Use cache to avoid repeated expensive queries
        const cacheKey = 'available_time_ranges';
        let cached = cache.get<AvailableTimeRanges>(cacheKey);
        
        if (cached) {
            return cached;
        }

        // Query for min and max solve dates
        const dateRange = await solveModel.aggregate([
            {
                $group: {
                    _id: null,
                    minDate: { $min: "$solved_at" },
                    maxDate: { $max: "$solved_at" }
                }
            }
        ]);

        if (!dateRange || dateRange.length === 0) {
            // No solves in database
            return { months: [], years: [] };
        }

        const minDate = new Date(dateRange[0].minDate);
        const maxDate = new Date(dateRange[0].maxDate);
        
        // Generate available months and years
        const availableMonths: string[] = [];
        const availableYears: Set<number> = new Set();
        
        // Start from the first month with data
        const currentDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        const endDate = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
        
        while (currentDate <= endDate) {
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const monthString = `${year}-${month}`;
            
            availableMonths.push(monthString);
            availableYears.add(year);
            
            // Move to next month
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
        
        const result = {
            months: availableMonths.reverse(), // Most recent first
            years: Array.from(availableYears).sort((a, b) => b - a) // Most recent first
        };

        // Keep frontend and backend in sync by including the current month/year even
        // if there are no solves yet for that period (avoid filling large gaps).
        const now = new Date();
        const nowMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        if (!result.months.includes(nowMonth)) {
            result.months.unshift(nowMonth);
        }
        if (!result.years.includes(now.getFullYear())) {
            result.years.unshift(now.getFullYear());
        }

        // Cache for 1 hour (data doesn't change frequently)
        cache.set(cacheKey, result, 60 * 60 * 1000);
        
        return result;
        
    } catch (error) {
        console.error('Error getting available time ranges:', error);
        return { months: [], years: [] };
    }
}

/**
 * Calculate monthly ranks for all users for a specific month
 */
export async function calculateMonthlyRanks(month: string): Promise<Map<string, number>> {
    const cacheKey = `monthly_ranks_${month}`;
    
    // Try to get from cache first
    let monthlyRanks = cache.getCached<Map<string, number>>(cacheKey);
    
    if (!monthlyRanks) {
        try {
            // Parse month string (YYYY-MM)
            const [yearStr, monthStr] = month.split('-');
            const targetYear = parseInt(yearStr);
            const targetMonth = parseInt(monthStr) - 1; // JavaScript months are 0-indexed
            
            // Create start and end dates for the month
            const startDate = new Date(targetYear, targetMonth, 1);
            const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
            
            const monthQuery = {
                solved_at: {
                    $gte: startDate,
                    $lte: endDate
                }
            };

            // Calculate user scores for this specific month
            const monthlyUserScores = await FairScoringSystem.calculateUserScores(monthQuery);
            
            // Convert to ranked list
            const sortedUsers = Array.from(monthlyUserScores.values())
                .sort((a, b) => b.totalScore - a.totalScore);
            
            // Create rank map
            monthlyRanks = new Map<string, number>();
            sortedUsers.forEach((user, index) => {
                monthlyRanks!.set(user.userId, index + 1);
            });
            
            // Cache for 24 hours (monthly data doesn't change often)
            cache.set(cacheKey, monthlyRanks, 24 * 60 * 60 * 1000);
            
        } catch (error) {
            console.error(`Error calculating monthly ranks for ${month}:`, error);
            return new Map();
        }
    }
    
    return monthlyRanks;
}

/**
 * Get monthly rank history for a user using scoring system calculations
 */
export async function getMonthlyRankHistory(userId: string): Promise<MonthlyRank[]> {
    try {
        // Get available months from solve data
        const availableTimeRanges = await getAvailableTimeRanges();
        
        // Only process last 12 months for performance (can be adjusted)
        const recentMonths = availableTimeRanges.months.slice(0, 12);
        
        if (recentMonths.length === 0) {
            return [];
        }
        
        const rankHistory: MonthlyRank[] = [];
        
        // Calculate ranks for each month (in parallel for better performance)
        const monthlyRankPromises = recentMonths.map(async (month) => {
            const monthlyRanks = await calculateMonthlyRanks(month);
            const userRank = monthlyRanks.get(userId);
            
            if (userRank) {
                return { month, rank: userRank };
            }
            return null;
        });
        
        const results = await Promise.all(monthlyRankPromises);
        
        // Filter out null results and sort by month
        for (const result of results) {
            if (result) {
                rankHistory.push(result);
            }
        }
        
        return rankHistory.sort((a, b) => a.month.localeCompare(b.month));
        
    } catch (error) {
        console.error('Error getting monthly rank history:', error);
        return [];
    }
}
