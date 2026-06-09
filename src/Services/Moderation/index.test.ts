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
  bans: number;
  unbans: number;
}

function makeMember(
  effects: Effects,
  opts: { kickable?: boolean; moderatable?: boolean; staff?: boolean; bannable?: boolean; banThrows?: boolean } = {},
) {
  return {
    kickable: opts.kickable ?? true,
    moderatable: opts.moderatable ?? true,
    bannable: opts.bannable ?? false,
    roles: { cache: new Map<string, unknown>() },
    permissions: { has: () => !!opts.staff },
    async kick() {
      effects.kicks++;
    },
    async timeout() {
      effects.timeouts++;
    },
    async ban() {
      if (opts.banThrows) throw new Error("Missing Permissions");
      effects.bans++;
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
      members: {
        async unban() {
          effects.unbans++;
        },
      },
    },
    member: o.member === undefined ? makeMember(effects) : o.member,
    async delete() {
      effects.deletedIds.push(id);
    },
  };
}

function freshEffects(): Effects {
  return { kicks: 0, timeouts: 0, deletedIds: [], warnings: 0, dms: 0, selfDeletes: 0, bans: 0, unbans: 0 };
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
  test("image-only @everyone, NOTHING readable (link only in pixels) → removed + WARNED (first strike), NOT timed out or kicked", async () => {
    // We have no vision; an @everyone + bare image could be an innocent event
    // screenshot. Remove it and warn — first strike is recoverable; only a
    // repeat climbs to timeout then kick.
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
    expect(fx.kicks + fx.timeouts).toBe(0); // first strike → warn only
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

  test("image with a lure caption but no mass-mention → removed + WARNED first (not timed out or kicked)", async () => {
    // Lure wording overlaps legit CTF phrasing ("claim your flag"), so the first
    // hit is only a recoverable warn.
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
    expect(fx.kicks + fx.timeouts).toBe(0); // no mass-mention → first strike warn only
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

  test("repeat scammer WITHOUT @everyone escalates: warn → timeout → KICK", async () => {
    // The production failure: a scammer kept posting scam links and was never
    // kicked because the phishing path had no memory. Now repeats climb — but
    // the FIRST hit is a recoverable warn (audit fix: lure+link overlaps legit
    // CTF wording, so don't timeout an innocent on a single message).
    const fx = freshEffects();
    const u = nextUser();
    const member = makeMember(fx, { kickable: true, moderatable: true });
    const post = () =>
      handlePhishingDetection(
        makeMessage({ userId: u, content: "claim your free nitro here https://nitro-free.example", member, effects: fx }),
      );

    expect(await post()).toBe(true); // strike 1 → warn only
    expect(fx.timeouts + fx.kicks).toBe(0);

    expect(await post()).toBe(true); // strike 2 → timeout
    expect(fx.timeouts).toBe(1);
    expect(fx.kicks).toBe(0);

    expect(await post()).toBe(true); // strike 3 → kick
    expect(fx.kicks).toBe(1);
  });

  test("a SINGLE borderline scam post → WARN only, never timed out or kicked (recoverable)", async () => {
    const fx = freshEffects();
    const member = makeMember(fx, { kickable: true, moderatable: true });
    const handled = await handlePhishingDetection(
      makeMessage({ userId: nextUser(), content: "free nitro, claim now https://x.example", member, effects: fx }),
    );
    expect(handled).toBe(true);
    expect(fx.kicks + fx.timeouts).toBe(0); // first strike → warn only
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

// ── Strikes are namespaced per detector lane (2026-06-09 audit fix #9): three
// unrelated borderline events must not sum into a kick. ──────────────────────
describe("strike lanes don't combine across detectors", () => {
  beforeEach(() => __resetImageScamState());

  test("an image warn + a phishing warn on the same user do NOT escalate to a kick", async () => {
    const fx = freshEffects();
    const u = nextUser();
    const member = makeMember(fx, { kickable: true, moderatable: true, bannable: true });

    // Image lane: a single 2-channel multi-image flood → strike 1 (warn).
    const fat = [
      { name: "1.png", size: 9 },
      { name: "2.png", size: 9 },
      { name: "3.png", size: 9 },
    ];
    const t0 = 300_000_000;
    await handleImageScamDetection(makeMessage({ userId: u, channelId: "x1", attachments: fat, member, effects: fx }), { hashesForTest: [7n], nowForTest: t0 });
    await handleImageScamDetection(makeMessage({ userId: u, channelId: "x2", attachments: fat, member, effects: fx }), { hashesForTest: [7n], nowForTest: t0 + 1000 });

    // Phishing lane: one borderline lure+link → strike 1 (warn).
    await handlePhishingDetection(
      makeMessage({ userId: u, content: "claim your free nitro https://x.example", member, effects: fx }),
    );

    // Two different lanes, one strike each → NEVER a timeout or kick.
    expect(fx.kicks + fx.bans + fx.timeouts).toBe(0);
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

  test("same image from 2 distinct accounts → ESCALATE (graduated), never instant-confirmed", () => {
    // 2026-06-09 audit fix: a bare 2-account match is AMBIGUOUS (two strangers
    // reposting a meme look identical), so it must NOT instant-softban. It
    // escalates (delete copies + strike ladder) instead.
    const t = 1_000_000;
    expect(evaluateImageFingerprint("A", "c1", "m1", H, t).confirmed).toBe(false);
    const d = evaluateImageFingerprint("B", "c2", "m2", H, t + 500);
    expect(d.confirmed).toBe(false); // NOT instant removal
    expect(d.escalate).toBe(true); // graduated
    expect(d.reason).toContain("2 accounts");
    expect(d.matched.length).toBe(2); // both posters' messages targeted for deletion
  });

  test("re-encoded copy (≤10 bits apart) still counts as the same image → escalate", () => {
    const t = 2_000_000;
    expect(evaluateImageFingerprint("A", "c1", "m1", H, t).confirmed).toBe(false);
    // Different account posts a perceptually-near (not identical) hash.
    const d = evaluateImageFingerprint("B", "c2", "m2", NEAR, t + 1000);
    expect(d.confirmed).toBe(false);
    expect(d.escalate).toBe(true);
  });

  test("a bare 2-account ring is NOT learned into the known set (no poisoning)", () => {
    // Critical anti-poisoning property: a meme two strangers reposted must not
    // become a permanent instant-removal tripwire for everyone after.
    const t = 2_500_000;
    evaluateImageFingerprint("A", "c1", "m1", H, t);
    evaluateImageFingerprint("B", "c2", "m2", H, t + 500); // ring → escalate, NOT learned
    // A much later, lone poster of the same image is NOT auto-confirmed as known.
    const d = evaluateImageFingerprint("C", "c9", "m9", H, t + 30 * 60_000);
    expect(d.confirmed).toBe(false);
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

  test("once learned (via SOLO fan-out), the same image from a brand-new account is flagged as known", () => {
    const t = 6_000_000;
    // Learning only happens from the high-confidence solo-raid tier: one account
    // fans H across 3 channels in seconds → confirmed + H added to known set.
    evaluateImageFingerprint("A", "c1", "m1", H, t);
    evaluateImageFingerprint("A", "c2", "m2", H, t + 1000);
    expect(evaluateImageFingerprint("A", "c3", "m3", H, t + 2000).confirmed).toBe(true);
    // A brand-new account posting the same image once is now removed on sight.
    const d = evaluateImageFingerprint("C", "c9", "m9", H, t + 10_000);
    expect(d.confirmed).toBe(true);
    expect(d.reason).toContain("known");
  });

  test("a learned scam hash ages out after the TTL (no permanent tripwire)", () => {
    const t = 7_000_000;
    // Learn H via solo fan-out.
    evaluateImageFingerprint("A", "c1", "m1", H, t);
    evaluateImageFingerprint("A", "c2", "m2", H, t + 1000);
    expect(evaluateImageFingerprint("A", "c3", "m3", H, t + 2000).confirmed).toBe(true);
    // >24h later, a lone poster of the same image is no longer auto-removed.
    const later = t + 25 * 60 * 60_000;
    const d = evaluateImageFingerprint("Z", "c9", "m9", H, later);
    expect(d.confirmed).toBe(false);
  });
});

describe("perceptual image-scam: enforcement", () => {
  beforeEach(() => __resetImageScamState());

  test("ring of 2 accounts posting the same image → 2nd is GRADUATED (copies deleted + warned), NOT instant-banned", async () => {
    // 2026-06-09 audit fix: the worst forbidden outcome is softbanning an
    // innocent. A 2-account same-image match (which a meme repost also produces)
    // must never instant-ban — it deletes the copies and issues a warning.
    const fx = freshEffects();
    const memberA = makeMember(fx, { kickable: true, moderatable: true, bannable: true });
    const memberB = makeMember(fx, { kickable: true, moderatable: true, bannable: true });

    const a = await handleImageScamDetection(
      makeMessage({ userId: "ringA", channelId: "c1", attachments: [{ name: "s.png", size: 100 }], member: memberA, effects: fx }),
      { hashesForTest: [0n] },
    );
    expect(a).toBe(false); // single account so far → no action
    expect(fx.kicks + fx.bans).toBe(0);

    const b = await handleImageScamDetection(
      makeMessage({ userId: "ringB", channelId: "c2", attachments: [{ name: "s.png", size: 100 }], member: memberB, effects: fx }),
      { hashesForTest: [0n] },
    );
    expect(b).toBe(true); // handled (escalated)
    expect(fx.kicks + fx.bans + fx.timeouts).toBe(0); // first strike → warn only, NEVER instant ban
    expect(fx.warnings).toBeGreaterThanOrEqual(1);
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

// ── Softban purge (2026-06-07 incident: a scam message survived because its
// image downloads failed before hashing, so per-message deletion never knew
// about it; a softban makes Discord purge EVERY recent message server-wide) ──
describe("softban purge of confirmed scammers", () => {
  beforeEach(() => __resetImageScamState());

  // Drive an INSTANT confirmation via the solo fan-out tier (one account, same
  // image to 3 channels in seconds) — the high-confidence path that removes
  // directly. (Ring is graduated now, so it can't be used to test instant ban.)
  async function fanoutConfirm(fx: Effects, member: ReturnType<typeof makeMember>, tag: string) {
    const att = [{ name: "s.png", size: 100 }];
    await handleImageScamDetection(
      makeMessage({ userId: `${tag}-s`, channelId: `${tag}-1`, attachments: att, member, effects: fx }),
      { hashesForTest: [99n] },
    );
    await handleImageScamDetection(
      makeMessage({ userId: `${tag}-s`, channelId: `${tag}-2`, attachments: att, member, effects: fx }),
      { hashesForTest: [99n] },
    );
    return handleImageScamDetection(
      makeMessage({ userId: `${tag}-s`, channelId: `${tag}-3`, attachments: att, member, effects: fx }),
      { hashesForTest: [99n] },
    );
  }

  test("bannable scammer → softban (ban + unban), NOT a plain kick", async () => {
    const fx = freshEffects();
    const member = makeMember(fx, { kickable: true, moderatable: true, bannable: true });
    const handled = await fanoutConfirm(fx, member, nextUser());
    expect(handled).toBe(true);
    expect(fx.bans).toBe(1); // ban carries deleteMessageSeconds → server-wide purge
    expect(fx.unbans).toBe(1); // immediately unbanned → kick semantics, can rejoin
    expect(fx.kicks).toBe(0);
  });

  test("ban fails → falls back to a plain kick (member still removed)", async () => {
    const fx = freshEffects();
    const member = makeMember(fx, { kickable: true, bannable: true, banThrows: true });
    const handled = await fanoutConfirm(fx, member, nextUser());
    expect(handled).toBe(true);
    expect(fx.bans).toBe(0);
    expect(fx.unbans).toBe(0);
    expect(fx.kicks).toBe(1);
  });

  test("not bannable → plain kick, exactly the old behavior", async () => {
    const fx = freshEffects();
    const member = makeMember(fx, { kickable: true, bannable: false });
    const handled = await fanoutConfirm(fx, member, nextUser());
    expect(handled).toBe(true);
    expect(fx.bans).toBe(0);
    expect(fx.kicks).toBe(1);
  });

  test("phishing raid (@everyone + link) on a bannable member → softban, not kick", async () => {
    const fx = freshEffects();
    const member = makeMember(fx, { kickable: true, bannable: true });
    const handled = await handlePhishingDetection(
      makeMessage({
        userId: nextUser(),
        content: "@everyone free nitro here https://discord.gg/scam",
        everyone: true,
        member,
        effects: fx,
      }),
    );
    expect(handled).toBe(true);
    expect(fx.bans).toBe(1);
    expect(fx.unbans).toBe(1);
    expect(fx.kicks).toBe(0);
  });

  test("innocent member is NEVER softbanned: image post matching nothing → no ban, no kick", async () => {
    const fx = freshEffects();
    const member = makeMember(fx, { kickable: true, bannable: true });
    const handled = await handleImageScamDetection(
      makeMessage({ userId: nextUser(), attachments: [{ name: "holiday.png", size: 4000 }], member, effects: fx }),
      { hashesForTest: [424242n] },
    );
    expect(handled).toBe(false);
    expect(fx.bans + fx.unbans + fx.kicks + fx.timeouts).toBe(0);
  });
});

// ── Paced fan-out (2026-06-07 kmndg evasion: same image to 3 channels ~1min
// apart — outside the 30s raid window). Must escalate via the strike ladder,
// NEVER instant-remove — an innocent cross-poster only ever gets a warning. ──
describe("paced image fan-out escalation", () => {
  beforeEach(() => __resetImageScamState());

  const att = [{ name: "s.png", size: 9 }];

  test("3 channels ~60s apart → copies deleted + warned, NOT removed, NOT timed out", async () => {
    const fx = freshEffects();
    const u = nextUser();
    const member = makeMember(fx, { kickable: true, bannable: true, moderatable: true });
    const t0 = 10_000_000;
    const r1 = await handleImageScamDetection(
      makeMessage({ userId: u, channelId: "pf1", attachments: att, member, effects: fx }),
      { hashesForTest: [77n], nowForTest: t0 },
    );
    const r2 = await handleImageScamDetection(
      makeMessage({ userId: u, channelId: "pf2", attachments: att, member, effects: fx }),
      { hashesForTest: [77n], nowForTest: t0 + 60_000 },
    );
    expect(r1).toBe(false);
    expect(r2).toBe(false);
    const r3 = await handleImageScamDetection(
      makeMessage({ userId: u, channelId: "pf3", attachments: att, member, effects: fx }),
      { hashesForTest: [77n], nowForTest: t0 + 120_000 },
    );
    expect(r3).toBe(true); // handled: copies deleted, strike recorded
    expect(fx.bans + fx.kicks + fx.timeouts).toBe(0); // first offence → warn only
    expect(fx.warnings).toBeGreaterThanOrEqual(1);
  });

  test("persistent paced fan-out climbs the ladder: warn → timeout → softban; image then learned", async () => {
    const fx = freshEffects();
    const u = nextUser();
    const member = makeMember(fx, { kickable: true, bannable: true, moderatable: true });
    let t = 50_000_000;
    const wave = async (hash: bigint, tag: string) => {
      let last = false;
      for (const ch of ["a", "b", "c"]) {
        last = await handleImageScamDetection(
          makeMessage({ userId: u, channelId: `${tag}-${ch}`, attachments: att, member, effects: fx }),
          { hashesForTest: [hash], nowForTest: (t += 30_000) },
        );
      }
      return last;
    };

    // Hashes are >10 bits apart so each wave forms its own cluster (a real
    // scammer rotating images between waves).
    expect(await wave(0n, "w1")).toBe(true); // strike 1 → warn
    expect(fx.bans + fx.kicks + fx.timeouts).toBe(0);

    expect(await wave(0xffffn, "w2")).toBe(true); // strike 2 → timeout
    expect(fx.timeouts).toBe(1);
    expect(fx.bans + fx.kicks).toBe(0);

    expect(await wave(0xffff0000n, "w3")).toBe(true); // strike 3 → softban-purge
    expect(fx.bans).toBe(1);
    expect(fx.unbans).toBe(1);
    expect(fx.kicks).toBe(0);

    // Removal-grade → the wave-3 image joined the known-scam set: a different
    // account posting it once is now removed on sight.
    const fx2 = freshEffects();
    const other = makeMember(fx2, { kickable: true, bannable: true, moderatable: true });
    const handled = await handleImageScamDetection(
      makeMessage({ userId: nextUser(), channelId: "fresh", attachments: att, member: other, effects: fx2 }),
      { hashesForTest: [0xffff0000n], nowForTest: t + 30_000 },
    );
    expect(handled).toBe(true);
    expect(fx2.bans).toBe(1); // instant removal via known set
  });

  test("tight fan-out (3 channels within 30s) still removes instantly — no ladder", async () => {
    const fx = freshEffects();
    const u = nextUser();
    const member = makeMember(fx, { kickable: true, bannable: true, moderatable: true });
    const t0 = 90_000_000;
    await handleImageScamDetection(makeMessage({ userId: u, channelId: "ff1", attachments: att, member, effects: fx }), { hashesForTest: [555n], nowForTest: t0 });
    await handleImageScamDetection(makeMessage({ userId: u, channelId: "ff2", attachments: att, member, effects: fx }), { hashesForTest: [555n], nowForTest: t0 + 5_000 });
    const r3 = await handleImageScamDetection(
      makeMessage({ userId: u, channelId: "ff3", attachments: att, member, effects: fx }),
      { hashesForTest: [555n], nowForTest: t0 + 10_000 },
    );
    expect(r3).toBe(true);
    expect(fx.bans).toBe(1); // immediate softban, no warn-first ladder
    expect(fx.timeouts).toBe(0);
  });

  test("2 channels paced → no action at all", async () => {
    const fx = freshEffects();
    const u = nextUser();
    const member = makeMember(fx, { kickable: true, bannable: true, moderatable: true });
    const t0 = 130_000_000;
    const r1 = await handleImageScamDetection(makeMessage({ userId: u, channelId: "tc1", attachments: att, member, effects: fx }), { hashesForTest: [888n], nowForTest: t0 });
    const r2 = await handleImageScamDetection(makeMessage({ userId: u, channelId: "tc2", attachments: att, member, effects: fx }), { hashesForTest: [888n], nowForTest: t0 + 60_000 });
    expect(r1).toBe(false);
    expect(r2).toBe(false);
    expect(fx.bans + fx.kicks + fx.timeouts + fx.warnings).toBe(0);
  });

  test("3 channels but spread over >10min → outside the slow window, no action", async () => {
    const fx = freshEffects();
    const u = nextUser();
    const member = makeMember(fx, { kickable: true, bannable: true, moderatable: true });
    const t0 = 170_000_000;
    await handleImageScamDetection(makeMessage({ userId: u, channelId: "sl1", attachments: att, member, effects: fx }), { hashesForTest: [333n], nowForTest: t0 });
    await handleImageScamDetection(makeMessage({ userId: u, channelId: "sl2", attachments: att, member, effects: fx }), { hashesForTest: [333n], nowForTest: t0 + 6 * 60_000 });
    const r3 = await handleImageScamDetection(
      makeMessage({ userId: u, channelId: "sl3", attachments: att, member, effects: fx }),
      { hashesForTest: [333n], nowForTest: t0 + 12 * 60_000 },
    );
    expect(r3).toBe(false);
    expect(fx.bans + fx.kicks + fx.timeouts).toBe(0);
  });
});

// ── Two-channel multi-image flood (2026-06-08 zakayartistry evasion: the same
// 4-image scam set to #introductions + #chat in 5s — under the 3-channel floor).
// Catches the fat-multi-image-set-fanned shape WITHOUT touching a single
// screenshot cross-posted to two channels. Graduated, never instant. ──────────
describe("two-channel multi-image flood", () => {
  beforeEach(() => __resetImageScamState())

  const fat = [
    { name: "1.png", size: 9 },
    { name: "2.png", size: 9 },
    { name: "3.png", size: 9 },
    { name: "4.png", size: 9 },
  ]
  const one = [{ name: "1.png", size: 9 }]

  test("REGRESSION: same multi-image set to 2 channels in 5s → escalate (copies deleted + warn), NOT instant removal", async () => {
    const fx = freshEffects()
    const u = nextUser()
    const member = makeMember(fx, { kickable: true, bannable: true, moderatable: true })
    const t0 = 200_000_000
    const r1 = await handleImageScamDetection(
      makeMessage({ userId: u, channelId: "zc1", attachments: fat, member, effects: fx }),
      { hashesForTest: [42n], nowForTest: t0 },
    )
    expect(r1).toBe(false) // one channel so far
    const r2 = await handleImageScamDetection(
      makeMessage({ userId: u, channelId: "zc2", attachments: fat, member, effects: fx }),
      { hashesForTest: [42n], nowForTest: t0 + 5_000 },
    )
    expect(r2).toBe(true) // 2nd channel + fat message → handled
    expect(fx.bans + fx.kicks + fx.timeouts).toBe(0) // first strike → warn only, never instant
    expect(fx.warnings).toBeGreaterThanOrEqual(1)
  })

  test("INNOCENT: a SINGLE screenshot cross-posted to 2 channels → no action", async () => {
    const fx = freshEffects()
    const u = nextUser()
    const member = makeMember(fx, { kickable: true, bannable: true, moderatable: true })
    const t0 = 210_000_000
    const r1 = await handleImageScamDetection(
      makeMessage({ userId: u, channelId: "ic1", attachments: one, member, effects: fx }),
      { hashesForTest: [43n], nowForTest: t0 },
    )
    const r2 = await handleImageScamDetection(
      makeMessage({ userId: u, channelId: "ic2", attachments: one, member, effects: fx }),
      { hashesForTest: [43n], nowForTest: t0 + 5_000 },
    )
    expect(r1).toBe(false)
    expect(r2).toBe(false) // single-image message → multiImage gate not met
    expect(fx.bans + fx.kicks + fx.timeouts + fx.warnings).toBe(0)
  })

  test("INNOCENT: a fat multi-image writeup in ONE channel → no action", async () => {
    const fx = freshEffects()
    const u = nextUser()
    const member = makeMember(fx, { kickable: true, bannable: true, moderatable: true })
    const handled = await handleImageScamDetection(
      makeMessage({ userId: u, channelId: "single", attachments: fat, member, effects: fx }),
      { hashesForTest: [44n, 45n, 46n, 47n], nowForTest: 220_000_000 },
    )
    expect(handled).toBe(false) // 4 distinct images, 1 channel → no fan-out
    expect(fx.bans + fx.kicks + fx.timeouts + fx.warnings).toBe(0)
  })

  test("persistent 2-channel multi-image floods climb to softban", async () => {
    const fx = freshEffects()
    const u = nextUser()
    const member = makeMember(fx, { kickable: true, bannable: true, moderatable: true })
    let t = 230_000_000
    // Each wave: same fat set to 2 channels (distinct image per wave so each is
    // its own cluster — a scammer rotating images).
    const wave = async (hash: bigint, tag: string) => {
      await handleImageScamDetection(
        makeMessage({ userId: u, channelId: `${tag}-a`, attachments: fat, member, effects: fx }),
        { hashesForTest: [hash], nowForTest: (t += 1000) },
      )
      return handleImageScamDetection(
        makeMessage({ userId: u, channelId: `${tag}-b`, attachments: fat, member, effects: fx }),
        { hashesForTest: [hash], nowForTest: (t += 1000) },
      )
    }
    expect(await wave(0n, "v1")).toBe(true) // strike 1 → warn
    expect(fx.bans + fx.kicks + fx.timeouts).toBe(0)
    expect(await wave(0xffffn, "v2")).toBe(true) // strike 2 → timeout
    expect(fx.timeouts).toBe(1)
    expect(await wave(0xffff0000n, "v3")).toBe(true) // strike 3 → softban-purge
    expect(fx.bans).toBe(1)
    expect(fx.unbans).toBe(1)
    expect(fx.kicks).toBe(0)
  })
})

// ── Matched-ref hygiene: multi-attachment messages must yield ONE ref ───────
describe("image fingerprint ref dedup", () => {
  beforeEach(() => __resetImageScamState());

  test("same message evaluated once per attachment-hash → matched lists it once", () => {
    const now = 1_000_000;
    // 4 attachments of the same image in one message → 4 evaluations, 1 ref.
    evaluateImageFingerprint("u-dedup", "chA", "msg-1", 5n, now);
    evaluateImageFingerprint("u-dedup", "chA", "msg-1", 5n, now + 1);
    evaluateImageFingerprint("u-dedup", "chA", "msg-1", 5n, now + 2);
    const d = evaluateImageFingerprint("u-dedup", "chA", "msg-1", 5n, now + 3);
    expect(d.matched.filter((r) => r.messageId === "msg-1")).toHaveLength(1);
  });
});
