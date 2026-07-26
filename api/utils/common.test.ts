import { describe, test, expect } from "bun:test";
import {
  categoryNormalize,
  validatePaginationParams,
  validateQueryBoolean,
  validateQueryString,
} from "./common";

describe("categoryNormalize()", () => {
  test("normalizes basic aliases", () => {
    expect(categoryNormalize("re")).toBe("reverse");
    expect(categoryNormalize("ReVeRsInG")).toBe("reverse");
    expect(categoryNormalize("binex")).toBe("pwn");
    expect(categoryNormalize("stego")).toBe("steganography");
    expect(categoryNormalize("unknown")).toBe("misc");
  });

  test("normalizes separators and whitespace", () => {
    expect(categoryNormalize("web_exploitation")).toBe("web");
    expect(categoryNormalize("web-exploitation")).toBe("web");
    expect(categoryNormalize("  web   exploitation  ")).toBe("web");
  });

  test("passes through unknown categories after normalization", () => {
    expect(categoryNormalize("hardware")).toBe("hardware");
    expect(categoryNormalize("melstudios")).toBe("melstudios");
  });
});

describe("validatePaginationParams()", () => {
  test("accepts strict whole numbers and defaults omitted values", () => {
    expect(validatePaginationParams(undefined, undefined)).toMatchObject({
      isValid: true,
      limit: 10,
      offset: 0,
    });
    expect(validatePaginationParams("25", "50")).toMatchObject({
      isValid: true,
      limit: 25,
      offset: 50,
    });
  });

  test("rejects partial numbers, arrays, and excessive offsets", () => {
    expect(validatePaginationParams("10junk", "0").isValid).toBe(false);
    expect(validatePaginationParams(["10"], "0").isValid).toBe(false);
    expect(validatePaginationParams("10", "100001")).toMatchObject({
      isValid: false,
      error: "Offset must not exceed 100000",
    });
  });

  test("supports endpoint-specific limits", () => {
    expect(
      validatePaginationParams("51", "0", {
        defaultLimit: 10,
        maxLimit: 50,
      }),
    ).toMatchObject({
      isValid: false,
      error: "Limit must be between 1 and 50",
    });
  });
});

describe("query value validation", () => {
  test("rejects bracket/repeated values before they reach Mongo queries", () => {
    expect(validateQueryString({ $ne: "" }, "ctf_id", 64)).toMatchObject({
      isValid: false,
      error: "ctf_id must be a single string",
    });
    expect(validateQueryString(["one", "two"], "search", 100).isValid).toBe(false);
  });

  test("trims and bounds string values", () => {
    expect(validateQueryString("  web  ", "search", 100)).toEqual({
      isValid: true,
      value: "web",
    });
    expect(validateQueryString("x".repeat(101), "search", 100).isValid).toBe(false);
  });

  test("accepts only literal boolean query values", () => {
    expect(validateQueryBoolean(undefined, "global", true).value).toBe(true);
    expect(validateQueryBoolean("false", "global", true)).toEqual({
      isValid: true,
      value: false,
    });
    expect(validateQueryBoolean(["false"], "global", true).isValid).toBe(false);
  });
});
