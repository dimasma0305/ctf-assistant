/**
 * Behavioural tests for the anti-spam moderation rules. Runs in NODB mode so it
 * never touches Mongo. We build minimal fake Discord messages and assert the
 * decision + side effects (kick / timeout / delete / warn).
 *
 * The headline regression: forwarding messages or sharing images must NEVER
 * kick a legitimate user, while a genuine same-text flood still escalates.
 */
process.env.NODB = "true";

import { describe, test, expect, beforeEach } from "bun:test";
import {
  handleSpamDetection,
  handlePhishingDetection,
  handleImageScamDetection,
  evaluateImageFingerprint,
  __resetImageScamState,
} from "./index";

// ── Fakes ─────────────────────────────────────────────────────────────────────
class FakeColl<V> extends Map<string, V> {
  first(): V | undefined {
    return [...this.values()][0];
  }
}

interface Effects {
  kicks: number;
  timeouts: number;
  deletedIds: string[];
  warnings: number;
  dms: number;
  selfDeletes: number;
}

function makeMember(effects: Effects, opts: { kickable?: boolean; moderatable?: boolean; staff?: boolean } = {}) {
  return {
    kickable: opts.kickable ?? true,
    moderatable: opts.moderatable ?? true,
    roles: { cache: new Map<string, unknown>() },
    permissions: { has: () => !!opts.staff },
    async kick() {
      effects.kicks++;
    },
    async timeout() {
      effects.timeouts++;
    },
  };
}

interface MsgOpts {
  userId?: string;
  channelId?: string;
  content?: string;
  isForward?: boolean;
  snapshotContent?: string;
  attachments?: { name: string; size: number }[];
  stickers?: string[];
  embeds?: { url?: string; title?: string }[];
  everyone?: boolean;
  ownerId?: string;
  member?: ReturnType<typeof makeMember> | null;
  effects: Effects;
}

let msgSeq = 0;

function makeMessage(o: MsgOpts): any {
  const effects = o.effects;
  const userId = o.userId ?? "u1";
  const channelId = o.channelId ?? "c1";
  const id = `m${++msgSeq}`;

  const attachments = new FakeColl<any>();
  (o.attachments ?? []).forEach((a, i) => attachments.set(`att${i}`, { id: `att${i}`, ...a }));

  const stickers = new FakeColl<any>();
  (o.stickers ?? []).forEach((s) => stickers.set(s, { id: s }));

  const messageSnapshots = new FakeColl<any>();
  if (o.isForward) {
    messageSnapshots.set("snap0", {
      content: o.snapshotContent ?? "",
      attachments: new FakeColl<any>(),
      embeds: [],
      stickers: new FakeColl<any>(),
    });
  }

  const channel: any = {
    id: channelId,
    isThread: () => false,
    async send() {
      effects.warnings++;
      return {
        async delete() {
          effects.selfDeletes++;
        },
      };
    },
    messages: {
      async fetch() {
        return {
          async delete() {
            /* single-message delete */
          },
        };
      },
    },
    async bulkDelete(ids: string[]) {
      effects.deletedIds.push(...ids);
    },
  };

  return {
    id,
    channel,
    channelId,
    content: o.content ?? "",
    reference: o.isForward ? { type: 1 /* MessageReferenceType.Forward */ } : null,
    messageSnapshots,
    attachments,
    embeds: o.embeds ?? [],
    stickers,
    mentions: { everyone: !!o.everyone },
    author: {
      id: userId,
      bot: false,
      async send() {
        effects.dms++;
      },
    },
    guild: {
      ownerId: o.ownerId ?? "owner-id",
      channels: { async fetch() { return null; } },
    },
    member: o.member === undefined ? makeMember(effects) : o.member,
    async delete() {
      effects.deletedIds.push(id);
    },
  };
}

function freshEffects(): Effects {
  return { kicks: 0, timeouts: 0, deletedIds: [], warnings: 0, dms: 0, selfDeletes: 0 };
}

// Unique user id per test so module-level state never bleeds across tests.
let userCounter = 0;
function nextUser() {
  return `user-${++userCounter}`;
}

