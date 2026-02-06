import { Router } from 'express';
import { CTFCacheModel, solveModel } from "../../src/Database/connect";
import { getCachedUserScores } from '../services/dataService';
import { getCTFParticipationMap } from '../services/ctfParticipation';
import { escapeRegex } from '../utils/common';

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
        const q = req.query.q as string; // full-text-ish search (title/organizer/description)
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

        const participationMap = await getCTFParticipationMap();

        const andClauses: any[] = [];
        if (organizer) {
            andClauses.push({ 'organizers.name': { $regex: escapeRegex(organizer), $options: 'i' } });
        }
        if (format) {
            andClauses.push({ format: { $regex: escapeRegex(format), $options: 'i' } });
        }
        if (q && q.trim()) {
            const re = new RegExp(escapeRegex(q.trim()), 'i');
            andClauses.push({
                $or: [
                    { title: re },
                    { 'organizers.name': re },
                    { description: re }
                ]
            });
        }

        const now = new Date();
        const statusClause = (() => {
            if (status === 'upcoming') return { start: { $gt: now } };
            if (status === 'active') return { start: { $lte: now }, finish: { $gte: now } };
            if (status === 'completed') return { finish: { $lt: now } };
            return null;
        })();
        if (statusClause) andClauses.push(statusClause);

        if (hasParticipation) {
            const ids = Array.from(participationMap.keys());
            andClauses.push({ ctf_id: { $in: ids } });
        }

        const ctfQuery: any = andClauses.length > 0 ? { $and: andClauses } : {};

        const sort: any = (() => {
            switch (sortBy) {
                case 'start_asc':
                    return { start: 1 };
                case 'title':
                    return { title: 1 };
                case 'participants':
                    // Fall back to cached participant count field. (Previously used solve-derived uniqueParticipants.)
                    return { participants: -1 };
                case 'start_desc':
                default:
                    return { start: -1 };
            }
        })();

        const totalCTFs = await CTFCacheModel.countDocuments(ctfQuery);
        const paginatedCTFs = await CTFCacheModel.find(ctfQuery).sort(sort).skip(offset).limit(limit).lean();

        // Format response data
        const formattedCTFs = paginatedCTFs.map((ctf: any) => {
            const participation = participationMap.get(ctf.ctf_id);
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

        const hasNextPage = offset + formattedCTFs.length < totalCTFs;
        const hasPreviousPage = offset > 0;
        const totalPages = Math.max(1, Math.ceil(totalCTFs / limit));
        const currentPage = Math.floor(offset / limit) + 1;

        // Response metadata
        // Note: stats are best-effort and may reflect the filtered view depending on provided filters.
        const baseClauses: any[] = [];
        if (organizer) baseClauses.push({ 'organizers.name': { $regex: escapeRegex(organizer), $options: 'i' } });
        if (format) baseClauses.push({ format: { $regex: escapeRegex(format), $options: 'i' } });
        if (q && q.trim()) {
            const re = new RegExp(escapeRegex(q.trim()), 'i');
            baseClauses.push({ $or: [{ title: re }, { 'organizers.name': re }, { description: re }] });
        }
        if (hasParticipation) {
            const ids = Array.from(participationMap.keys());
            baseClauses.push({ ctf_id: { $in: ids } });
        }
        const totalInDb = await CTFCacheModel.countDocuments({});
        const upcomingCount = await CTFCacheModel.countDocuments({
            $and: [...baseClauses, { start: { $gt: now } }],
        });
        const activeCount = await CTFCacheModel.countDocuments({
            $and: [...baseClauses, { start: { $lte: now }, finish: { $gte: now } }],
        });
        const completedCount = await CTFCacheModel.countDocuments({
            $and: [...baseClauses, { finish: { $lt: now } }],
        });

        const metadata = {
            total: totalCTFs,
            limit,
            offset,
            returned: formattedCTFs.length,
            hasNextPage,
            hasPreviousPage,
            totalPages,
            currentPage,
            filters: {
                status: status || null,
                format: format || null,
                organizer: organizer || null,
                q: q || null,
                hasParticipation: hasParticipation || false,
                sortBy
            },
            stats: {
                totalCTFsInDatabase: totalInDb,
                ctfsWithParticipation: participationMap.size,
                upcoming: upcomingCount,
                active: activeCount,
                completed: completedCount
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
        const offset = parseInt(req.query.offset as string) || 0;
        const status = req.query.status as string; // upcoming, active, completed
        const q = req.query.q as string; // search title/organizer/description
        const hasParticipation = req.query.hasParticipation !== 'false'; // default to true
        
        // Validate parameters
        if (limit < 1 || limit > 50) {
            res.status(400).json({
                error: "Limit must be between 1 and 50"
            });
            return;
        }
        
        if (offset < 0) {
            res.status(400).json({
                error: "Offset must be non-negative"
            });
            return;
        }

        const participationMap = await getCTFParticipationMap();

        // Build query for CTFs
        const andClauses: any[] = [];
        const now = new Date();
        
        if (q && q.trim()) {
            const re = new RegExp(escapeRegex(q.trim()), 'i');
            andClauses.push({
                $or: [
                    { title: re },
                    { 'organizers.name': re },
                    { description: re }
                ]
            });
        }

        if (status === 'upcoming') {
            andClauses.push({ start: { $gt: now } });
        } else if (status === 'active') {
            andClauses.push({ start: { $lte: now }, finish: { $gte: now } });
        } else if (status === 'completed') {
            andClauses.push({ finish: { $lt: now } });
        }

        // Filter to only CTFs with participation if requested
        if (hasParticipation) {
            const ids = Array.from(participationMap.keys());
            andClauses.push({ ctf_id: { $in: ids } });
        }

        const ctfQuery: any = andClauses.length ? { $and: andClauses } : {};

        const totalCTFs = await CTFCacheModel.countDocuments(ctfQuery);
        const paginatedCTFs = await CTFCacheModel.find(ctfQuery).sort({ start: -1 }).skip(offset).limit(limit).lean();

        // Get leaderboard data for each CTF
        const ctfRankings = await Promise.all(paginatedCTFs.map(async (ctf: any) => {
            const participation = participationMap.get(ctf.ctf_id);
            if (!participation) {
                return null; // Skip CTFs without participation
            }

            // Get top performers for this CTF (cached)
            const topPerformers = await getCachedUserScores({ ctf_id: ctf.ctf_id }, 5 * 60 * 1000, false); // 5 minute cache, no extended metrics
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
                    uniqueParticipants: participation.participantCount,
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
                total: totalCTFs,
                limit,
                offset,
                returned: validRankings.length,
                hasNextPage: offset + limit < totalCTFs,
                hasPreviousPage: offset > 0,
                totalPages: Math.ceil(totalCTFs / limit),
                currentPage: Math.floor(offset / limit) + 1,
                filters: {
                    status: status || null,
                    q: q || null,
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
