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
    icon: '🥈', 
    category: 'ranking'
  },
  CTF_PODIUM: {
    id: 'CTF_PODIUM',
    name: 'CTF Podium',
    description: 'Top 3 in CTF',
    icon: '🥈', 
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
  TOP_50_GLOBAL: {
    id: 'TOP_50_GLOBAL',
    name: 'Top 50%',
    description: 'Top 50% globally',
    icon: '📈',
    category: 'ranking'
  },
  TOP_50_CTF: {
    id: 'TOP_50_CTF',
    name: 'Top 50%',
    description: 'Top 50% in CTF',
    icon: '📈',
    category: 'ranking'
  },
  RISING_STAR: {
    id: 'RISING_STAR',
    name: 'Rising Star',
    description: 'Climbed 50+ ranks',
    icon: '🌟',
    category: 'ranking'
  },
  COMEBACK_KID: {
    id: 'COMEBACK_KID',
    name: 'Comeback Kid',
    description: 'Climbed 100+ ranks',
    icon: '🚀',
    category: 'ranking'
  },

  // Participation Achievements
  LEGENDARY: {
    id: 'LEGENDARY',
    name: 'Legendary',
    description: 'Solved 500+ challenges',
    icon: '🏅',
    category: 'participation'
  },
  UNSTOPPABLE: {
    id: 'UNSTOPPABLE',
    name: 'Unstoppable',
    description: 'Solved 250+ challenges',
    icon: '⚡',
    category: 'participation'
  },
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
  DEDICATED: {
    id: 'DEDICATED',
    name: 'Dedicated',
    description: 'Solved 25+ challenges',
    icon: '💪',
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
  GETTING_STARTED: {
    id: 'GETTING_STARTED',
    name: 'Getting Started',
    description: 'Solved 5+ challenges',
    icon: '🚀',
    category: 'participation'
  },
  FIRST_STEPS: {
    id: 'FIRST_STEPS',
    name: 'First Steps',
    description: 'Solved your first challenge',
    icon: '👶',
    category: 'participation'
  },
  CTF_VETERAN: {
    id: 'CTF_VETERAN',
    name: 'CTF Veteran',
    description: 'Participated in 25+ CTFs',
    icon: '🎖️',
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
  CTF_NEWCOMER: {
    id: 'CTF_NEWCOMER',
    name: 'CTF Newcomer',
    description: 'Participated in 2+ CTFs',
    icon: '🌱',
    category: 'participation'
  },
  SPEED_DEMON: {
    id: 'SPEED_DEMON',
    name: 'Speed Demon',
    description: 'Solved 10+ challenges in under 1 hour',
    icon: '⚡',
    category: 'participation'
  },
  LIGHTNING_FAST: {
    id: 'LIGHTNING_FAST',
    name: 'Lightning Fast',
    description: 'Solved challenge in under 5 minutes',
    icon: '🏃‍♂️',
    category: 'participation'
  },
  CONSISTENT_SOLVER: {
    id: 'CONSISTENT_SOLVER',
    name: 'Consistent Solver',
    description: 'Solved challenges 7 days in a row',
    icon: '📅',
    category: 'participation'
  },
  MARATHON_RUNNER: {
    id: 'MARATHON_RUNNER',
    name: 'Marathon Runner',
    description: 'Solved challenges 30 days in a row',
    icon: '🏃‍♂️',
    category: 'participation'
  },
  WEEKEND_WARRIOR: {
    id: 'WEEKEND_WARRIOR',
    name: 'Weekend Warrior',
    description: 'Most active on weekends',
    icon: '⚔️',
    category: 'participation'
  },
  NIGHT_OWL: {
    id: 'NIGHT_OWL',
    name: 'Night Owl',
    description: 'Solved 50+ challenges after midnight',
    icon: '🦉',
    category: 'participation'
  },
  EARLY_BIRD: {
    id: 'EARLY_BIRD',
    name: 'Early Bird',
    description: 'Solved 50+ challenges before 8 AM',
    icon: '🐦',
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
  WEB_EXPERT: {
    id: 'WEB_EXPERT',
    name: 'Web Expert',
    description: 'Solved 20+ web challenges',
    icon: '🌐',
    category: 'skill'
  },
  CRYPTO_WIZARD: {
    id: 'CRYPTO_WIZARD',
    name: 'Crypto Wizard',
    description: 'Solved 20+ crypto challenges',
    icon: '🔐',
    category: 'skill'
  },
  PWN_MASTER: {
    id: 'PWN_MASTER',
    name: 'Pwn Master',
    description: 'Solved 20+ pwn challenges',
    icon: '💥',
    category: 'skill'
  },
  FORENSICS_DETECTIVE: {
    id: 'FORENSICS_DETECTIVE',
    name: 'Forensics Detective',
    description: 'Solved 20+ forensics challenges',
    icon: '🔍',
    category: 'skill'
  },
  REVERSE_ENGINEER: {
    id: 'REVERSE_ENGINEER',
    name: 'Reverse Engineer',
    description: 'Solved 20+ reverse engineering challenges',
    icon: '🔄',
    category: 'skill'
  },
  MISC_SPECIALIST: {
    id: 'MISC_SPECIALIST',
    name: 'Misc Specialist',
    description: 'Solved 20+ misc challenges',
    icon: '🎲',
    category: 'skill'
  },
  STEGANOGRAPHER: {
    id: 'STEGANOGRAPHER',
    name: 'Steganographer',
    description: 'Solved 20+ steganography challenges',
    icon: '🖼️',
    category: 'skill'
  },
  OSINT_INVESTIGATOR: {
    id: 'OSINT_INVESTIGATOR',
    name: 'OSINT Investigator',
    description: 'Solved 20+ OSINT challenges',
    icon: '🕵️',
    category: 'skill'
  },
  FIRST_BLOOD: {
    id: 'FIRST_BLOOD',
    name: 'First Blood',
    description: 'First to solve a challenge',
    icon: '🩸',
    category: 'skill'
  },
  SERIAL_SOLVER: {
    id: 'SERIAL_SOLVER',
    name: 'Serial Solver',
    description: 'First blood on 5+ challenges',
    icon: '🔪',
    category: 'skill'
  },
  HARD_MODE: {
    id: 'HARD_MODE',
    name: 'Hard Mode',
    description: 'Solved 10+ hard challenges',
    icon: '😤',
    category: 'skill'
  },
  EXPERT_LEVEL: {
    id: 'EXPERT_LEVEL',
    name: 'Expert Level',
    description: 'Solved 5+ expert challenges',
    icon: '🎯',
    category: 'skill'
  },
  PUZZLE_SOLVER: {
    id: 'PUZZLE_SOLVER',
    name: 'Puzzle Solver',
    description: 'Solved unique challenge types',
    icon: '🧩',
    category: 'skill'
  },
  PERFECTIONIST: {
    id: 'PERFECTIONIST',
    name: 'Perfectionist',
    description: '100% solve rate in a CTF',
    icon: '💎',
    category: 'skill'
  },
  MULTI_TALENTED: {
    id: 'MULTI_TALENTED',
    name: 'Multi-Talented',
    description: 'Solved challenges in 5+ categories in one CTF',
    icon: '🌈',
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
  },
  TEAM_PLAYER: {
    id: 'TEAM_PLAYER',
    name: 'Team Player',
    description: 'Participated in 10+ team CTFs',
    icon: '👥',
    category: 'contribution'
  },
  TEAM_SOLVER: {
    id: 'TEAM_SOLVER',
    name: 'Team Solver',
    description: 'Solved challenges with others',
    icon: '👫',
    category: 'contribution'
  },
  MENTOR: {
    id: 'MENTOR',
    name: 'Mentor',
    description: 'Solved 5+ challenges collaboratively with others',
    icon: '🎓',
    category: 'contribution'
  },
  LONG_HAULER: {
    id: 'LONG_HAULER',
    name: 'Long Hauler',
    description: 'Active for 1+ year',
    icon: '📅',
    category: 'contribution'
  },
  VETERAN_MEMBER: {
    id: 'VETERAN_MEMBER',
    name: 'Veteran Member',
    description: 'Active for 2+ years',
    icon: '🏆',
    category: 'contribution'
  },
  COLLABORATIVE: {
    id: 'COLLABORATIVE',
    name: 'Collaborative',
    description: 'Solved 10+ challenges with teammates',
    icon: '🤝',
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

  // Top 50% Global
  {
    id: 'TOP_50_GLOBAL',
    scope: 'global',
    checkGlobal: ({ userRank, totalUsers }) => userRank > Math.ceil(totalUsers * 0.25) && userRank <= Math.ceil(totalUsers * 0.5)
  },

  // Top 50% CTF
  {
    id: 'TOP_50_CTF',
    scope: 'ctf',
    checkCTF: ({ userRank, totalUsers }) => userRank > Math.ceil(totalUsers * 0.25) && userRank <= Math.ceil(totalUsers * 0.5)
  },

  // Rising Star (Note: This would require rank history data, placeholder logic for now)
  {
    id: 'RISING_STAR',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.rankImprovement || 0) >= 50
  },

  // Comeback Kid (Note: This would require rank history data, placeholder logic for now)
  {
    id: 'COMEBACK_KID',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.rankImprovement || 0) >= 100
  },

  // Legendary (500+ solves)
  {
    id: 'LEGENDARY',
    scope: 'global',
    checkGlobal: ({ userProfile }) => userProfile.solveCount >= 500
  },

  // Unstoppable (250+ solves)
  {
    id: 'UNSTOPPABLE',
    scope: 'global',
    checkGlobal: ({ userProfile }) => userProfile.solveCount >= 250 && userProfile.solveCount < 500
  },

  // Century Club (100+ solves)
  {
    id: 'CENTURY_CLUB',
    scope: 'global',
    checkGlobal: ({ userProfile }) => userProfile.solveCount >= 100 && userProfile.solveCount < 250
  },

  // Veteran Solver (50+ solves)
  {
    id: 'VETERAN_SOLVER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => userProfile.solveCount >= 50 && userProfile.solveCount < 100
  },

  // Dedicated (25+ solves)
  {
    id: 'DEDICATED',
    scope: 'global',
    checkGlobal: ({ userProfile }) => userProfile.solveCount >= 25 && userProfile.solveCount < 50
  },

  // Active Solver (20+ solves)
  {
    id: 'ACTIVE_SOLVER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => userProfile.solveCount >= 20 && userProfile.solveCount < 25
  },

  // CTF Solver (10+ solves)
  {
    id: 'CTF_SOLVER',
    scope: 'both',
    checkGlobal: ({ userProfile }) => userProfile.solveCount >= 10 && userProfile.solveCount < 20,
    checkCTF: ({ userProfile }) => userProfile.solveCount >= 10
  },

  // Getting Started (5+ solves)
  {
    id: 'GETTING_STARTED',
    scope: 'global',
    checkGlobal: ({ userProfile }) => userProfile.solveCount >= 5 && userProfile.solveCount < 10
  },

  // First Steps (1+ solve)
  {
    id: 'FIRST_STEPS',
    scope: 'global',
    checkGlobal: ({ userProfile }) => userProfile.solveCount >= 1 && userProfile.solveCount < 5
  },

  // CTF Veteran (25+ CTFs)
  {
    id: 'CTF_VETERAN',
    scope: 'global',
    checkGlobal: ({ userProfile }) => userProfile.ctfCount >= 25
  },

  // CTF Explorer (10+ CTFs)
  {
    id: 'CTF_EXPLORER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => userProfile.ctfCount >= 10 && userProfile.ctfCount < 25
  },

  // Multi-CTF Player (5+ CTFs)
  {
    id: 'MULTI_CTF_PLAYER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => userProfile.ctfCount >= 5 && userProfile.ctfCount < 10
  },

  // CTF Newcomer (2+ CTFs)
  {
    id: 'CTF_NEWCOMER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => userProfile.ctfCount >= 2 && userProfile.ctfCount < 5
  },

  // Speed Demon (Note: Requires solve time data)
  {
    id: 'SPEED_DEMON',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.fastSolves || 0) >= 10
  },

  // Lightning Fast (Note: Requires solve time data)
  {
    id: 'LIGHTNING_FAST',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.ultraFastSolves || 0) >= 1
  },

  // Consistent Solver (Note: Requires streak data)
  {
    id: 'CONSISTENT_SOLVER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.longestStreak || 0) >= 7
  },

  // Marathon Runner (Note: Requires streak data)
  {
    id: 'MARATHON_RUNNER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.longestStreak || 0) >= 30
  },

  // Weekend Warrior (Note: Requires time-based solve data)
  {
    id: 'WEEKEND_WARRIOR',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.weekendSolveRatio || 0) >= 0.6
  },

  // Night Owl (Note: Requires time-based solve data)
  {
    id: 'NIGHT_OWL',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.nightSolves || 0) >= 50
  },

  // Early Bird (Note: Requires time-based solve data)
  {
    id: 'EARLY_BIRD',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.morningSolves || 0) >= 50
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

  // Category-specific expertise achievements
  {
    id: 'WEB_EXPERT',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.categorySolves?.web || 0) >= 20
  },

  {
    id: 'CRYPTO_WIZARD',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.categorySolves?.crypto || 0) >= 20
  },

  {
    id: 'PWN_MASTER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.categorySolves?.pwn || 0) >= 20
  },

  {
    id: 'FORENSICS_DETECTIVE',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.categorySolves?.forensics || 0) >= 20
  },

  {
    id: 'REVERSE_ENGINEER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.categorySolves?.reverse || userProfile.categorySolves?.reversing || 0) >= 20
  },

  {
    id: 'MISC_SPECIALIST',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.categorySolves?.misc || 0) >= 20
  },

  {
    id: 'STEGANOGRAPHER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.categorySolves?.stego || userProfile.categorySolves?.steganography || 0) >= 20
  },

  {
    id: 'OSINT_INVESTIGATOR',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.categorySolves?.osint || 0) >= 20
  },

  // Achievement-based accomplishments
  {
    id: 'FIRST_BLOOD',
    scope: 'both',
    checkGlobal: ({ userProfile }) => (userProfile.firstBloods || 0) >= 1,
    checkCTF: ({ userProfile }) => (userProfile.firstBloods || 0) >= 1
  },

  {
    id: 'SERIAL_SOLVER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.firstBloods || 0) >= 5
  },

  // Difficulty-based achievements
  {
    id: 'HARD_MODE',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.hardSolves || 0) >= 10
  },

  {
    id: 'EXPERT_LEVEL',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.expertSolves || 0) >= 5
  },

  // Special accomplishments
  {
    id: 'PUZZLE_SOLVER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.uniqueChallengeTypes || 0) >= 10
  },

  {
    id: 'PERFECTIONIST',
    scope: 'ctf',
    checkCTF: ({ userProfile, ctfStats }) => userProfile.solveCount === ctfStats.totalChallenges
  },

  {
    id: 'MULTI_TALENTED',
    scope: 'ctf',
    checkCTF: ({ userProfile }) => userProfile.categories.size >= 5
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
  },

  // Team Player (Note: Requires team participation data)
  {
    id: 'TEAM_PLAYER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.teamCTFs || 0) >= 10
  },

  // Team Solver (Note: First collaborative solve)
  {
    id: 'TEAM_SOLVER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.helpedUsers || 0) >= 1
  },

  // Collaborative (Note: Team solves)
  {
    id: 'COLLABORATIVE',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.helpedUsers || 0) >= 10
  },

  // Mentor (Note: Requires collaborative solving)
  {
    id: 'MENTOR',
    scope: 'global',
    checkGlobal: ({ userProfile }) => (userProfile.helpedUsers || 0) >= 5
  },

  // Long Hauler (membership duration data)
  {
    id: 'LONG_HAULER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => {
      const membershipDays = userProfile.membershipDays || 0;
      return membershipDays >= 365; // 1+ year
    }
  },

  // Veteran Member (membership duration data)
  {
    id: 'VETERAN_MEMBER',
    scope: 'global',
    checkGlobal: ({ userProfile }) => {
      const membershipDays = userProfile.membershipDays || 0;
      return membershipDays >= 730; // 2+ years
    }
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
