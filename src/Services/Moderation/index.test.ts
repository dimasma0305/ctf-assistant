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
import { handleSpamDetection, handlePhishingDetection } from "./index";

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
});
