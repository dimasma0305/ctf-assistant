import { Router } from 'express';
import { getCachedUserScores, calculateMonthlyRanks } from '../services/dataService';
import { calculateUserRank, calculateGlobalStats } from '../utils/statistics';
import { formatErrorResponse } from '../utils/common';

const router = Router();

/**
 * GET /api/certificates/:userId
 * 
 * Returns certificates for a specific user based on their ranking performance
 */
router.get("/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            res.status(400).json(formatErrorResponse(400, "User ID is required", undefined, req));
            return;
        }

        // Get global user scores
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

        // Calculate user's global rank
        const { rank: userRank, totalUsers } = calculateUserRank(userId, globalUserScores);
        
        // Only generate certificates for top 10 players
        if (userRank > 10) {
            res.json({
                certificates: [],
                message: "Certificates are only available for top 10 players"
            });
            return;
        }

        const certificates: any[] = [];
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;

        // Generate yearly certificate
        const yearlyCertificate = {
            id: `cert-${currentYear}`,
            type: "yearly" as const,
            period: currentYear.toString(),
            periodValue: currentYear.toString(),
            rank: userRank,
            title: `TCP1P ${currentYear} Leaderboard`,
            description: `Top ${userRank} player in TCP1P Community Leaderboard for ${currentYear}`,
            score: Math.round(userProfile.totalScore * 100) / 100,
            totalParticipants: totalUsers,
            issuedDate: `${currentYear}-12-31T23:59:59Z`,
            isPending: currentDate.getMonth() < 11, // Pending until December
            issuedAt: currentDate.getMonth() < 11 ? null : `${currentYear}-12-31T23:59:59Z`,
            stats: {
                totalScore: Math.round(userProfile.totalScore * 100) / 100,
                challenges: userProfile.solveCount,
                categories: userProfile.categories.size
            }
        };

        certificates.push(yearlyCertificate);

        // Generate monthly certificates using the proper scoring system
        // We need to check the user's recent solves to determine which months have activity
        const userSolves = userProfile.recentSolves || [];
        const monthsWithActivity = new Set();
        
        // Extract months from user's solves
        userSolves.forEach(solve => {
            const solveDate = new Date(solve.solved_at);
            const year = solveDate.getFullYear();
            const month = solveDate.getMonth() + 1; // getMonth() returns 0-11, we want 1-12
            monthsWithActivity.add(`${year}-${month.toString().padStart(2, "0")}`);
        });
        
        // Only generate certificates for months with actual activity
        for (const monthKey of monthsWithActivity) {
            const monthKeyStr = monthKey as string;
            const [year, month] = monthKeyStr.split('-').map(Number);
            const monthStr = month.toString().padStart(2, "0");
            const monthName = new Date(year, month - 1).toLocaleString("default", {
                month: "long",
            });
            
            // Check if this is the current month
            const isCurrentMonth = year === currentYear && month === currentMonth;
            
            try {
                // Get monthly ranking data using the proper scoring system
                const monthlyRanks = await calculateMonthlyRanks(monthKeyStr);
                const monthlyUserRank = monthlyRanks.get(userId);
                const monthlyTotalUsers = monthlyRanks.size;
                
                // Only generate certificate if user is in top 10 for that month
                if (monthlyUserRank && monthlyUserRank <= 10 && monthlyUserRank > 0) {
                    // Get monthly user scores using the scoring system
                    const startDate = new Date(year, month - 1, 1);
                    const endDate = new Date(year, month, 0, 23, 59, 59, 999);
                    const monthQuery = {
                        solved_at: {
                            $gte: startDate,
                            $lte: endDate
                        }
                    };
                    
                    const monthlyUserScores = await getCachedUserScores(monthQuery, undefined, false);
                    const monthlyUserProfile = monthlyUserScores.get(userId);
                    
                    if (monthlyUserProfile) {
                        const monthlyCertificate = {
                            id: `cert-${year}-${monthStr}`,
                            type: "monthly" as const,
                            period: `${monthName} ${year}`,
                            periodValue: `${year}-${monthStr}`,
                            rank: monthlyUserRank,
                            title: `TCP1P ${monthName} ${year} Leaderboard`,
                            description: `Top ${monthlyUserRank} player in TCP1P Community Leaderboard for ${monthName} ${year}`,
                            score: Math.round(monthlyUserProfile.totalScore * 100) / 100,
                            totalParticipants: monthlyTotalUsers,
                            issuedDate: `${year}-${monthStr}-${new Date(year, month, 0).getDate()}T23:59:59Z`,
                            isPending: isCurrentMonth && currentDate.getDate() <= 7, // Only pending if current month and early in month
                            issuedAt: (isCurrentMonth && currentDate.getDate() <= 7) ? null : `${year}-${monthStr}-${new Date(year, month, 0).getDate()}T23:59:59Z`,
                            stats: {
                                totalScore: Math.round(monthlyUserProfile.totalScore * 100) / 100,
                                challenges: monthlyUserProfile.solveCount,
                                categories: monthlyUserProfile.categories.size
                            }
                        };

                        certificates.push(monthlyCertificate);
                    }
                }
            } catch (error) {
                console.error(`Error processing monthly certificate for ${monthKeyStr}:`, error);
                // Continue with other months even if one fails
            }
        }

        res.json({
            userId,
            certificates,
            userInfo: {
                userId,
                username: userProfile.username,
                displayName: userProfile.displayName,
                avatar: userProfile.avatar
            },
            metadata: {
                generatedAt: new Date().toISOString(),
                globalRank: userRank,
                totalUsers,
                debug: {
                    currentDate: currentDate.toISOString(),
                    currentYear,
                    currentMonth,
                    certificatesGenerated: certificates.length,
                    monthlyCertificates: certificates.filter(c => c.type === "monthly").length,
                    userSolvesCount: userSolves.length,
                    monthsWithActivity: Array.from(monthsWithActivity),
                    totalUserScore: Math.round(userProfile.totalScore * 100) / 100,
                    globalRank: userRank,
                    usingScoringSystem: true,
                    scoringSystemVersion: "FairScoringSystem",
                    certificateEligibility: "top_10_players",
                    maxRankSupported: 10
                }
            }
        });

    } catch (error) {
        console.error("Error fetching certificates:", error);
        res.status(500).json(formatErrorResponse(
            500,
            "Internal server error",
            process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
            req
        ));
    }
});

