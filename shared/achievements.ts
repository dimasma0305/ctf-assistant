/**
 * Shared Achievement Definitions
 * 
 * This file defines all possible achievements that can be earned by users.
 * It's shared between the API and UI to ensure consistency.
 */

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'ranking' | 'participation' | 'skill' | 'contribution';
}

export interface GlobalCheckParams {
  userProfile: any;
  userRank: number;
  totalUsers: number;
  globalStats: any;
  allCategories: Set<string>;
}

export interface CTFCheckParams {
  userProfile: any;
  userRank: number;
  totalUsers: number;
  ctfStats: any;
  allCategories: Set<string>;
  ctfTitle?: string;
}

export interface AchievementCriteria {
  id: string;
  checkGlobal?: (params: GlobalCheckParams) => boolean;
  checkCTF?: (params: CTFCheckParams) => boolean;
  scope: 'global' | 'ctf' | 'both';
}

/**
 * Master Achievement Definitions
 */
export const ACHIEVEMENTS: Record<string, Achievement> = {
  // Ranking Achievements
  GLOBAL_CHAMPION: {
    id: 'GLOBAL_CHAMPION',
    name: 'Global Champion',
    description: '#1 worldwide',
    icon: '👑',
    category: 'ranking'
  },
  CTF_CHAMPION: {
    id: 'CTF_CHAMPION',
    name: 'CTF Champion',
    description: '#1 in CTF',
    icon: '👑',
    category: 'ranking'
  },
  GLOBAL_PODIUM: {
    id: 'GLOBAL_PODIUM',
    name: 'Global Podium',
    description: 'Top 3 worldwide',
    icon: '🥈', // Will be dynamic based on rank
    category: 'ranking'
  },
  CTF_PODIUM: {
    id: 'CTF_PODIUM',
    name: 'CTF Podium',
    description: 'Top 3 in CTF',
    icon: '🥈', // Will be dynamic based on rank
    category: 'ranking'
  },
  ELITE_GLOBAL: {
    id: 'ELITE_GLOBAL',
    name: 'Elite',
    description: 'Top 5% globally',
    icon: '⭐',
    category: 'ranking'
  },
  ELITE_CTF: {
    id: 'ELITE_CTF',
    name: 'Elite',
    description: 'Top 5% in CTF',
    icon: '⭐',
    category: 'ranking'
  },
  TOP_10_GLOBAL: {
    id: 'TOP_10_GLOBAL',
    name: 'Top 10%',
    description: 'Top 10% globally',
    icon: '🌟',
    category: 'ranking'
  },
  TOP_10_CTF: {
    id: 'TOP_10_CTF',
    name: 'Top 10%',
    description: 'Top 10% in CTF',
    icon: '🌟',
    category: 'ranking'
  },
  TOP_25_GLOBAL: {
    id: 'TOP_25_GLOBAL',
    name: 'Top 25%',
    description: 'Top 25% globally',
    icon: '⭐',
    category: 'ranking'
  },
  TOP_25_CTF: {
    id: 'TOP_25_CTF',
    name: 'Top 25%',
    description: 'Top 25% in CTF',
    icon: '⭐',
    category: 'ranking'
  },

  // Participation Achievements
  CENTURY_CLUB: {
    id: 'CENTURY_CLUB',
    name: 'Century Club',
    description: 'Solved 100+ challenges',
    icon: '💯',
    category: 'participation'
  },
  VETERAN_SOLVER: {
    id: 'VETERAN_SOLVER',
    name: 'Veteran Solver',
    description: 'Solved 50+ challenges',
    icon: '🎯',
    category: 'participation'
  },
  ACTIVE_SOLVER: {
    id: 'ACTIVE_SOLVER',
    name: 'Active Solver',
    description: 'Solved 20+ challenges',
    icon: '🔥',
    category: 'participation'
  },
  CTF_SOLVER: {
    id: 'CTF_SOLVER',
    name: 'CTF Solver',
    description: 'Solved 10+ challenges',
    icon: '🎯',
    category: 'participation'
  },
  CTF_EXPLORER: {
    id: 'CTF_EXPLORER',
    name: 'CTF Explorer',
    description: 'Participated in 10+ CTFs',
    icon: '🗺️',
    category: 'participation'
  },
  MULTI_CTF_PLAYER: {
    id: 'MULTI_CTF_PLAYER',
    name: 'Multi-CTF Player',
    description: 'Participated in 5+ CTFs',
    icon: '🏆',
    category: 'participation'
  },

  // Skill Achievements
  POLYMATH: {
    id: 'POLYMATH',
    name: 'Polymath',
    description: 'Master of multiple categories',
    icon: '🧩',
    category: 'skill'
  },
  CATEGORY_MASTER: {
    id: 'CATEGORY_MASTER',
    name: 'Category Master',
    description: 'Solved challenges in most categories',
    icon: '🧩',
    category: 'skill'
  },
  VERSATILE: {
    id: 'VERSATILE',
    name: 'Versatile',
    description: 'Active in many categories',
    icon: '🔧',
    category: 'skill'
  },

  // Contribution Achievements
  MAJOR_CONTRIBUTOR: {
    id: 'MAJOR_CONTRIBUTOR',
    name: 'Major Contributor',
    description: 'Significant community contribution',
    icon: '🌟',
    category: 'contribution'
  },
  ACTIVE_PARTICIPANT: {
    id: 'ACTIVE_PARTICIPANT',
    name: 'Active Participant',
    description: 'Active CTF participation',
    icon: '🔥',
    category: 'contribution'
  }
};

