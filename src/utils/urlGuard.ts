/**
 * Shared SSRF guard. Any code that fetches a URL derived from user/model input
 * (the AI fetch_url tool, the /solve init fetch loop, …) must run a target
 * through checkUrlSafe first so it can't be pointed at the internal docker
 * network, cloud metadata (169.254.169.254), localhost admin ports, mongo,
 * redis, the gzctf api, etc. Extracted from AI/web.ts in the 2026-06-09 audit
 * so it's reused, not reimplemented per call-site.
 */
import { lookup } from "node:dns/promises";

export function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  // IPv4
  if (ip === "0.0.0.0") return true;
  if (ip.startsWith("127.")) return true;
  if (ip.startsWith("10.")) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true; // link-local (cloud metadata)
  if (ip.startsWith("100.64.")) return true; // CGNAT
  // IPv6
  if (ip === "::" || ip === "::1") return true;
  if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true; // unique-local
  // IPv4-mapped / -compatible IPv6 literals (e.g. ::ffff:127.0.0.1) — re-check
  // the embedded IPv4 tail.
  const v4tail = ip.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4tail && /^(::ffff:|::)/i.test(ip)) return isPrivateIp(v4tail[1]);
  return false;
}

export interface UrlGuardResult {
  ok: boolean;
  error?: "invalid_url" | "bad_scheme" | "dns_lookup_failed" | "private_target";
  resolvedHost?: string;
}

/** Reject non-http(s) schemes and any host that is (or resolves to) a private,
 * loopback, link-local or unique-local address. */
export async function checkUrlSafe(urlStr: string): Promise<UrlGuardResult> {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: "bad_scheme" };
  }
  // Block bare-IP literals up front (catches http://127.0.0.1, http://[::1]).
  const hostNoBrackets = u.hostname.replace(/^\[|\]$/g, "");
  if (isPrivateIp(hostNoBrackets)) return { ok: false, error: "private_target", resolvedHost: hostNoBrackets };
  // Then DNS-resolve the hostname and re-check, so http://evil.com that
  // resolves to 127.0.0.1 still gets blocked.
  try {
    const { address } = await lookup(u.hostname);
    if (isPrivateIp(address)) return { ok: false, error: "private_target", resolvedHost: address };
    return { ok: true, resolvedHost: address };
  } catch {
    return { ok: false, error: "dns_lookup_failed" };
  }
}