/**
 * GET /api/certificates/:userId/:period
 * 
 * Returns a specific certificate for a user and period
 */
router.get("/:userId/:period", async (req, res) => {
    try {
        const { userId, period } = req.params;
        
        if (!userId || !period) {
            res.status(400).json(formatErrorResponse(400, "User ID and period are required", undefined, req));
            return;
        }

        // Get global user scores
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

        // Calculate user's global rank
        const { rank: userRank, totalUsers } = calculateUserRank(userId, globalUserScores);
        
        // Only generate certificates for top 10 players
        if (userRank > 10) {
            res.status(403).json(formatErrorResponse(
                403, 
                "Certificate not available", 
                "Certificates are only available for top 10 players",
                req
            ));
            return;
        }

        // Determine if this is a yearly or monthly period
        const isYearly = /^\d{4}$/.test(period);
        const isMonthly = /^\d{4}-\d{2}$/.test(period);

        if (!isYearly && !isMonthly) {
            res.status(400).json(formatErrorResponse(
                400, 
                "Invalid period format", 
                "Period must be YYYY (yearly) or YYYY-MM (monthly)",
                req
            ));
            return;
        }

        let certificate;
        const currentDate = new Date();

        if (isYearly) {
            const year = parseInt(period);
            certificate = {
                id: `cert-${year}`,
                type: "yearly" as const,
                period: year.toString(),
                periodValue: year.toString(),
                rank: userRank,
                title: `TCP1P ${year} Leaderboard`,
                description: `Top ${userRank} player in TCP1P Community Leaderboard for ${year}`,
                score: Math.round(userProfile.totalScore * 100) / 100,
                totalParticipants: totalUsers,
                issuedDate: `${year}-12-31T23:59:59Z`,
                isPending: currentDate.getFullYear() === year && currentDate.getMonth() < 11,
                issuedAt: (currentDate.getFullYear() === year && currentDate.getMonth() < 11) ? null : `${year}-12-31T23:59:59Z`,
                stats: {
                    totalScore: Math.round(userProfile.totalScore * 100) / 100,
                    challenges: userProfile.solveCount,
                    categories: userProfile.categories.size
                }
            };
        } else {
            // Monthly certificate - check if user has activity in this month using proper scoring system
            const [year, month] = period.split('-').map(Number);
            const monthName = new Date(year, month - 1).toLocaleString("default", {
                month: "long",
            });
            
            try {
                // Get monthly ranking data using the proper scoring system
                const monthlyRanks = await calculateMonthlyRanks(period);
                const monthlyUserRank = monthlyRanks.get(userId);
                const monthlyTotalUsers = monthlyRanks.size;
                
                // Check if user is in top 10 for that month
                if (!monthlyUserRank || monthlyUserRank > 10 || monthlyUserRank <= 0) {
                    res.status(403).json(formatErrorResponse(
                        403, 
                        "Certificate not available", 
                        `User is not in top 10 for ${monthName} ${year} (rank: ${monthlyUserRank})`,
                        req
                    ));
                    return;
                }
                
                // Get monthly user scores using the scoring system
                const startDate = new Date(year, month - 1, 1);
                const endDate = new Date(year, month, 0, 23, 59, 59, 999);
                const monthQuery = {
                    solved_at: {
                        $gte: startDate,
                        $lte: endDate
                    }
                };
                
                const monthlyUserScores = await getCachedUserScores(monthQuery, undefined, false);
                const monthlyUserProfile = monthlyUserScores.get(userId);
                
                if (!monthlyUserProfile) {
                    res.status(404).json(formatErrorResponse(
                        404, 
                        "No activity found for this month", 
                        `No scoring data found for user ${userId} in ${monthName} ${year}`,
                        req
                    ));
                    return;
                }
                
                const isCurrentMonth = currentDate.getFullYear() === year && currentDate.getMonth() === month - 1;
                
                certificate = {
                    id: `cert-${year}-${month.toString().padStart(2, "0")}`,
                    type: "monthly" as const,
                    period: `${monthName} ${year}`,
                    periodValue: period,
                    rank: monthlyUserRank,
                    title: `TCP1P ${monthName} ${year} Leaderboard`,
                    description: `Top ${monthlyUserRank} player in TCP1P Community Leaderboard for ${monthName} ${year}`,
                    score: Math.round(monthlyUserProfile.totalScore * 100) / 100,
                    totalParticipants: monthlyTotalUsers,
                    issuedDate: `${year}-${month.toString().padStart(2, "0")}-${new Date(year, month, 0).getDate()}T23:59:59Z`,
                    isPending: isCurrentMonth && currentDate.getDate() <= 7,
                    issuedAt: (isCurrentMonth && currentDate.getDate() <= 7) ? null : `${year}-${month.toString().padStart(2, "0")}-${new Date(year, month, 0).getDate()}T23:59:59Z`,
                    stats: {
                        totalScore: Math.round(monthlyUserProfile.totalScore * 100) / 100,
                        challenges: monthlyUserProfile.solveCount,
                        categories: monthlyUserProfile.categories.size
                    }
                };
            } catch (error) {
                console.error(`Error processing monthly certificate for ${period}:`, error);
                res.status(500).json(formatErrorResponse(
                    500,
                    "Internal server error",
                    `Error processing certificate for ${period}`,
                    req
                ));
                return;
            }
        }

        res.json({
            certificate,
            userInfo: {
                userId,
                username: userProfile.username,
                displayName: userProfile.displayName,
                avatar: userProfile.avatar
            },
            metadata: {
                generatedAt: new Date().toISOString(),
                globalRank: userRank,
                totalUsers
            }
        });

    } catch (error) {
        console.error("Error fetching certificate:", error);
        res.status(500).json(formatErrorResponse(
            500,
            "Internal server error",
            process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
            req
        ));
    }
});

export default router;