// ── False positives that must NEVER be punished ───────────────────────────────
describe("legitimate users are never auto-kicked", () => {
  test("forwarding 3 different messages (the real incident) → no action", async () => {
    const fx = freshEffects();
    const u = nextUser();
    const results: boolean[] = [];
    for (const text of ["alpha writeup", "beta exploit", "gamma payload"]) {
      results.push(
        await handleSpamDetection(makeMessage({ userId: u, isForward: true, snapshotContent: text, effects: fx })),
      );
    }
    expect(results).toEqual([false, false, false]);
    expect(fx).toMatchObject({ kicks: 0, timeouts: 0, warnings: 0 });
    expect(fx.deletedIds).toEqual([]);
  });

  test("posting 3 different image-only messages → no action", async () => {
    const fx = freshEffects();
    const u = nextUser();
    const res: boolean[] = [];
    for (const name of ["a.png", "b.png", "c.png"]) {
      res.push(await handleSpamDetection(makeMessage({ userId: u, attachments: [{ name, size: 100 }], effects: fx })));
    }
    expect(res).toEqual([false, false, false]);
    expect(fx.kicks + fx.timeouts + fx.deletedIds.length).toBe(0);
  });

  test("same sticker 3× → no action (below payload threshold, never kicked)", async () => {
    const fx = freshEffects();
    const u = nextUser();
    const res: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      res.push(await handleSpamDetection(makeMessage({ userId: u, stickers: ["sticker-1"], effects: fx })));
    }
    expect(res).toEqual([false, false, false]);
    expect(fx.kicks + fx.timeouts).toBe(0);
  });

  test("common ack 'gg' repeated 3× → not even counted", async () => {
    const fx = freshEffects();
    const u = nextUser();
    const res: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      res.push(await handleSpamDetection(makeMessage({ userId: u, content: "gg", effects: fx })));
    }
    expect(res).toEqual([false, false, false]);
    expect(fx.kicks + fx.timeouts + fx.warnings).toBe(0);
  });

  test("short non-ack text needs 6, so 3× → no action", async () => {
    const fx = freshEffects();
    const u = nextUser();
    const res: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      res.push(await handleSpamDetection(makeMessage({ userId: u, content: "hmm", effects: fx })));
    }
    expect(res).toEqual([false, false, false]);
  });

  test("guild owner repeating meaningful text → exempt", async () => {
    const fx = freshEffects();
    const u = "owner-id"; // matches makeMessage default ownerId
    const res: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      res.push(
        await handleSpamDetection(
          makeMessage({ userId: u, ownerId: "owner-id", content: "buy cheap gold now visit my shop", effects: fx }),
        ),
      );
    }
    expect(res.every((r) => r === false)).toBe(true);
    expect(fx.kicks + fx.timeouts + fx.deletedIds.length).toBe(0);
  });

  test("staff member (ManageMessages) repeating text → exempt", async () => {
    const fx = freshEffects();
    const u = nextUser();
    const member = makeMember(fx, { staff: true });
    const res: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      res.push(
        await handleSpamDetection(
          makeMessage({ userId: u, content: "the same announcement text here", member, effects: fx }),
        ),
      );
    }
    expect(res.every((r) => r === false)).toBe(true);
    expect(fx.kicks).toBe(0);
  });
});

