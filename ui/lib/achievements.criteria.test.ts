import { describe, test, expect } from "bun:test";
import { ACHIEVEMENT_CRITERIA_MAP } from "./achievements";

describe("Achievement criteria (category milestones)", () => {
  test("WEB_EXPERT unlocks at 20+ web solves", () => {
    const crit = ACHIEVEMENT_CRITERIA_MAP.get("WEB_EXPERT");
    expect(crit).toBeTruthy();
    expect(
      crit!.checkGlobal?.({
        userProfile: { categorySolves: { web: 20 } },
        userRank: 999,
        totalUsers: 1000,
        globalStats: {},
        allCategories: new Set(["web"]),
      }),
    ).toBe(true);
  });

  test("WEB_EXPERT stays locked below 20", () => {
    const crit = ACHIEVEMENT_CRITERIA_MAP.get("WEB_EXPERT");
    expect(
      crit!.checkGlobal?.({
        userProfile: { categorySolves: { web: 19 } },
        userRank: 999,
        totalUsers: 1000,
        globalStats: {},
        allCategories: new Set(["web"]),
      }),
    ).toBe(false);
  });

  test("REVERSE_ENGINEER unlocks via either reverse or reversing key", () => {
    const crit = ACHIEVEMENT_CRITERIA_MAP.get("REVERSE_ENGINEER");
    expect(crit).toBeTruthy();

    expect(
      crit!.checkGlobal?.({
        userProfile: { categorySolves: { reverse: 20 } },
        userRank: 999,
        totalUsers: 1000,
        globalStats: {},
        allCategories: new Set(["reverse"]),
      }),
    ).toBe(true);

    expect(
      crit!.checkGlobal?.({
        userProfile: { categorySolves: { reversing: 20 } },
        userRank: 999,
        totalUsers: 1000,
        globalStats: {},
        allCategories: new Set(["reverse"]),
      }),
    ).toBe(true);
  });
});