/**
 * Achievement Criteria Definitions
 */
export const ACHIEVEMENT_CRITERIA: AchievementCriteria[] = [
  // Global Champion
  {
    id: 'GLOBAL_CHAMPION',
    scope: 'global',
    checkGlobal: ({ userRank }) => userRank === 1
  },
  
  // CTF Champion
  {
    id: 'CTF_CHAMPION',
    scope: 'ctf',
    checkCTF: ({ userRank }) => userRank === 1
  },

  // Global Podium (2nd-3rd place)
  {
    id: 'GLOBAL_PODIUM',
    scope: 'global',
    checkGlobal: ({ userRank }) => userRank === 2 || userRank === 3
  },

  // CTF Podium (2nd-3rd place)
  {
    id: 'CTF_PODIUM',
    scope: 'ctf',
    checkCTF: ({ userRank }) => userRank === 2 || userRank === 3
  },

  // Elite Global (Top 5%)
  {
    id: 'ELITE_GLOBAL',
    scope: 'global',
    checkGlobal: ({ userRank, totalUsers }) => userRank > 3 && userRank <= Math.ceil(totalUsers * 0.05)
  },

  // Elite CTF (Top 5%)
  {
    id: 'ELITE_CTF',
    scope: 'ctf',
    checkCTF: ({ userRank, totalUsers }) => userRank > 3 && userRank <= Math.ceil(totalUsers * 0.05)
  },

  // Top 10% Global
  {
    id: 'TOP_10_GLOBAL',
    scope: 'global',
    checkGlobal: ({ userRank, totalUsers }) => userRank > Math.ceil(totalUsers * 0.05) && userRank <= Math.ceil(totalUsers * 0.1)
  },

  // Top 10% CTF
  {
    id: 'TOP_10_CTF',
    scope: 'ctf',
    checkCTF: ({ userRank, totalUsers }) => userRank > Math.ceil(totalUsers * 0.05) && userRank <= Math.ceil(totalUsers * 0.1)
  },

  // Top 25% Global
  {
    id: 'TOP_25_GLOBAL',
    scope: 'global',
    checkGlobal: ({ userRank, totalUsers }) => userRank > Math.ceil(totalUsers * 0.1) && userRank <= Math.ceil(totalUsers * 0.25)
  },

  // Top 25% CTF
  {
    id: 'TOP_25_CTF',
    scope: 'ctf',
    checkCTF: ({ userRank, totalUsers }) => userRank > Math.ceil(totalUsers * 0.1) && userRank <= Math.ceil(totalUsers * 0.25)
  },

  // Century Club (100+ solves)
  {
    id: 'CENTURY_CLUB',
    scope: 'global',
    checkGlobal: ({ userProfile }) => userProfile.solveCount >= 100
  },

  // Veteran Solver (50+ solves)
  {
    id: 'VETERAN_SOLVER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => userProfile.solveCount >= 50 && userProfile.solveCount < 100
  },

  // Active Solver (20+ solves)
  {
    id: 'ACTIVE_SOLVER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => userProfile.solveCount >= 20 && userProfile.solveCount < 50
  },

  // CTF Solver (10+ solves in CTF)
  {
    id: 'CTF_SOLVER',
    scope: 'ctf',
    checkCTF: ({ userProfile }) => userProfile.solveCount >= 10
  },

  // CTF Explorer (10+ CTFs)
  {
    id: 'CTF_EXPLORER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => userProfile.ctfCount >= 10
  },

  // Multi-CTF Player (5+ CTFs)
  {
    id: 'MULTI_CTF_PLAYER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => userProfile.ctfCount >= 5 && userProfile.ctfCount < 10
  },

  // Polymath (75%+ categories globally)
  {
    id: 'POLYMATH',
    scope: 'global',
    checkGlobal: ({ userProfile, allCategories }) => 
      userProfile.categories.size >= Math.ceil(allCategories.size * 0.75)
  },

  // Category Master (75%+ categories in CTF)
  {
    id: 'CATEGORY_MASTER',
    scope: 'ctf',
    checkCTF: ({ userProfile, allCategories }) => 
      userProfile.categories.size >= Math.ceil(allCategories.size * 0.75)
  },

  // Versatile (50%+ categories)
  {
    id: 'VERSATILE',
    scope: 'both',
    checkGlobal: ({ userProfile, allCategories }) => 
      userProfile.categories.size >= Math.ceil(allCategories.size * 0.5) && userProfile.categories.size < Math.ceil(allCategories.size * 0.75),
    checkCTF: ({ userProfile, allCategories }) => 
      userProfile.categories.size >= Math.ceil(allCategories.size * 0.5) && userProfile.categories.size < Math.ceil(allCategories.size * 0.75)
  },

  // Major Contributor (5%+ of total solves globally)
  {
    id: 'MAJOR_CONTRIBUTOR',
    scope: 'global',
    checkGlobal: ({ userProfile, globalStats }) => 
      (userProfile.solveCount / globalStats.totalSolves) * 100 >= 5
  },

  // Active Participant (10%+ of total solves in CTF)
  {
    id: 'ACTIVE_PARTICIPANT',
    scope: 'ctf',
    checkCTF: ({ userProfile, ctfStats }) => 
      (userProfile.solveCount / ctfStats.totalSolves) * 100 >= 10
  }
];

