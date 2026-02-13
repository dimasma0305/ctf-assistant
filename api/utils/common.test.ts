import { describe, test, expect } from "bun:test";
import { categoryNormalize } from "./common";

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

