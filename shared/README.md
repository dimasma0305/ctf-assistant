# Shared Achievement System

This directory contains shared definitions and utilities that are used by both the API and UI to ensure consistency across the application.

## 📋 Achievement System

### Overview

The achievement system provides a centralized way to define, check, and award achievements to users. It ensures consistency between server-side calculation and client-side display.

### Architecture

```
shared/
└── achievements.ts    # Master achievement definitions and criteria
```

### Key Components

#### `Achievement` Interface
```typescript
interface Achievement {
  id: string;           // Unique identifier
  name: string;         // Display name
  description: string;  // Achievement description
  icon: string;         // Emoji or icon
  category: 'ranking' | 'participation' | 'skill' | 'contribution';
}
```

#### `AchievementCriteria` Interface
```typescript
interface AchievementCriteria {
  id: string;           // Matches Achievement.id
  checkGlobal?: (userProfile, userRank, totalUsers, globalStats, allCategories) => boolean;
  checkCTF?: (userProfile, userRank, totalUsers, ctfStats, allCategories, ctfTitle?) => boolean;
  scope: 'global' | 'ctf' | 'both';
}
```

### Achievement Categories

#### 🏆 Ranking Achievements
- **Global/CTF Champions** - #1 worldwide or in specific CTF
- **Podium Finishes** - Top 3 placements  
- **Elite Status** - Top 5%, 10%, 25% rankings

#### 👥 Participation Achievements
- **Century Club** - 100+ challenges solved
- **Veteran/Active Solver** - 50+, 20+ challenges solved
- **CTF Explorer** - 10+ CTF participations
- **Multi-CTF Player** - 5+ CTF participations

#### 🎯 Skill Achievements
- **Polymath** - Master of multiple categories (75%+)
- **Category Master** - Excellence in most categories (75%+)
- **Versatile** - Active across many categories (50%+)

#### 🌟 Contribution Achievements
- **Major Contributor** - 5%+ of global community solves
- **Active Participant** - 10%+ of CTF solves

### Usage

#### Server-Side (API)
```typescript
import { generateAchievements } from '../utils/statistics';

const userAchievements = generateAchievements(
  userProfile,
  userRank, 
  totalUsers,
  globalStats,
  allCategories,
  'global' // or 'ctf'
);
```

#### Client-Side (UI)
```typescript
import { getAchievement, getRankAchievement } from '../../shared/achievements';

// Get specific achievement
const achievement = getAchievement('CENTURY_CLUB');

// Get rank-based achievement with dynamic content
const podiumAchievement = getRankAchievement('global', 2);
```

### Adding New Achievements

1. **Define Achievement**: Add to `ACHIEVEMENTS` object
```typescript
NEW_ACHIEVEMENT: {
  id: 'NEW_ACHIEVEMENT',
  name: 'Achievement Name',
  description: 'Achievement description',
  icon: '🎯',
  category: 'participation'
}
```

2. **Define Criteria**: Add to `ACHIEVEMENT_CRITERIA` array
```typescript
{
  id: 'NEW_ACHIEVEMENT',
  scope: 'global',
  checkGlobal: (userProfile, userRank, totalUsers, globalStats, allCategories) => {
    return userProfile.solveCount >= 500; // Example criteria
  }
}
```

3. **No Client Updates Required**: The system automatically picks up new achievements!

### Benefits

✅ **Consistency** - Single source of truth for all achievements  
✅ **Type Safety** - Full TypeScript support across API and UI  
✅ **Maintainability** - Add achievements in one place  
✅ **Flexibility** - Support for both global and CTF-specific achievements  
✅ **Dynamic Content** - Achievements can have context-specific descriptions  
✅ **Performance** - Server calculates once, client displays efficiently  

### Achievement IDs

All achievements have stable IDs that can be referenced consistently:

- `GLOBAL_CHAMPION` / `CTF_CHAMPION` - First place achievements
- `GLOBAL_PODIUM` / `CTF_PODIUM` - 2nd/3rd place achievements  
- `ELITE_GLOBAL` / `ELITE_CTF` - Top 5% achievements
- `TOP_10_GLOBAL` / `TOP_10_CTF` - Top 10% achievements
- `TOP_25_GLOBAL` / `TOP_25_CTF` - Top 25% achievements
- `CENTURY_CLUB` - 100+ solves
- `VETERAN_SOLVER` - 50+ solves  
- `ACTIVE_SOLVER` - 20+ solves
- `CTF_SOLVER` - 10+ solves in CTF
- `CTF_EXPLORER` - 10+ CTFs
- `MULTI_CTF_PLAYER` - 5+ CTFs
- `POLYMATH` - 75%+ categories (global)
- `CATEGORY_MASTER` - 75%+ categories (CTF)  
- `VERSATILE` - 50%+ categories
- `MAJOR_CONTRIBUTOR` - 5%+ global solves
- `ACTIVE_PARTICIPANT` - 10%+ CTF solves

These IDs enable easy tracking, analytics, and user achievement history across the platform.