/**
 * Helper function to get achievement by ID with dynamic properties
 */
export function getAchievement(id: string, overrides: Partial<Achievement> = {}): Achievement {
  const baseAchievement = ACHIEVEMENTS[id];
  if (!baseAchievement) {
    throw new Error(`Achievement with ID '${id}' not found`);
  }
  
  return {
    ...baseAchievement,
    ...overrides
  };
}

/**
 * Helper function to get dynamic rank-specific achievements
 */
export function getRankAchievement(scope: 'global' | 'ctf', rank: number, ctfTitle?: string): Achievement {
  if (rank === 1) {
    const id = scope === 'global' ? 'GLOBAL_CHAMPION' : 'CTF_CHAMPION';
    return getAchievement(id, {
      description: scope === 'global' ? '#1 worldwide' : `#1 in ${ctfTitle}`
    });
  } else if (rank <= 3) {
    const id = scope === 'global' ? 'GLOBAL_PODIUM' : 'CTF_PODIUM';
    const rankIcon = rank === 2 ? '🥈' : '🥉';
    return getAchievement(id, {
      description: scope === 'global' ? `#${rank} worldwide` : `#${rank} in ${ctfTitle}`,
      icon: rankIcon
    });
  }
  
  throw new Error(`No rank achievement defined for rank ${rank}`);
}