// ── Real spam that MUST still be caught ───────────────────────────────────────
describe("genuine spam is still caught", () => {
  test("identical meaningful text 3× → handled, deleted, warned (no kick on first strike)", async () => {
    const fx = freshEffects();
    const u = nextUser();
    const res: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      res.push(
        await handleSpamDetection(
          makeMessage({ userId: u, content: "JOIN MY SERVER discord.gg/abc free nitro", effects: fx }),
        ),
      );
    }
    expect(res).toEqual([false, false, true]);
    expect(fx.kicks).toBe(0);
    expect(fx.timeouts).toBe(0);
    expect(fx.warnings).toBe(1);
    expect(fx.deletedIds.length).toBe(3);
  });

  test("zero-width / case / digit-suffix variants normalize to one signature → caught", async () => {
    const fx = freshEffects();
    const u = nextUser();
    const variants = [
      "BUY CHEAP GOLD visit shop",
      "buy  cheap gold visit shop​",
      "BUY CHEAP GOLD visit shop 2",
    ];
    const res: boolean[] = [];
    for (const v of variants) {
      res.push(await handleSpamDetection(makeMessage({ userId: u, content: v, effects: fx })));
    }
    expect(res).toEqual([false, false, true]);
  });

  test("identical forwarded ad 4× → caught via payload signature", async () => {
    const fx = freshEffects();
    const u = nextUser();
    const res: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      res.push(
        await handleSpamDetection(
          makeMessage({ userId: u, isForward: true, snapshotContent: "FREE NITRO CLICK HERE", effects: fx }),
        ),
      );
    }
    expect(res).toEqual([false, false, false, true]);
    expect(fx.warnings).toBe(1);
  });

  test("cross-channel fan-out of same text across 4 channels → caught", async () => {
    const fx = freshEffects();
    const u = nextUser();
    const res: boolean[] = [];
    for (let i = 1; i <= 4; i++) {
      res.push(
        await handleSpamDetection(
          makeMessage({ userId: u, channelId: `chan-${i}`, content: "same raid message everywhere", effects: fx }),
        ),
      );
    }
    expect(res).toEqual([false, false, false, true]);
  });

  test("escalation ladder: warn → timeout → kick across repeated bursts", async () => {
    const fx = freshEffects();
    const u = nextUser();
    const member = makeMember(fx, { kickable: true, moderatable: true });
    const burst = async () => {
      let handled = false;
      for (let i = 0; i < 3; i++) {
        handled = await handleSpamDetection(
          makeMessage({ userId: u, content: "spammy advertisement message text", member, effects: fx }),
        );
      }
      return handled;
    };
    expect(await burst()).toBe(true); // strike 1 → warn
    expect(fx.warnings).toBe(1);
    expect(fx.timeouts).toBe(0);
    expect(fx.kicks).toBe(0);

    expect(await burst()).toBe(true); // strike 2 → timeout
    expect(fx.timeouts).toBe(1);
    expect(fx.kicks).toBe(0);

    expect(await burst()).toBe(true); // strike 3 → kick
    expect(fx.kicks).toBe(1);
  });

  test("un-kickable member: messages deleted but never kicked/timed-out errors", async () => {
    const fx = freshEffects();
    const u = nextUser();
    const member = makeMember(fx, { kickable: false, moderatable: false });
    const burst = async () => {
      let handled = false;
      for (let i = 0; i < 3; i++) {
        handled = await handleSpamDetection(
          makeMessage({ userId: u, content: "another spammy advertisement text", member, effects: fx }),
        );
      }
      return handled;
    };
    await burst();
    await burst();
    await burst();
    expect(fx.kicks).toBe(0); // bot can't kick → never attempted destructively
    expect(fx.timeouts).toBe(0);
    expect(fx.deletedIds.length).toBeGreaterThan(0); // dupes still removed
  });
});

