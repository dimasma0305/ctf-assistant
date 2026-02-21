import { describe, expect, test } from "bun:test";
import { normalizeThreadLookupKey } from "./parser";

describe("normalizeThreadLookupKey()", () => {
    test("normalizes unicode tag characters (invisible emoji tag payload)", () => {
        const withTags = "Emo\uDB40\uDD20\uDB40\uDD68\uDB40\uDD56\uDB40\uDD65\uDB40\uDD5Eji's";
        const plain = "Emoji's";

        expect(normalizeThreadLookupKey(withTags)).toBe(normalizeThreadLookupKey(plain));
    });

    test("normalizes variation selector differences", () => {
        const textHeart = "Heart \u2764";
        const emojiHeart = "Heart \u2764\uFE0F";

        expect(normalizeThreadLookupKey(textHeart)).toBe(normalizeThreadLookupKey(emojiHeart));
    });

    test("normalizes zero-width characters", () => {
        const withZwsp = "Mul\u200Bti\u200CVer\u200Dse";
        const plain = "MultiVerse";

        expect(normalizeThreadLookupKey(withZwsp)).toBe(normalizeThreadLookupKey(plain));
    });

    test("normalizes canonical-equivalent non-ascii text", () => {
        const composed = "Café";
        const decomposed = "Cafe\u0301";

        expect(normalizeThreadLookupKey(composed)).toBe(normalizeThreadLookupKey(decomposed));
    });

    test("keeps meaningful non-ascii characters distinct", () => {
        expect(normalizeThreadLookupKey("jalapeño")).not.toBe(normalizeThreadLookupKey("jalapeno"));
    });
});
