import express from "express";
import cors from "cors";
import client from "./client";
import { MyClient } from "./Model/client";
import bodyParser from 'body-parser';
import crypto from 'crypto';
import session from "express-session";
import flash from "connect-flash";
import FairScoringSystem from "./Functions/scoringSystem";
import { CTFCacheModel, solveModel, UserModel } from "./Database/connect";

// Type definitions for user profile data
interface UserSolve {
    ctf_id: string;
    challenge: string;
    category: string;
    points: number;
    solved_at: Date;
    users: string[]; // Discord IDs for consistency
}

interface UserProfile {
    userId: string; // Discord ID for Discord mentions and consistency
    username: string;
    displayName: string;
    avatar?: string;
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

// Cache system interface and implementation
interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number; // Time to live in milliseconds
}

class MemoryCache {
    private cache = new Map<string, CacheEntry<any>>();
    private defaultTTL = 10 * 60 * 1000; // 10 minutes default

    set<T>(key: string, data: T, ttl?: number): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: ttl || this.defaultTTL
        });
    }

    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        // Check if expired
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    has(key: string): boolean {
        return this.get(key) !== null;
    }

    delete(key: string): boolean {
        return this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }

    // Get cache statistics
    getStats() {
        const now = Date.now();
        let validEntries = 0;
        let expiredEntries = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                expiredEntries++;
            } else {
                validEntries++;
            }
        }

        return {
            totalEntries: this.cache.size,
            validEntries,
            expiredEntries,
            hitRate: this.hitCount / (this.hitCount + this.missCount) || 0
        };
    }

    // Performance tracking
    private hitCount = 0;
    private missCount = 0;

    private trackHit() { this.hitCount++; }
    private trackMiss() { this.missCount++; }

    getCached<T>(key: string): T | null {
        const result = this.get<T>(key);
        if (result !== null) {
            this.trackHit();
        } else {
            this.trackMiss();
        }
        return result;
    }

    // Cleanup expired entries periodically
    cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.cache.delete(key);
            }
        }
    }
}

// Create global cache instance
const cache = new MemoryCache();

// Cleanup expired entries every 5 minutes
setInterval(() => {
    cache.cleanup();
}, 5 * 60 * 1000);

// ===== UTILITY FUNCTIONS FOR COMMON OPERATIONS =====

interface UserRankingResult {
    rank: number;
    totalUsers: number;
    percentile: number;
}

interface GlobalStats {
    totalSolves: number;
    totalScore: number;
    avgScore: number;
    medianScore: number;
}

interface PerformanceComparison {
    scoreVsAverage: {
        user: number;
        average: number;
        percentageDiff: number;
    };
    scoreVsMedian: {
        user: number;
        median: number;
        percentageDiff: number;
    };
    solvesVsAverage: {
        user: number;
        average: number;
        percentageDiff: number;
    };
}

interface CategoryStat {
    name: string;
    solves: number;
    totalScore: number;
    avgPoints: number;
    rankInCategory: number;
    totalInCategory: number;
    percentile: number;
}

interface Achievement {
    name: string;
    description: string;
    icon: string;
}

/**
 * Calculate user's rank among a collection of users
 */
