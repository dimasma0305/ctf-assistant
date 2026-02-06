// API Response Types

export interface UserInfo {
  userId: string
  username: string
  displayName: string
  avatar?: string
}

export interface UserSolve {
  ctf_id: string
  challenge: string
  category: string
  points: number
  solved_at: string
  isTeamSolve?: boolean
  teammates?: string[]
}

export interface CTFBreakdown {
  ctf_id: string
  ctfTitle: string
  weight: number
  solves: number
  points: number
  score: number
  contribution?: number
  logo: string
}

// Scoreboard API Types
export interface LeaderboardEntry {
  rank: number
  user: UserInfo
  totalScore: number
  solveCount: number
  ctfCount: number
  categories: string[]
  achievementIds: string[]
  recentSolves: UserSolve[]
  ctfBreakdown: Record<string, Omit<CTFBreakdown, "ctfId">>
}

export interface ScoreboardResponse {
  metadata: {
    total: number
    totalUsers: number
    totalSolves: number
    limit: number
    offset: number
    returned: number
    isGlobal: boolean
    ctfId: string | null
    searchTerm: string | null
    isFiltered: boolean
    month?: string | null
    year?: number | null
    availableMonths?: string[]
    availableYears?: number[]
    timestamp: string
  }
  data: LeaderboardEntry[]
}

// Profile API Types - Achievement interface imported from shared module
import type { Achievement } from './achievements'

export type { Achievement }

export interface CategoryStats {
  name: string
  solves: number
  totalScore: number
  avgPoints: number
  rankInCategory?: number
  totalInCategory?: number
  percentile?: number
}

export interface UserProfileResponse {
  user: UserInfo
  globalRank: number
  totalUsers: number
  percentile: number
  stats: {
    totalScore: number
    solveCount: number
    ctfCount: number
    categoriesCount: number
    averagePointsPerSolve: number
    contributionToTotal: number
  }
  categoryBreakdown: CategoryStats[]
  ctfBreakdown: CTFBreakdown[]
  recentSolves: UserSolve[]
  achievementIds: string[]
  performanceComparison: {
    scoreVsAverage: {
      user: number
      average: number
      percentageDiff: number
    }
    scoreVsMedian: {
      user: number
      median: number
      percentageDiff: number
    }
    solvesVsAverage: {
      user: number
      average: number
      percentageDiff: number
    }
  }
  globalOverview: {
    totalUsers: number
    totalSolves: number
    averageScore: number
    medianScore: number
    totalCategories: number
    categories: string[]
  }
  metadata: {
    profileGenerated: string
    dataSource: string
    scope: string
  }
}

// CTF-specific Profile API Types
export interface CTFProfileResponse {
  user: UserInfo
  ctfId: string
  ctfInfo: {
    title: string
    weight: number
  }
  ctfRank: number
  totalParticipants: number
  percentile: number
  stats: {
    score: number
    solveCount: number
    categoriesCount: number
    averagePointsPerSolve: number
    contributionToTotal: number
  }
  categoryBreakdown: CategoryStats[]
  allSolves: UserSolve[]
  achievementIds: string[]
  performanceComparison: {
    scoreVsAverage: {
      user: number
      average: number
      percentageDiff: number
    }
    scoreVsMedian: {
      user: number
      median: number
      percentageDiff: number
    }
    solvesVsAverage: {
      user: number
      average: number
      percentageDiff: number
    }
  }
  ctfOverview: {
    totalParticipants: number
    totalSolves: number
    averageScore: number
    medianScore: number
    totalCategories: number
    categories: string[]
  }
  metadata: {
    profileGenerated: string
    dataSource: string
    scope: string
  }
}

// CTFs API Types
export interface CTFResponse {
  ctf_id: string
  title: string
  organizer: string
  organizers: Array<{
    id?: number
    name: string
  }>
  description: string
  url: string
  logo: string
  format: string
  location: string
  onsite: boolean
  restrictions: string
  weight: number
  participants: number
  duration: {
    hours: number
    days: number
  }
  schedule: {
    start: string
    finish: string
    status: "upcoming" | "active" | "completed"
    durationHours: number
    timeUntilStart?: number
    timeUntilEnd?: number
  }
  communityParticipation: {
    totalSolves: number
    uniqueParticipants: number
    firstSolve: string | null
    lastSolve: string | null
    participated: boolean
  }
  cached_at: string
  last_updated: string
}

