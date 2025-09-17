import { Router } from 'express';
import { CTFCacheModel, solveModel } from "../../src/Database/connect";
import { getCachedUserScores } from '../services/dataService';

const router = Router();

/**
 * GET /api/ctfs
 * 
 * List CTFs with optional filtering and participation data
 */
router.get("/", async (req, res) => {
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

/**
 * GET /api/ctfs/rankings
 * 
 * Returns CTFs with leaderboard data for the rankings component
 */
router.get("/rankings", async (req, res) => {
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

/**
 * GET /api/ctfs/:ctfId
 * 
 * Get detailed information about a specific CTF
 */
router.get("/:ctfId", async (req, res) => {
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

export default router;