function calculateUserRank(userId: string, userScores: Map<string, UserProfile>): UserRankingResult {
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
function calculateGlobalStats(userScores: Map<string, UserProfile>): GlobalStats {
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
function calculatePerformanceComparison(
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
async function calculateCategoryStats(
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
function generateAchievements(
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

/**
 * Format error response consistently
 */
function formatErrorResponse(status: number, error: string, message?: string, req?: any): any {
    return {
        error,
        message,
        ...(process.env.NODE_ENV === 'development' && req ? { 
            endpoint: `${req.method} ${req.path}`,
            params: req.params,
            query: req.query 
        } : {})
    };
}

/**
 * Validate common parameters
 */
function validatePaginationParams(limit?: string, offset?: string): { isValid: boolean; error?: string; limit: number; offset: number } {
    const parsedLimit = parseInt(limit as string) || 10;
    const parsedOffset = parseInt(offset as string) || 0;
    
    if (parsedLimit < 1 || parsedLimit > 100) {
        return { isValid: false, error: "Limit must be between 1 and 100", limit: parsedLimit, offset: parsedOffset };
    }
    
    if (parsedOffset < 0) {
        return { isValid: false, error: "Offset must be non-negative", limit: parsedLimit, offset: parsedOffset };
    }
    
    return { isValid: true, limit: parsedLimit, offset: parsedOffset };
}

// Helper function to generate cache keys
function generateCacheKey(prefix: string, query: any = {}): string {
    const queryString = Object.keys(query).length > 0 ? JSON.stringify(query) : 'global';
    return `${prefix}:${crypto.createHash('md5').update(queryString).digest('hex')}`;
}

// Helper function to filter users by search term
function filterUsersBySearch(userScores: Map<string, UserProfile>, searchTerm: string): Map<string, UserProfile> {
    if (!searchTerm || searchTerm.trim() === '') {
        return userScores;
    }
    
    const searchLower = searchTerm.toLowerCase().trim();
    const filteredUsers = new Map<string, UserProfile>();
    
    for (const [discordId, profile] of userScores) {
        const username = profile.username.toLowerCase();
        const displayName = profile.displayName.toLowerCase();
        const userId = profile.userId.toLowerCase();
        
        // Check if search term matches user info or categories
        const matchesUser = username.includes(searchLower) || 
                           displayName.includes(searchLower) || 
                           userId.includes(searchLower);
        
        const matchesCategory = Array.from(profile.categories).some(category => 
            category.toLowerCase().includes(searchLower)
        );
        
        if (matchesUser || matchesCategory) {
            filteredUsers.set(discordId, profile);
        }
    }
    
    return filteredUsers;
}

// Cached version of FairScoringSystem.calculateUserScores with user profile enrichment
async function getCachedUserScores(query: any = {}, ttl?: number): Promise<Map<string, UserProfile>> {
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

// Function to get available months and years from solve data
async function getAvailableTimeRanges(): Promise<{
    months: string[]; // Array of YYYY-MM strings
    years: number[];  // Array of years
}> {
    try {
        // Use cache to avoid repeated expensive queries
        const cacheKey = 'available_time_ranges';
        let cached = cache.get<{ months: string[]; years: number[] }>(cacheKey);
        
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

client.guilds.fetch();

const app = express();

// Enable CORS for all domains
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public', { index: 'index.html' }));
app.use(session({
    secret: process.env.SECRET || crypto.randomUUID(),
    resave: false,
    saveUninitialized: true
}));
app.use(flash());

// Health check endpoint with session awareness
app.get("/health", (req, res) => {
    const myClient = client as MyClient;
    const isHealthy = client.isReady() || (myClient.sessionScheduler?.isWaitingForSessionReset() === true);
    
    res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        bot: {
            ready: client.isReady(),
            waitingForSessionReset: myClient.sessionScheduler?.isWaitingForSessionReset() || false
        },
        timestamp: new Date().toISOString()
    });
});

app.get("/api/scoreboard", async (req, res) => {
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

        // Get leaderboard data using cache
        let allUserScores = await getCachedUserScores(query);
        
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

        // Format data for JSON response (convert Sets and Maps to arrays/objects)
        const formattedLeaderboard = paginatedLeaderboard.map((entry, index) => ({
            rank: userRankMap.get(entry.userId) || 1, // Use rank from appropriate dataset (monthly/yearly separate rankings, global for overall)
            user: {
                userId: entry.userId,
                username: entry.username,
                displayName: entry.displayName,
                avatar: entry.avatar
            },
            totalScore: Math.round(entry.totalScore * 100) / 100, // round to 2 decimal places
            solveCount: entry.solveCount,
            ctfCount: entry.ctfCount,
            categories: Array.from(entry.categories),
            recentSolves: entry.recentSolves.map((solve: UserSolve) => ({
                ctf_id: solve.ctf_id,
                challenge: solve.challenge,
                category: solve.category,
                points: solve.points,
                solved_at: solve.solved_at
            })),
            ctfBreakdown: Object.fromEntries(
                Array.from(entry.ctfBreakdown.entries()).map(([ctfId, breakdown]: [string, any]) => [
                    ctfId,
                    {
                        ctfTitle: breakdown.ctfTitle,
                        weight: breakdown.weight,
                        solves: breakdown.solves,
                        points: breakdown.points,
                        score: Math.round(breakdown.score * 100) / 100
                    }
                ])
            )
        }));

        // Calculate global stats for metadata
        const globalStats = calculateGlobalStats(allUserScores);
        
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

// CTF-specific user profile API endpoint
app.get("/api/ctf/:ctfId/profile/:userId", async (req, res) => {
    try {
        const { ctfId, userId } = req.params;
        
        if (!ctfId || !userId) {
            res.status(400).json(formatErrorResponse(400, "Both CTF ID and User ID are required", undefined, req));
            return;
        }

        // Get CTF-specific user scores (using cache)
        const ctfQuery = { ctf_id: ctfId };
        const ctfUserScores = await getCachedUserScores(ctfQuery);
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

        // All solves in this CTF (not just recent ones)
        const ctfSolves = userProfile.recentSolves.filter(solve => solve.ctf_id === ctfId);
        const allCtfSolves = ctfSolves
            .sort((a, b) => new Date(b.solved_at).getTime() - new Date(a.solved_at).getTime())
            .map(solve => ({
                challenge: solve.challenge,
                category: solve.category,
                points: solve.points,
                solved_at: solve.solved_at,
                isTeamSolve: solve.users.length > 1,
                teammates: solve.users.filter(id => id !== userId)
            }));

        // CTF-specific achievements using utility function
        const ctfAchievements = generateAchievements(
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
                averagePointsPerSolve: ctfSolves.length > 0 ? Math.round((ctfSolves.reduce((sum, solve) => sum + solve.points, 0) / ctfSolves.length) * 100) / 100 : 0,
                contributionToTotal: Math.round((userProfile.solveCount / ctfStats.totalSolves) * 100 * 100) / 100
            },
            categoryBreakdown: categoryStats,
            allSolves: allCtfSolves,
            achievements: ctfAchievements,
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

// CTFs API endpoint - List CTFs the community participates in
app.get("/api/ctfs", async (req, res) => {
    try {
        // Parse query parameters
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = parseInt(req.query.offset as string) || 0;
        const status = req.query.status as string; // upcoming, active, completed
        const format = req.query.format as string; // jeopardy, attack-defense, etc.
        const organizer = req.query.organizer as string;
        const hasParticipation = req.query.hasParticipation === 'true'; // only CTFs with solves
        const sortBy = (req.query.sortBy as string) || 'start_desc'; // start_desc, start_asc, title, participants
        
        // Validate parameters
        if (limit < 1 || limit > 100) {
            res.status(400).json({
                error: "Limit must be between 1 and 100"
            });
            return;
        }
        
        if (offset < 0) {
            res.status(400).json({
                error: "Offset must be non-negative"
            });
            return;
        }

        // Get CTFs with participation data
        const participationData = await solveModel.aggregate([
            {
                $unwind: "$users"
            },
            {
                $group: {
                    _id: "$ctf_id",
                    totalSolves: { $sum: 1 },
                    uniqueParticipants: { $addToSet: "$users" },
                    firstSolve: { $min: "$solved_at" },
                    lastSolve: { $max: "$solved_at" }
                }
            },
            {
                $project: {
                    ctf_id: "$_id",
                    totalSolves: 1,
                    participantCount: { $size: "$uniqueParticipants" },
                    firstSolve: 1,
                    lastSolve: 1
                }
            }
        ]);

        const participationMap = new Map();
        participationData.forEach((data: any) => {
            if (data.ctf_id) {
                participationMap.set(data.ctf_id, {
                    totalSolves: data.totalSolves,
                    participantCount: data.participantCount,
                    firstSolve: data.firstSolve,
                    lastSolve: data.lastSolve
                });
            }
        });

        // Build query for CTFCache
        let ctfQuery: any = {};
        if (organizer) {
            ctfQuery['organizers.name'] = { $regex: organizer, $options: 'i' };
        }
        if (format) {
            ctfQuery.format = { $regex: format, $options: 'i' };
        }

        // Filter by status if specified
        const now = new Date();
        if (status === 'upcoming') {
            ctfQuery.start = { $gt: now };
        } else if (status === 'active') {
            ctfQuery.start = { $lte: now };
            ctfQuery.finish = { $gte: now };
        } else if (status === 'completed') {
            ctfQuery.finish = { $lt: now };
        }

        // Get CTFs from cache
        let ctfs = await CTFCacheModel.find(ctfQuery).lean();

        // If hasParticipation filter is enabled, only include CTFs with solves
        if (hasParticipation) {
            ctfs = ctfs.filter(ctf => participationMap.has(ctf.ctf_id));
        }

        // Sort CTFs
        ctfs.sort((a: any, b: any) => {
            switch (sortBy) {
                case 'start_asc':
                    return new Date(a.start).getTime() - new Date(b.start).getTime();
                case 'start_desc':
                default:
                    return new Date(b.start).getTime() - new Date(a.start).getTime();
                case 'title':
                    return a.title.localeCompare(b.title);
                case 'participants':
                    const aParticipation = participationMap.get(a.ctf_id);
                    const bParticipation = participationMap.get(b.ctf_id);
                    return (bParticipation?.participantCount || 0) - (aParticipation?.participantCount || 0);
            }
        });

        // Apply pagination
        const totalCTFs = ctfs.length;
        const paginatedCTFs = ctfs.slice(offset, offset + limit);

        // Format response data
        const formattedCTFs = paginatedCTFs.map((ctf: any) => {
            const participation = participationMap.get(ctf.ctf_id);
            const now = new Date();
            const start = new Date(ctf.start);
            const finish = new Date(ctf.finish);
            
            let ctfStatus = 'completed';
            if (start > now) ctfStatus = 'upcoming';
            else if (finish >= now) ctfStatus = 'active';

            return {
                ctf_id: ctf.ctf_id,
                title: ctf.title,
                organizer: ctf.organizers?.[0]?.name || 'Unknown',
                organizers: ctf.organizers || [],
                description: ctf.description || '',
                url: ctf.url,
                logo: ctf.logo,
                format: ctf.format || 'jeopardy',
                location: ctf.location,
                onsite: ctf.onsite || false,
                restrictions: ctf.restrictions || '',
                weight: ctf.weight || 0,
                participants: ctf.participants || 0,
                duration: ctf.duration || { hours: 0, days: 0 },
                schedule: {
                    start: ctf.start,
                    finish: ctf.finish,
                    status: ctfStatus,
                    durationHours: Math.round((finish.getTime() - start.getTime()) / (1000 * 60 * 60))
                },
                communityParticipation: participation ? {
                    totalSolves: participation.totalSolves,
                    uniqueParticipants: participation.participantCount,
                    firstSolve: participation.firstSolve,
                    lastSolve: participation.lastSolve,
                    participated: true
                } : {
                    totalSolves: 0,
                    uniqueParticipants: 0,
                    firstSolve: null,
                    lastSolve: null,
                    participated: false
                },
                cached_at: ctf.cached_at,
                last_updated: ctf.last_updated
            };
        });

        // Response metadata
        const metadata = {
            total: totalCTFs,
            limit,
            offset,
            returned: formattedCTFs.length,
            filters: {
                status: status || null,
                format: format || null,
                organizer: organizer || null,
                hasParticipation: hasParticipation || false,
                sortBy
            },
            stats: {
                totalCTFsInDatabase: totalCTFs,
                ctfsWithParticipation: participationData.length,
                upcoming: ctfs.filter((ctf: any) => new Date(ctf.start) > now).length,
                active: ctfs.filter((ctf: any) => new Date(ctf.start) <= now && new Date(ctf.finish) >= now).length,
                completed: ctfs.filter((ctf: any) => new Date(ctf.finish) < now).length
            },
            timestamp: new Date().toISOString()
        };

        res.json({
            metadata,
            data: formattedCTFs
        });

    } catch (error) {
        console.error("Error fetching CTFs:", error);
        res.status(500).json({
            error: "Internal server error",
            message: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
    }
});

// CTF Rankings API endpoint - returns CTFs with leaderboard data for the rankings component
app.get("/api/ctfs/rankings", async (req, res) => {
    try {
        // Parse query parameters
        const limit = parseInt(req.query.limit as string) || 10;
        const status = req.query.status as string; // upcoming, active, completed
        const hasParticipation = req.query.hasParticipation !== 'false'; // default to true
        
        // Validate parameters
        if (limit < 1 || limit > 50) {
            res.status(400).json({
                error: "Limit must be between 1 and 50"
            });
            return;
        }

        // Get participation data for CTFs
        const participationData = await solveModel.aggregate([
            {
                $unwind: "$users"
            },
            {
                $group: {
                    _id: "$ctf_id",
                    totalSolves: { $sum: 1 },
                    uniqueParticipants: { $addToSet: "$users" },
                    firstSolve: { $min: "$solved_at" },
                    lastSolve: { $max: "$solved_at" }
                }
            },
            {
                $project: {
                    ctf_id: "$_id",
                    totalSolves: 1,
                    participantCount: { $size: "$uniqueParticipants" },
                    firstSolve: 1,
                    lastSolve: 1
                }
            }
        ]);

        const participationMap = new Map();
        participationData.forEach((data: any) => {
            if (data.ctf_id) {
                participationMap.set(data.ctf_id, {
                    totalSolves: data.totalSolves,
                    uniqueParticipants: data.participantCount,
                    firstSolve: data.firstSolve,
                    lastSolve: data.lastSolve
                });
            }
        });

        // Build query for CTFs
        let ctfQuery: any = {};
        const now = new Date();
        
        if (status === 'upcoming') {
            ctfQuery.start = { $gt: now };
        } else if (status === 'active') {
            ctfQuery.start = { $lte: now };
            ctfQuery.finish = { $gte: now };
        } else if (status === 'completed') {
            ctfQuery.finish = { $lt: now };
        }

        // Get CTFs from cache
        let ctfs = await CTFCacheModel.find(ctfQuery).lean();

        // Filter to only CTFs with participation if requested
        if (hasParticipation) {
            ctfs = ctfs.filter(ctf => participationMap.has(ctf.ctf_id));
        }

        // Sort by start date (most recent first)
        ctfs.sort((a: any, b: any) => new Date(b.start).getTime() - new Date(a.start).getTime());
        
        // Limit results
        ctfs = ctfs.slice(0, limit);

        // Get leaderboard data for each CTF
        const ctfRankings = await Promise.all(ctfs.map(async (ctf: any) => {
            const participation = participationMap.get(ctf.ctf_id);
            if (!participation) {
                return null; // Skip CTFs without participation
            }

            // Get top performers for this CTF (cached)
            const topPerformers = await getCachedUserScores({ ctf_id: ctf.ctf_id }, 5 * 60 * 1000); // 5 minute cache
            const leaderboard = Array.from(topPerformers.values())
                .sort((a, b) => b.totalScore - a.totalScore)
                .slice(0, 5) // Top 5 for rankings view
                .map((user, index) => ({
                    rank: index + 1,
                    user: {
                        userId: user.userId,
                        username: user.username,
                        displayName: user.displayName,
                        avatar: user.avatar
                    },
                    score: Math.round(user.totalScore * 100) / 100,
                    solves: user.solveCount
                }));

            // Calculate CTF status
            const start = new Date(ctf.start);
            const finish = new Date(ctf.finish);
            let ctfStatus = 'completed';
            if (start > now) ctfStatus = 'upcoming';
            else if (finish >= now) ctfStatus = 'active';

            return {
                ctf_id: ctf.ctf_id,
                title: ctf.title,
                organizer: ctf.organizers?.[0]?.name || 'Unknown',
                logo: ctf.logo || null,
                schedule: {
                    start: ctf.start,
                    finish: ctf.finish,
                    status: ctfStatus
                },
                communityStats: {
                    uniqueParticipants: participation.uniqueParticipants,
                    totalSolves: participation.totalSolves
                },
                leaderboard
            };
        }));

        // Filter out null results
        const validRankings = ctfRankings.filter(ranking => ranking !== null);

        res.json({
            data: validRankings,
            metadata: {
                total: validRankings.length,
                limit,
                filters: {
                    status: status || null,
                    hasParticipation
                },
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error("Error fetching CTF rankings:", error);
        res.status(500).json({
            error: "Internal server error",
            message: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
    }
});

// Individual CTF details API endpoint
app.get("/api/ctfs/:ctfId", async (req, res) => {
    try {
        const { ctfId } = req.params;
        
        if (!ctfId) {
            res.status(400).json({
                error: "CTF ID is required"
            });
            return;
        }

        // Get CTF from cache
        const ctf = await CTFCacheModel.findOne({ ctf_id: ctfId }).lean();
        
        if (!ctf) {
            res.status(404).json({
                error: "CTF not found",
                message: `No CTF found with ID: ${ctfId}`
            });
            return;
        }

        // Get detailed participation data for this CTF
        const participationData = await solveModel.aggregate([
            { $match: { ctf_id: ctfId } },
            {
                $unwind: "$users"
            },
            {
                $group: {
                    _id: "$ctf_id",
                    totalSolves: { $sum: 1 },
                    uniqueUsers: { $addToSet: "$users" },
                    categories: { $addToSet: "$category" },
                    challenges: { $addToSet: "$challenge" },
                    firstSolve: { $min: "$solved_at" },
                    lastSolve: { $max: "$solved_at" },
                    solves: { $push: "$$ROOT" }
                }
            },
            {
                $project: {
                    totalSolves: 1,
                    participantCount: { $size: "$uniqueUsers" },
                    categoryCount: { $size: "$categories" },
                    challengeCount: { $size: "$challenges" },
                    categories: 1,
                    challenges: 1,
                    firstSolve: 1,
                    lastSolve: 1,
                    solves: 1
                }
            }
        ]);

        const participation = participationData[0] || {
            totalSolves: 0,
            participantCount: 0,
            categoryCount: 0,
            challengeCount: 0,
            categories: [],
            challenges: [],
            firstSolve: null,
            lastSolve: null,
            solves: []
        };

        // Calculate CTF status
        const now = new Date();
        const start = new Date(ctf.start);
        const finish = new Date(ctf.finish);
        
        let ctfStatus = 'completed';
        if (start > now) ctfStatus = 'upcoming';
        else if (finish >= now) ctfStatus = 'active';

        // Get top performers for this CTF
        const topPerformers = await getCachedUserScores({ ctf_id: ctfId });
        const leaderboard = Array.from(topPerformers.values())
            .sort((a, b) => b.totalScore - a.totalScore)
            .slice(0, 10)
            .map((user, index) => ({
                rank: index + 1,
                user: {
                    userId: user.userId,
                    username: user.username,
                    displayName: user.displayName,
                    avatar: user.avatar
                },
                score: Math.round(user.totalScore * 100) / 100,
                solves: user.solveCount
            }));

        // Format detailed CTF information
        const detailedCTF = {
            ctf_id: ctf.ctf_id,
            title: ctf.title,
            organizer: ctf.organizers?.[0]?.name || 'Unknown',
            organizers: ctf.organizers || [],
            description: ctf.description || '',
            url: ctf.url,
            logo: ctf.logo,
            format: ctf.format || 'jeopardy',
            location: ctf.location,
            onsite: ctf.onsite || false,
            restrictions: ctf.restrictions || '',
            weight: ctf.weight || 0,
            participants: ctf.participants || 0,
            duration: ctf.duration || { hours: 0, days: 0 },
            schedule: {
                start: ctf.start,
                finish: ctf.finish,
                status: ctfStatus,
                durationHours: Math.round((finish.getTime() - start.getTime()) / (1000 * 60 * 60)),
                timeUntilStart: start > now ? Math.round((start.getTime() - now.getTime()) / (1000 * 60 * 60)) : 0,
                timeUntilEnd: finish > now ? Math.round((finish.getTime() - now.getTime()) / (1000 * 60 * 60)) : 0
            },
            communityStats: {
                participated: participation.totalSolves > 0,
                totalSolves: participation.totalSolves,
                uniqueParticipants: participation.participantCount,
                challengesSolved: participation.challengeCount,
                categoriesCovered: participation.categoryCount,
                categories: participation.categories,
                firstSolve: participation.firstSolve,
                lastSolve: participation.lastSolve,
                participationRate: ctf.participants > 0 ? Math.round((participation.participantCount / ctf.participants) * 100) : 0
            },
            leaderboard,
            metadata: {
                cached_at: ctf.cached_at,
                last_updated: ctf.last_updated,
                dataFreshness: Math.round((Date.now() - new Date(ctf.last_updated).getTime()) / (1000 * 60 * 60)) // hours ago
            }
        };

        res.json(detailedCTF);

    } catch (error) {
        console.error("Error fetching CTF details:", error);
        res.status(500).json({
            error: "Internal server error",
            message: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
    }
});

// Global user profile API endpoint
app.get("/api/profile/:id", async (req, res) => {
    try {
        const { id: userId } = req.params;
        
        if (!userId) {
            res.status(400).json(formatErrorResponse(400, "User ID is required", undefined, req));
            return;
        }

        // Get global user scores (using cache)
        const globalUserScores = await getCachedUserScores({});
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
                category: solve.category,
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
        const achievements = generateAchievements(
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
            achievements: achievements,
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

app.listen(3000, "0.0.0.0", async () => {
    console.log("🌐 Web server running @ http://localhost:3000");
    
    // Optional: Warm up cache on startup for better initial response times
    if (process.env.WARM_CACHE_ON_STARTUP === 'true') {
        console.log("🔥 Starting cache warm-up...");
        try {
            await getCachedUserScores(); // Warm up global scores
            console.log("🔥 Cache warm-up completed successfully");
        } catch (error: any) {
            console.log("⚠️  Cache warm-up failed:", error.message);
        }
    }
});
