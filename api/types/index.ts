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
