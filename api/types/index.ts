/**
 * TypeScript Type Definitions
 * 
 * Common interfaces and types used throughout the API
 */

// ===== USER AND SOLVE TYPES =====

export interface UserSolve {
    ctf_id: string;
    challenge: string;
    category: string;
    points: number;
    solved_at: Date;
    users: string[]; // Discord IDs for consistency
}

export interface UserProfile {
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
    
    // Extended fields for achievements
    rankImprovement?: number; // How many ranks improved over time
    fastSolves?: number; // Number of solves completed in under 1 hour
    ultraFastSolves?: number; // Number of solves completed in under 5 minutes  
    longestStreak?: number; // Longest consecutive solving streak in days
    weekendSolveRatio?: number; // Ratio of weekend solves (0-1)
    nightSolves?: number; // Number of solves after midnight
    morningSolves?: number; // Number of solves before 8 AM
    categorySolves?: Record<string, number>; // Solve counts per category
    firstBloods?: number; // Number of first blood achievements
    hardSolves?: number; // Number of hard-difficulty solves
    expertSolves?: number; // Number of expert-difficulty solves
    uniqueChallengeTypes?: number; // Number of unique challenge types solved
    teamCTFs?: number; // Number of team-based CTF participations
    helpedUsers?: number; // Number of users helped/mentored
    communityScore?: number; // Overall community contribution score
    membershipDays?: number; // Days since joining the platform
    isEarlyAdopter?: boolean; // Whether user was an early platform adopter
    challengesCreated?: number; // Number of challenges created
    writeupCount?: number; // Number of writeups published
    hintsGiven?: number; // Number of hints provided to other users
    discussionPosts?: number; // Number of discussion forum posts
    eventsOrganized?: number; // Number of events organized
}

// ===== RANKING AND STATISTICS TYPES =====

export interface UserRankingResult {
    rank: number;
    totalUsers: number;
    percentile: number;
}

export interface GlobalStats {
    totalSolves: number;
    totalScore: number;
    avgScore: number;
    medianScore: number;
}

export interface PerformanceComparison {
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

export interface CategoryStat {
    name: string;
    solves: number;
    totalScore: number;
    avgPoints: number;
    rankInCategory: number;
    totalInCategory: number;
    percentile: number;
}

// Achievement interface is now defined in shared/achievements.ts

// ===== VALIDATION TYPES =====

export interface ValidationResult {
    isValid: boolean;
    error?: string;
    limit: number;
    offset: number;
}

// ===== TIME RANGE TYPES =====

export interface AvailableTimeRanges {
    months: string[]; // Array of YYYY-MM strings
    years: number[];  // Array of years
}
