import express from "express";
import cors from "cors";
import client from "./client";
import { MyClient } from "./Model/client";
import bodyParser from 'body-parser';
import crypto from 'crypto';
import session from "express-session";
import flash from "connect-flash";
import FairScoringSystem from "./Functions/scoringSystem";
import { CTFCacheModel, solveModel } from "./Database/connect";

// Type definitions for user profile data
interface UserSolve {
    ctf_id: string;
    challenge: string;
    category: string;
    points: number;
    solved_at: Date;
    users: string[];
}

interface UserProfile {
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

// Helper function to generate cache keys
function generateCacheKey(prefix: string, query: any = {}): string {
    const queryString = Object.keys(query).length > 0 ? JSON.stringify(query) : 'global';
    return `${prefix}:${crypto.createHash('md5').update(queryString).digest('hex')}`;
}

// Cached version of FairScoringSystem.calculateUserScores
async function getCachedUserScores(query: any = {}, ttl?: number): Promise<Map<string, UserProfile>> {
    const cacheKey = generateCacheKey('userScores', query);
    
    // Try to get from cache first
    let userScores = cache.getCached<Map<string, UserProfile>>(cacheKey);
    
    if (!userScores) {
        // Calculate fresh data
        userScores = await FairScoringSystem.calculateUserScores(query) as Map<string, UserProfile>;
        // Cache the result
        cache.set(cacheKey, userScores, ttl);
    }
    
    return userScores;
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

// Scoreboard API endpoint with range filtering
app.get("/api/scoreboard", async (req, res) => {
    try {
        // Parse query parameters
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = parseInt(req.query.offset as string) || 0;
        const ctfId = req.query.ctf_id as string;
        const isGlobal = req.query.global !== 'false'; // default to true unless explicitly set to false
        
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

        // Build query for leaderboard data
        let query: any = {};
        if (!isGlobal && ctfId) {
            query.ctf_id = ctfId;
        }

        // Get leaderboard data using cache (we need to get more than requested for proper pagination)
        const userScores = await getCachedUserScores(query);
        const fullLeaderboard = Array.from(userScores.values())
            .sort((a, b) => b.totalScore - a.totalScore)
            .slice(0, limit + offset);
        
        // Apply range filtering
        const paginatedLeaderboard = fullLeaderboard.slice(offset, offset + limit);
        
        // Format data for JSON response (convert Sets and Maps to arrays/objects)
        const formattedLeaderboard = paginatedLeaderboard.map((entry, index) => ({
            rank: offset + index + 1,
            userId: entry.userId,
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

        // Response metadata
        const metadata = {
            total: fullLeaderboard.length,
            limit,
            offset,
            returned: formattedLeaderboard.length,
            isGlobal,
            ctfId: ctfId || null,
            timestamp: new Date().toISOString()
        };

        res.json({
            metadata,
            data: formattedLeaderboard
        });

    } catch (error) {
        console.error("Error fetching scoreboard:", error);
        res.status(500).json({
            error: "Internal server error",
            message: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
    }
});

// User profile API endpoint
app.get("/api/profile/:id", async (req, res) => {
    try {
        const userId = req.params.id;
        
        if (!userId) {
            res.status(400).json({
                error: "User ID is required"
            });
            return;
        }

        // Get all user scores to find the specific user (using cache)
        const userScores = await getCachedUserScores();
        const userProfile = userScores.get(userId);
        
        if (!userProfile) {
            res.status(404).json({
                error: "User not found",
                message: `No profile data found for user ID: ${userId}`
            });
            return;
        }

        // Calculate user's global rank
        const allUsers = Array.from(userScores.values())
            .sort((a, b) => b.totalScore - a.totalScore);
        const userRank = allUsers.findIndex(user => user.userId === userId) + 1;

        // Get category statistics
        const categoryStats = Array.from(userProfile.categories).map(category => {
            const categorySolves = userProfile.recentSolves.filter((solve: UserSolve) => solve.category === category);
            const categoryPoints = categorySolves.reduce((sum: number, solve: UserSolve) => sum + solve.points, 0);
            return {
                name: category,
                solves: categorySolves.length,
                totalPoints: categoryPoints,
                avgPoints: categorySolves.length > 0 ? Math.round(categoryPoints / categorySolves.length) : 0
            };
        }).sort((a, b) => b.solves - a.solves);

        // Format CTF breakdown for better readability
        const ctfBreakdownArray = Array.from(userProfile.ctfBreakdown.entries()).map(([ctfId, breakdown]: [string, any]) => ({
            ctfId,
            ctfTitle: breakdown.ctfTitle,
            weight: breakdown.weight,
            solves: breakdown.solves,
            points: breakdown.points,
            score: Math.round(breakdown.score * 100) / 100,
            contribution: Math.round((breakdown.score / userProfile.totalScore) * 100 * 100) / 100 // percentage contribution
        })).sort((a: any, b: any) => b.score - a.score);

        // Recent activity (last 10 solves sorted by date)
        const recentActivity = userProfile.recentSolves
            .sort((a: UserSolve, b: UserSolve) => new Date(b.solved_at).getTime() - new Date(a.solved_at).getTime())
            .slice(0, 10)
            .map((solve: UserSolve) => ({
                ctf_id: solve.ctf_id,
                challenge: solve.challenge,
                category: solve.category,
                points: solve.points,
                solved_at: solve.solved_at,
                isTeamSolve: solve.users.length > 1,
                teammates: solve.users.filter((id: string) => id !== userId)
            }));

        // Calculate achievements and milestones
        const achievements = [];
        
        if (userProfile.solveCount >= 100) achievements.push({ name: "Century Solver", description: "Solved 100+ challenges", icon: "🎯" });
        if (userProfile.solveCount >= 50) achievements.push({ name: "Power Solver", description: "Solved 50+ challenges", icon: "⚡" });
        if (userProfile.ctfCount >= 10) achievements.push({ name: "CTF Explorer", description: "Participated in 10+ CTFs", icon: "🗺️" });
        if (userProfile.categories.size >= 5) achievements.push({ name: "Well Rounded", description: "Solved challenges in 5+ categories", icon: "🌟" });
        if (userRank <= 3) achievements.push({ name: "Podium Finisher", description: `Global rank #${userRank}`, icon: userRank === 1 ? "🥇" : userRank === 2 ? "🥈" : "🥉" });
        if (userRank <= 10) achievements.push({ name: "Top 10", description: `Global rank #${userRank}`, icon: "🏆" });

        // Response data
        const profileData = {
            userId,
            globalRank: userRank,
            totalUsers: allUsers.length,
            stats: {
                totalScore: Math.round(userProfile.totalScore * 100) / 100,
                solveCount: userProfile.solveCount,
                ctfCount: userProfile.ctfCount,
                categoriesCount: userProfile.categories.size,
                averageScorePerSolve: Math.round((userProfile.totalScore / userProfile.solveCount) * 100) / 100,
                averageSolvesPerCTF: Math.round((userProfile.solveCount / userProfile.ctfCount) * 100) / 100
            },
            categoryBreakdown: categoryStats,
            ctfParticipation: ctfBreakdownArray,
            recentActivity,
            achievements,
            metadata: {
                profileGenerated: new Date().toISOString(),
                dataSource: "Fair Scoring System"
            }
        };

        res.json(profileData);

    } catch (error) {
        console.error("Error fetching user profile:", error);
        res.status(500).json({
            error: "Internal server error",
            message: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
    }
});

// CTF-specific user profile API endpoint
app.get("/api/ctf/:ctfId/profile/:userId", async (req, res) => {
    try {
        const { ctfId, userId } = req.params;
        
        if (!ctfId || !userId) {
            res.status(400).json({
                error: "Both CTF ID and User ID are required"
            });
            return;
        }

        // Get CTF-specific user scores (using cache)
        const ctfQuery = { ctf_id: ctfId };
        const ctfUserScores = await getCachedUserScores(ctfQuery);
        const userProfile = ctfUserScores.get(userId);
        
        if (!userProfile) {
            res.status(404).json({
                error: "User not found in this CTF",
                message: `No participation data found for user ${userId} in CTF ${ctfId}`
            });
            return;
        }

        // Get CTF information from the user's breakdown
        const ctfInfo = userProfile.ctfBreakdown.get(ctfId);
        if (!ctfInfo) {
            res.status(404).json({
                error: "CTF data not found",
                message: `No CTF data found for ${ctfId}`
            });
            return;
        }

        // Calculate user's rank within this CTF
        const ctfParticipants = Array.from(ctfUserScores.values())
            .sort((a, b) => b.totalScore - a.totalScore);
        const userRank = ctfParticipants.findIndex(user => user.userId === userId) + 1;

        // Calculate CTF statistics for comparison
        const totalParticipants = ctfParticipants.length;
        const totalSolves = ctfParticipants.reduce((sum, user) => sum + user.solveCount, 0);
        const totalPoints = ctfParticipants.reduce((sum, user) => sum + user.totalScore, 0);
        const avgScore = totalPoints / totalParticipants;
        const medianScore = ctfParticipants[Math.floor(totalParticipants / 2)]?.totalScore || 0;

        // Get all categories in this CTF
        const allCategories = new Set<string>();
        ctfParticipants.forEach(participant => {
            participant.categories.forEach(cat => allCategories.add(cat));
        });

        // User's category performance within this CTF
        const ctfSolves = userProfile.recentSolves.filter(solve => solve.ctf_id === ctfId);
        const categoryStats = Array.from(userProfile.categories).map(category => {
            const categorySolves = ctfSolves.filter(solve => solve.category === category);
            const categoryPoints = categorySolves.reduce((sum, solve) => sum + solve.points, 0);
            
            // Calculate how user ranks in this category within the CTF
            const categoryParticipants = ctfParticipants.filter(p => p.categories.has(category));
            const userCategoryScore = categorySolves.length;
            const categoryRank = categoryParticipants
                .map(p => p.recentSolves.filter(s => s.category === category).length)
                .filter(score => score > userCategoryScore).length + 1;
            
            return {
                name: category,
                solves: categorySolves.length,
                totalPoints: categoryPoints,
                avgPoints: categorySolves.length > 0 ? Math.round(categoryPoints / categorySolves.length) : 0,
                rankInCategory: categoryRank,
                totalInCategory: categoryParticipants.length,
                percentile: Math.round((1 - (categoryRank - 1) / categoryParticipants.length) * 100)
            };
        }).sort((a, b) => b.solves - a.solves);

        // All solves in this CTF (not just recent ones)
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

        // CTF-specific achievements
        const ctfAchievements = [];
        const solvePercentage = (userProfile.solveCount / totalSolves) * 100;
        
        if (userRank === 1) ctfAchievements.push({ name: "CTF Champion", description: `#1 in ${ctfInfo.ctfTitle}`, icon: "👑" });
        else if (userRank <= 3) ctfAchievements.push({ name: "CTF Podium", description: `#${userRank} in ${ctfInfo.ctfTitle}`, icon: userRank === 2 ? "🥈" : "🥉" });
        else if (userRank <= Math.ceil(totalParticipants * 0.1)) ctfAchievements.push({ name: "Top 10%", description: `Top 10% in ${ctfInfo.ctfTitle}`, icon: "🌟" });
        else if (userRank <= Math.ceil(totalParticipants * 0.25)) ctfAchievements.push({ name: "Top 25%", description: `Top 25% in ${ctfInfo.ctfTitle}`, icon: "⭐" });
        
        if (userProfile.solveCount >= 10) ctfAchievements.push({ name: "CTF Solver", description: "Solved 10+ challenges", icon: "🎯" });
        if (userProfile.categories.size >= Math.ceil(allCategories.size * 0.75)) ctfAchievements.push({ name: "Category Master", description: "Solved challenges in most categories", icon: "🧩" });
        if (solvePercentage >= 10) ctfAchievements.push({ name: "Active Participant", description: `${Math.round(solvePercentage)}% of total CTF solves`, icon: "🔥" });

        // Performance comparison
        const performanceComparison = {
            scoreVsAverage: {
                user: Math.round(userProfile.totalScore * 100) / 100,
                average: Math.round(avgScore * 100) / 100,
                percentageDiff: Math.round(((userProfile.totalScore - avgScore) / avgScore) * 100)
            },
            scoreVsMedian: {
                user: Math.round(userProfile.totalScore * 100) / 100,
                median: Math.round(medianScore * 100) / 100,
                percentageDiff: Math.round(((userProfile.totalScore - medianScore) / medianScore) * 100)
            },
            solvesVsAverage: {
                user: userProfile.solveCount,
                average: Math.round(totalSolves / totalParticipants * 100) / 100,
                percentageDiff: Math.round(((userProfile.solveCount - (totalSolves / totalParticipants)) / (totalSolves / totalParticipants)) * 100)
            }
        };

        // Response data
        const ctfProfileData = {
            userId,
            ctfId,
            ctfInfo: {
                title: ctfInfo.ctfTitle,
                weight: ctfInfo.weight
            },
            ctfRank: userRank,
            totalParticipants,
            percentile: Math.round((1 - (userRank - 1) / totalParticipants) * 100),
            stats: {
                score: Math.round(userProfile.totalScore * 100) / 100,
                solveCount: userProfile.solveCount,
                categoriesCount: userProfile.categories.size,
                averagePointsPerSolve: Math.round((ctfSolves.reduce((sum, solve) => sum + solve.points, 0) / ctfSolves.length) * 100) / 100,
                contributionToTotal: Math.round((userProfile.solveCount / totalSolves) * 100 * 100) / 100
            },
            categoryBreakdown: categoryStats,
            allSolves: allCtfSolves,
            achievements: ctfAchievements,
            performanceComparison,
            ctfOverview: {
                totalParticipants,
                totalSolves,
                averageScore: Math.round(avgScore * 100) / 100,
                medianScore: Math.round(medianScore * 100) / 100,
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
        res.status(500).json({
            error: "Internal server error",
            message: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
    }
});

// Cache management endpoints
app.get("/api/cache/status", (req, res) => {
    try {
        const stats = cache.getStats();
        res.json({
            status: "active",
            statistics: {
                ...stats,
                hitRate: Math.round(stats.hitRate * 100 * 100) / 100 // Convert to percentage with 2 decimals
            },
            settings: {
                defaultTTL: "10 minutes",
                cleanupInterval: "5 minutes"
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error getting cache status:", error);
        res.status(500).json({
            error: "Failed to get cache status",
            message: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
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
                    userId: user.userId,
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
                userId: user.userId,
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