// ── Phishing ──────────────────────────────────────────────────────────────────
describe("phishing detection requires link + strong signal", () => {
  test("bare discord invite with generic words → not phishing", async () => {
    const fx = freshEffects();
    const handled = await handlePhishingDetection(
      makeMessage({ userId: nextUser(), content: "join my CTF team discord.gg/myteam", effects: fx }),
    );
    expect(handled).toBe(false);
    expect(fx.deletedIds.length).toBe(0);
  });

  test("text-only mention of a scam (no link) → not phishing", async () => {
    const fx = freshEffects();
    const handled = await handlePhishingDetection(
      makeMessage({ userId: nextUser(), content: 'got a fake "50$ gift - claim now" email, classic phishing', effects: fx }),
    );
    expect(handled).toBe(false);
  });

  test("free nitro + @everyone + invite → handled and removed", async () => {
    const fx = freshEffects();
    const handled = await handlePhishingDetection(
      makeMessage({ userId: nextUser(), content: "Free Nitro @everyone claim now discord.gg/scam", everyone: true, effects: fx }),
    );
    expect(handled).toBe(true);
    expect(fx.deletedIds.length).toBeGreaterThan(0);
    expect(fx.kicks).toBe(1); // massMention + lure + kickable → kick
  });

  // ── Image-only scam (the regression): a scam that posts ONLY an image ──────
  test("image-only @everyone, NOTHING readable (link only in pixels) → removed + timed out, NOT kicked", async () => {
    // We have no vision; an @everyone + bare image could be an innocent event
    // screenshot. Action it (delete + recoverable timeout) but never kick.
    const fx = freshEffects();
    const handled = await handlePhishingDetection(
      makeMessage({
        userId: nextUser(),
        content: "",
        attachments: [{ name: "nitro.png", size: 48213 }],
        everyone: true,
        effects: fx,
      }),
    );
    expect(handled).toBe(true);
    expect(fx.deletedIds.length).toBeGreaterThan(0);
    expect(fx.kicks).toBe(0); // ambiguous → no kick
    expect(fx.timeouts).toBe(1);
  });

  test("image + readable lure caption + @everyone → kicked (clear scam)", async () => {
    const fx = freshEffects();
    const handled = await handlePhishingDetection(
      makeMessage({
        userId: nextUser(),
        content: "free nitro @everyone claim now 🎁",
        attachments: [{ name: "nitro.png", size: 48213 }],
        everyone: true,
        effects: fx,
      }),
    );
    expect(handled).toBe(true);
    expect(fx.kicks).toBe(1); // massMention + readable lure → kick
  });

  test("image with a lure caption but no mass-mention → removed + timed out (not kicked)", async () => {
    const fx = freshEffects();
    const handled = await handlePhishingDetection(
      makeMessage({
        userId: nextUser(),
        content: "claim your free nitro here 🎁",
        attachments: [{ name: "promo.jpg", size: 12000 }],
        effects: fx,
      }),
    );
    expect(handled).toBe(true);
    expect(fx.deletedIds.length).toBeGreaterThan(0);
    expect(fx.kicks).toBe(0); // no mass-mention → soft action only
    expect(fx.timeouts).toBe(1);
  });

  test("scam link hidden in an embed + @everyone (no message text) → kicked", async () => {
    const fx = freshEffects();
    const handled = await handlePhishingDetection(
      makeMessage({
        userId: nextUser(),
        content: "",
        embeds: [{ url: "https://free-nitro-claim.example", title: "Free Nitro gift" }],
        everyone: true,
        effects: fx,
      }),
    );
    expect(handled).toBe(true);
    expect(fx.kicks).toBe(1);
  });

  test("ordinary image share (no mention, no lure) → NEVER touched", async () => {
    const fx = freshEffects();
    const handled = await handlePhishingDetection(
      makeMessage({
        userId: nextUser(),
        content: "here's my heap layout screenshot",
        attachments: [{ name: "heap.png", size: 90000 }],
        effects: fx,
      }),
    );
    expect(handled).toBe(false);
    expect(fx.deletedIds.length).toBe(0);
    expect(fx.kicks + fx.timeouts).toBe(0);
  });

  test("silent image, zero text / mention / lure → NEVER touched (no vision, no signal)", async () => {
    const fx = freshEffects();
    const handled = await handlePhishingDetection(
      makeMessage({ userId: nextUser(), content: "", attachments: [{ name: "pic.png", size: 5000 }], effects: fx }),
    );
    expect(handled).toBe(false);
    expect(fx.kicks + fx.timeouts + fx.deletedIds.length).toBe(0);
  });
});

