import { describe, it, expect } from "bun:test";
import {
    MS,
    DEFAULT_REMINDER_CONFIG as CFG,
    publicKey,
    privateKey,
    decidePublicMilestone,
    decidePrivateMilestones,
    isChannelOverflowing,
    shouldActivityRemind,
    isUpcomingWithinHorizon,
    type ReminderConfig,
} from "./eventReminders";

const START = 1_000_000_000_000; // arbitrary fixed epoch-ms
const set = (...keys: string[]) => new Set(keys);
const K24 = publicKey(24 * MS.hour);
const K3 = publicKey(3 * MS.hour);
const K1 = publicKey(1 * MS.hour);

describe("decidePublicMilestone", () => {
    it("fires nothing before the first milestone (T-25h)", () => {
        const d = decidePublicMilestone(START - 25 * MS.hour, START, set(), CFG);
        expect(d.fireKey).toBeNull();
        expect(d.skipKeys).toEqual([]);
    });

    it("fires T-24h exactly at the threshold", () => {
        const d = decidePublicMilestone(START - 24 * MS.hour, START, set(), CFG);
        expect(d.fireKey).toBe(K24);
        expect(d.skipKeys).toEqual([]);
    });

    it("at T-2h fires the most-recently-crossed (T-3h) and skips T-24h (anti-burst on cold start)", () => {
        const d = decidePublicMilestone(START - 2 * MS.hour, START, set(), CFG);
        expect(d.fireKey).toBe(K3);
        expect(d.skipKeys).toEqual([K24]);
    });

    it("at T-2h with T-24h already fired, fires T-3h and skips nothing", () => {
        const d = decidePublicMilestone(START - 2 * MS.hour, START, set(K24), CFG);
        expect(d.fireKey).toBe(K3);
        expect(d.skipKeys).toEqual([]);
    });

    it("at T-30m with T-24h+T-3h done, fires the final T-1h", () => {
        const d = decidePublicMilestone(START - 30 * MS.minute, START, set(K24, K3), CFG);
        expect(d.fireKey).toBe(K1);
        expect(d.skipKeys).toEqual([]);
    });

    it("fires nothing once all milestones fired", () => {
        const d = decidePublicMilestone(START - 10 * MS.minute, START, set(K24, K3, K1), CFG);
        expect(d.fireKey).toBeNull();
    });

    it("fires nothing at or after start (event in progress)", () => {
        expect(decidePublicMilestone(START, START, set(), CFG).fireKey).toBeNull();
        expect(decidePublicMilestone(START + MS.hour, START, set(), CFG).fireKey).toBeNull();
    });

    it("restart that crossed all three at once posts only T-1h, skips the older two", () => {
        const d = decidePublicMilestone(START - 20 * MS.minute, START, set(), CFG);
        expect(d.fireKey).toBe(K1);
        expect(d.skipKeys.sort()).toEqual([K24, K3].sort());
    });
});

describe("decidePrivateMilestones", () => {
    const END = START + 48 * MS.hour;
    const P0 = privateKey(0);

    it("nothing before start", () => {
        expect(decidePrivateMilestones(START - MS.minute, START, END, set(), CFG)).toEqual([]);
    });
    it("fires at exactly start", () => {
        expect(decidePrivateMilestones(START, START, END, set(), CFG)).toEqual([P0]);
    });
    it("still fires within the grace window (T+1h)", () => {
        expect(decidePrivateMilestones(START + MS.hour, START, END, set(), CFG)).toEqual([P0]);
    });
    it("skipped once past grace (T+3h, grace 2h)", () => {
        expect(decidePrivateMilestones(START + 3 * MS.hour, START, END, set(), CFG)).toEqual([]);
    });
    it("not re-fired once fired", () => {
        expect(decidePrivateMilestones(START, START, END, set(P0), CFG)).toEqual([]);
    });
    it("never fires after the event ended", () => {
        expect(decidePrivateMilestones(END + MS.minute, START, END, set(), CFG)).toEqual([]);
    });
    it("supports a T-1h private nudge when configured", () => {
        const cfg: ReminderConfig = { ...CFG, privateOffsetsMs: [MS.hour, 0] };
        const atMinus1h = decidePrivateMilestones(START - MS.hour, START, END, set(), cfg);
        expect(atMinus1h).toEqual([privateKey(MS.hour)]);
    });
});

describe("isChannelOverflowing", () => {
    it("true at exactly the threshold", () => {
        expect(isChannelOverflowing(CFG.overflowThreshold, CFG)).toBe(true);
    });
    it("true above the threshold", () => {
        expect(isChannelOverflowing(CFG.overflowThreshold + 10, CFG)).toBe(true);
    });
    it("false one under the threshold", () => {
        expect(isChannelOverflowing(CFG.overflowThreshold - 1, CFG)).toBe(false);
    });
    it("false at zero", () => {
        expect(isChannelOverflowing(0, CFG)).toBe(false);
    });
});

describe("shouldActivityRemind", () => {
    it("fires when overflowing + upcoming + never reminded", () => {
        expect(shouldActivityRemind(START, null, true, true, CFG)).toBe(true);
    });
    it("suppressed within the cooldown of the last public reminder", () => {
        expect(shouldActivityRemind(START, START - MS.hour, true, true, CFG)).toBe(false);
    });
    it("fires once past the cooldown", () => {
        expect(shouldActivityRemind(START, START - 4 * MS.hour, true, true, CFG)).toBe(true);
    });
    it("does not fire when not overflowing", () => {
        expect(shouldActivityRemind(START, null, false, true, CFG)).toBe(false);
    });
    it("does not fire when no event is upcoming", () => {
        expect(shouldActivityRemind(START, null, true, false, CFG)).toBe(false);
    });
});

describe("isUpcomingWithinHorizon", () => {
    it("true inside the horizon", () => {
        expect(isUpcomingWithinHorizon(START, START + 12 * MS.hour, CFG)).toBe(true);
    });
    it("false once started", () => {
        expect(isUpcomingWithinHorizon(START, START - MS.minute, CFG)).toBe(false);
    });
    it("false beyond the horizon", () => {
        expect(isUpcomingWithinHorizon(START, START + 72 * MS.hour, CFG)).toBe(false);
    });
});
