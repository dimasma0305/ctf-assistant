import { Jimp } from "jimp";

/**
 * Perceptual image hashing for scam-image detection.
 *
 * A scam ring re-encodes the same image per account, so byte hashes (sha256) and
 * the attachment name:size signature all differ — the moderation never links
 * them. A *difference hash* (dHash) is computed from a tiny normalized grayscale
 * thumbnail, so visually identical images collide within a small Hamming
 * distance regardless of re-encoding/resize. Empirically (validated on the real
 * TCP1P scam set): re-encoded copies across accounts land at distance 0-2, while
 * an unrelated legit writeup image is ~20 away — a clean, wide margin.
 */

const HASH_W = 9; // dHash: 9x8 grayscale → 8 horizontal comparisons per row
const HASH_H = 8; // → 8x8 = 64 bits

// Tuning: ≤ MATCH_THRESHOLD bits apart ⇒ "the same image". 10 sits safely
// between the scam cluster (≤2) and the nearest legit control (~20).
export const MATCH_THRESHOLD = 10;

/** Compute a 64-bit difference hash from a decoded image buffer. Returns null on
 * any decode failure — callers treat that as "no fingerprint" (never throws). */
export async function dhashFromBuffer(buf: Buffer): Promise<bigint | null> {
  try {
    const img = await Jimp.read(buf);
    img.resize({ w: HASH_W, h: HASH_H }).greyscale();
    const data = img.bitmap.data; // RGBA, row-major; R channel == intensity after greyscale
    const intensity = (x: number, y: number) => data[(y * HASH_W + x) * 4];

    let bits = 0n;
    for (let y = 0; y < HASH_H; y++) {
      for (let x = 0; x < HASH_W - 1; x++) {
        bits = (bits << 1n) | (intensity(x, y) > intensity(x + 1, y) ? 1n : 0n);
      }
    }
    return bits;
  } catch {
    return null;
  }
}

/** Hamming distance between two 64-bit hashes (popcount of XOR). */
export function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x > 0n) {
    x &= x - 1n;
    count++;
  }
  return count;
}

/** True if two fingerprints are within MATCH_THRESHOLD bits (i.e. same image). */
export function isPerceptualMatch(a: bigint, b: bigint, threshold = MATCH_THRESHOLD): boolean {
  return hamming(a, b) <= threshold;
}