// ── Innocent people must NEVER be kicked by the image/phishing path ───────────
describe("phishing path never kicks innocent people", () => {
  test("innocent event ping: '@everyone CTF starts now!' + screenshot, no lure/link → NOT kicked", async () => {
    // Has mention + media but nothing readable says scam → recoverable timeout
    // at worst, but crucially never a kick.
    const fx = freshEffects();
    const handled = await handlePhishingDetection(
      makeMessage({
        userId: nextUser(),
        content: "@everyone CTF starts now, good luck!",
        attachments: [{ name: "scoreboard.png", size: 80000 }],
        everyone: true,
        effects: fx,
      }),
    );
    expect(fx.kicks).toBe(0);
    expect(handled).toBe(true); // still soft-actioned, but no kick
  });

  test("guild owner: image + @everyone + literal 'free nitro' lure → exempt, NOT kicked", async () => {
    const fx = freshEffects();
    const handled = await handlePhishingDetection(
      makeMessage({
        userId: "owner-id",
        ownerId: "owner-id",
        content: "free nitro @everyone discord.gg/x",
        attachments: [{ name: "promo.png", size: 9000 }],
        everyone: true,
        effects: fx,
      }),
    );
    expect(handled).toBe(false);
    expect(fx.kicks + fx.timeouts + fx.deletedIds.length).toBe(0);
  });

  test("staff (ManageMessages): image + @everyone + lure → exempt, NOT kicked", async () => {
    const fx = freshEffects();
    const member = makeMember(fx, { staff: true });
    const handled = await handlePhishingDetection(
      makeMessage({
        userId: nextUser(),
        content: "free nitro @everyone claim now discord.gg/x",
        attachments: [{ name: "promo.png", size: 9000 }],
        everyone: true,
        member,
        effects: fx,
      }),
    );
    expect(handled).toBe(false);
    expect(fx.kicks).toBe(0);
  });

  test("repeat scammer WITHOUT @everyone escalates: 1st post → timeout, 2nd → KICK", async () => {
    // The production failure: a scammer kept posting scam links, got timed out
    // each time, came back, and was never kicked because the phishing path had
    // no memory. Now repeats climb to a kick.
    const fx = freshEffects();
    const u = nextUser();
    const member = makeMember(fx, { kickable: true, moderatable: true });
    const post = () =>
      handlePhishingDetection(
        makeMessage({ userId: u, content: "claim your free nitro here https://nitro-free.example", member, effects: fx }),
      );

    expect(await post()).toBe(true); // strike 1 → timeout, no kick
    expect(fx.timeouts).toBe(1);
    expect(fx.kicks).toBe(0);

    expect(await post()).toBe(true); // strike 2 (within decay) → kick
    expect(fx.kicks).toBe(1);
  });

  test("a SINGLE borderline scam post → timeout only, never kicked (recoverable)", async () => {
    const fx = freshEffects();
    const member = makeMember(fx, { kickable: true, moderatable: true });
    const handled = await handlePhishingDetection(
      makeMessage({ userId: nextUser(), content: "free nitro, claim now https://x.example", member, effects: fx }),
    );
    expect(handled).toBe(true);
    expect(fx.kicks).toBe(0);
    expect(fx.timeouts).toBe(1);
  });

  test("un-kickable member: image + @everyone + lure → message removed but NEVER kicked", async () => {
    const fx = freshEffects();
    const member = makeMember(fx, { kickable: false, moderatable: false });
    const handled = await handlePhishingDetection(
      makeMessage({
        userId: nextUser(),
        content: "free nitro @everyone claim now discord.gg/x",
        attachments: [{ name: "promo.png", size: 9000 }],
        everyone: true,
        member,
        effects: fx,
      }),
    );
    expect(handled).toBe(true);
    expect(fx.kicks).toBe(0); // bot can't kick → never attempted
    expect(fx.deletedIds.length).toBeGreaterThan(0); // scam still removed
  });
});

