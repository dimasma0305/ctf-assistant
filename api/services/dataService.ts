import { UserModel, solveModel } from "../../src/Database/connect";
import FairScoringSystem from "../../src/Functions/scoringSystem";
import { cache } from '../utils/cache';
import { generateCacheKey } from '../utils/common';
import { UserProfile, AvailableTimeRanges } from '../types';

/**
 * Data Service Functions
 * 
 * Handles data fetching, caching, and processing
 */

/**
 * Cached version of FairScoringSystem.calculateUserScores with user profile enrichment
 */
export async function getCachedUserScores(query: any = {}, ttl?: number): Promise<Map<string, UserProfile>> {
    const cacheKey = generateCacheKey('userScores', query);
    
    // Try to get from cache first
    let userScores = cache.getCached<Map<string, UserProfile>>(cacheKey);
    
    if (!userScores) {
        // Calculate fresh scoring data
        const scoringData = await FairScoringSystem.calculateUserScores(query);
        
        // Get all unique Discord IDs from the scoring data
        const discordIds = Array.from(scoringData.keys());
        
        // Fetch user profile data for all users in bulk
        const userProfiles = await UserModel.find({ 
            discord_id: { $in: discordIds } 
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
        
        // Enrich scoring data with user profile information
        userScores = new Map<string, UserProfile>();
        
        for (const [discordId, scoreData] of scoringData) {
            const userInfo = userLookup.get(discordId);
            const enrichedProfile: UserProfile = {
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
            
            userScores.set(discordId, enrichedProfile);
        }
        
        // Cache the enriched result
        cache.set(cacheKey, userScores, ttl);
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

        // Cache for 1 hour (data doesn't change frequently)
        cache.set(cacheKey, result, 60 * 60 * 1000);
        
        return result;
        
    } catch (error) {
        console.error('Error getting available time ranges:', error);
        return { months: [], years: [] };
    }
}
