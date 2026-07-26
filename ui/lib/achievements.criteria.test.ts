import { describe, test, expect } from "bun:test";
import {
  ACHIEVEMENT_CRITERIA_MAP,
  type AchievementUserProfile,
  type GlobalAchievementStats,
} from "./achievements";

const baseUserProfile: AchievementUserProfile = {
  solveCount: 0,
  ctfCount: 0,
  categories: new Set<string>(),
};

const globalStats: GlobalAchievementStats = {
  totalSolves: 0,
};

describe("Achievement criteria (category milestones)", () => {
  test("WEB_EXPERT unlocks at 20+ web solves", () => {
    const crit = ACHIEVEMENT_CRITERIA_MAP.get("WEB_EXPERT");
    expect(crit).toBeTruthy();
    expect(
      crit!.checkGlobal?.({
        userProfile: { ...baseUserProfile, categorySolves: { web: 20 } },
        userRank: 999,
        totalUsers: 1000,
        globalStats,
        allCategories: new Set(["web"]),
      }),
    ).toBe(true);
  });

  test("WEB_EXPERT stays locked below 20", () => {
    const crit = ACHIEVEMENT_CRITERIA_MAP.get("WEB_EXPERT");
    expect(
      crit!.checkGlobal?.({
        userProfile: { ...baseUserProfile, categorySolves: { web: 19 } },
        userRank: 999,
        totalUsers: 1000,
        globalStats,
        allCategories: new Set(["web"]),
      }),
    ).toBe(false);
  });

  test("REVERSE_ENGINEER unlocks via either reverse or reversing key", () => {
    const crit = ACHIEVEMENT_CRITERIA_MAP.get("REVERSE_ENGINEER");
    expect(crit).toBeTruthy();

    expect(
      crit!.checkGlobal?.({
        userProfile: { ...baseUserProfile, categorySolves: { reverse: 20 } },
        userRank: 999,
        totalUsers: 1000,
        globalStats,
        allCategories: new Set(["reverse"]),
      }),
    ).toBe(true);

    expect(
      crit!.checkGlobal?.({
        userProfile: { ...baseUserProfile, categorySolves: { reversing: 20 } },
        userRank: 999,
        totalUsers: 1000,
        globalStats,
        allCategories: new Set(["reverse"]),
      }),
    ).toBe(true);
  });
});