export interface CTFsResponse {
  metadata: {
    total: number
    limit: number
    offset: number
    returned: number
    hasNextPage?: boolean
    hasPreviousPage?: boolean
    totalPages?: number
    currentPage?: number
    filters: {
      status: string | null
      format: string | null
      organizer: string | null
      q?: string | null
      hasParticipation: boolean
      sortBy: string
    }
    stats: {
      totalCTFsInDatabase: number
      ctfsWithParticipation: number
      upcoming: number
      active: number
      completed: number
    }
    timestamp: string
  }
  data: CTFResponse[]
}

// CTF Details API Types
export interface CTFDetailsResponse extends Omit<CTFResponse, "communityParticipation"> {
  communityStats: {
    participated: boolean
    totalSolves: number
    uniqueParticipants: number
    challengesSolved: number
    categoriesCovered: number
    categories: string[]
    firstSolve: string | null
    lastSolve: string | null
    participationRate: number
  }
  leaderboard: Array<{
    rank: number
    user: UserInfo
    score: number
    solves: number
  }>
  metadata: {
    cached_at: string
    last_updated: string
    dataFreshness: number
  }
}

// Cache API Types
export interface CacheStatusResponse {
  status: string
  statistics: {
    totalEntries: number
    validEntries: number
    expiredEntries: number
    hitRate: number
  }
  settings: {
    defaultTTL: string
    cleanupInterval: string
  }
  timestamp: string
}

// API Error Types
export interface APIError {
  error: string
  message?: string
  timestamp?: string
}

// Query Parameters Types
export interface ScoreboardParams {
  limit?: number
  offset?: number
  ctf_id?: string
  global?: boolean
  search?: string
  month?: string // YYYY-MM format
  year?: number
}

export interface CTFsParams {
  limit?: number
  offset?: number
  status?: "upcoming" | "active" | "completed"
  format?: string
  organizer?: string
  q?: string
  hasParticipation?: boolean
  sortBy?: "start_desc" | "start_asc" | "title" | "participants"
}

// CTF Rankings API Types
export interface CTFRankingLeaderboardEntry {
  rank: number
  user: UserInfo
  score: number
  solves: number
}

export interface CTFRanking {
  ctf_id: string
  title: string
  organizer: string
  logo: string | null
  schedule: {
    start: string
    finish: string
    status: "upcoming" | "active" | "completed"
  }
  communityStats: {
    uniqueParticipants: number
    totalSolves: number
  }
  leaderboard: CTFRankingLeaderboardEntry[]
}

export interface CTFRankingsResponse {
  data: CTFRanking[]
  metadata: {
    total: number
    limit: number
    offset?: number
    returned?: number
    hasNextPage?: boolean
    hasPreviousPage?: boolean
    totalPages?: number
    currentPage?: number
    filters: {
      status: string | null
      q?: string | null
      hasParticipation: boolean
    }
    timestamp: string
  }
}

export interface CTFRankingsParams {
  limit?: number
  offset?: number
  status?: "upcoming" | "active" | "completed"
  q?: string
  hasParticipation?: boolean
}

// Certificate Types
export interface Certificate {
  id: string
  type: "monthly" | "yearly"
  period: string // "January 2024" for monthly, "2024" for yearly
  periodValue: string // "2024-01" for monthly, "2024" for yearly
  rank: number // 1, 2, or 3
  title: string
  description: string
  score: number
  totalParticipants: number
  issuedDate: string
  isPending: boolean
  issuedAt: string | null // null if pending
  stats: {
    totalScore: number
    challenges: number
    categories: number
  }
}

export interface CertificateResponse {
  userId: string
  certificates: Certificate[]
  userInfo: {
    userId: string
    username: string
    displayName: string
    avatar: string
  }
  metadata: {
    generatedAt: string
    globalRank: number
    totalUsers: number
  }
}

export interface SingleCertificateResponse {
  certificate: Certificate
  userInfo: {
    userId: string
    username: string
    displayName: string
    avatar: string
  }
  metadata: {
    generatedAt: string
    globalRank: number
    totalUsers: number
  }
}

export interface CertificateGenerationData {
  user: UserInfo
  certificate: Certificate
  leaderboardData: {
    rank: number
    totalParticipants: number
    score: number
    percentile: number
  }
}
