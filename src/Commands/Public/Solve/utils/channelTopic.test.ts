import { describe, expect, test } from "bun:test";
import { parseCTFEventIdFromTopic } from "./channelTopic";

describe("parseCTFEventIdFromTopic()", () => {
    test("parses the jailCTF 2026 channel topic", () => {
        expect(parseCTFEventIdFromTopic('{"id":3286}')).toBe("3286");
    });

    test("normalizes a numeric string ID", () => {
        expect(parseCTFEventIdFromTopic('{"id":" 3286 "}')).toBe("3286");
    });

    test("returns null when the topic has no valid event ID", () => {
        expect(parseCTFEventIdFromTopic(null)).toBeNull();
        expect(parseCTFEventIdFromTopic("{}")).toBeNull();
        expect(parseCTFEventIdFromTopic('{"id":0}')).toBeNull();
        expect(parseCTFEventIdFromTopic('{"id":"not-an-id"}')).toBeNull();
    });

    test("throws for malformed JSON", () => {
        expect(() => parseCTFEventIdFromTopic('{"id":3286')).toThrow();
    });
});