// ── Perceptual image-scam detection (the otnieltym ring) ──────────────────────
// Correlation rules tested with synthetic 64-bit hashes; the dHash↔real-image
// behaviour is validated separately in scripts/verify-dhash-ts.ts (ring copies
// land 0-5 bits apart, nearest legit writeup ~22).
describe("perceptual image-scam: correlation rules", () => {
  beforeEach(() => __resetImageScamState());

  const H = 0n; // base fingerprint
  const NEAR = 0b111n; // 3 bits away from H → within the ≤10 match threshold
  const FAR = (1n << 63n) | (1n << 40n) | (1n << 20n) | 0xffffn; // many bits away

  test("same image from 2 distinct accounts → ring confirmed on the 2nd", () => {
    const t = 1_000_000;
    expect(evaluateImageFingerprint("A", "c1", "m1", H, t).confirmed).toBe(false);
    const d = evaluateImageFingerprint("B", "c2", "m2", H, t + 500);
    expect(d.confirmed).toBe(true);
    expect(d.reason).toContain("2 accounts");
    expect(d.matched.length).toBe(2); // both posters' messages targeted for deletion
  });

  test("re-encoded copy (≤10 bits apart) still counts as the same image → ring", () => {
    const t = 2_000_000;
    expect(evaluateImageFingerprint("A", "c1", "m1", H, t).confirmed).toBe(false);
    // Different account posts a perceptually-near (not identical) hash.
    expect(evaluateImageFingerprint("B", "c2", "m2", NEAR, t + 1000).confirmed).toBe(true);
  });

  test("one account fanning the same image across 3 channels in seconds → confirmed", () => {
    const t = 3_000_000;
    expect(evaluateImageFingerprint("A", "c1", "m1", H, t).confirmed).toBe(false);
    expect(evaluateImageFingerprint("A", "c2", "m2", H, t + 1000).confirmed).toBe(false);
    const d = evaluateImageFingerprint("A", "c3", "m3", H, t + 2000);
    expect(d.confirmed).toBe(true);
    expect(d.reason).toContain("3 channels");
  });

  test("two DIFFERENT images from two accounts → NOT confirmed (no false ring)", () => {
    const t = 4_000_000;
    expect(evaluateImageFingerprint("A", "c1", "m1", H, t).confirmed).toBe(false);
    expect(evaluateImageFingerprint("B", "c2", "m2", FAR, t + 500).confirmed).toBe(false);
  });

  test("one account, same image to only 2 channels → NOT confirmed (below fanout)", () => {
    const t = 5_000_000;
    expect(evaluateImageFingerprint("A", "c1", "m1", H, t).confirmed).toBe(false);
    expect(evaluateImageFingerprint("A", "c2", "m2", H, t + 1000).confirmed).toBe(false);
  });

  test("once learned, the same image from a brand-new account is flagged as known", () => {
    const t = 6_000_000;
    evaluateImageFingerprint("A", "c1", "m1", H, t); // single account → not yet
    evaluateImageFingerprint("B", "c2", "m2", H, t + 1); // ring → H added to known-scam set
    const d = evaluateImageFingerprint("C", "c9", "m9", H, t + 10_000);
    expect(d.confirmed).toBe(true);
    expect(d.reason).toContain("known");
  });
});

describe("perceptual image-scam: enforcement", () => {
  beforeEach(() => __resetImageScamState());

  test("ring of 2 accounts posting the same image → 2nd account is kicked + removed", async () => {
    const fx = freshEffects();
    const memberA = makeMember(fx, { kickable: true, moderatable: true });
    const memberB = makeMember(fx, { kickable: true, moderatable: true });

    const a = await handleImageScamDetection(
      makeMessage({ userId: "ringA", channelId: "c1", attachments: [{ name: "s.png", size: 100 }], member: memberA, effects: fx }),
      { hashesForTest: [0n] },
    );
    expect(a).toBe(false); // single account so far → no action
    expect(fx.kicks).toBe(0);

    const b = await handleImageScamDetection(
      makeMessage({ userId: "ringB", channelId: "c2", attachments: [{ name: "s.png", size: 100 }], member: memberB, effects: fx }),
      { hashesForTest: [0n] },
    );
    expect(b).toBe(true); // ring confirmed → handled
    expect(fx.kicks).toBe(1);
  });

  test("plain image post that matches nothing → never touched", async () => {
    const fx = freshEffects();
    const handled = await handleImageScamDetection(
      makeMessage({ userId: nextUser(), attachments: [{ name: "screenshot.png", size: 5000 }], effects: fx }),
      { hashesForTest: [12345n] },
    );
    expect(handled).toBe(false);
    expect(fx.kicks + fx.timeouts + fx.deletedIds.length).toBe(0);
  });

  test("exempt staff posting a matching image → never actioned", async () => {
    const fx = freshEffects();
    const staff = makeMember(fx, { staff: true });
    // Two staff posts of the same image must not trip the ring (exempt short-circuits).
    await handleImageScamDetection(
      makeMessage({ userId: "staff1", channelId: "c1", attachments: [{ name: "s.png", size: 1 }], member: staff, effects: fx }),
      { hashesForTest: [7n] },
    );
    const handled = await handleImageScamDetection(
      makeMessage({ userId: "staff2", channelId: "c2", attachments: [{ name: "s.png", size: 1 }], member: makeMember(fx, { staff: true }), effects: fx }),
      { hashesForTest: [7n] },
    );
    expect(handled).toBe(false);
    expect(fx.kicks).toBe(0);
  });
});
