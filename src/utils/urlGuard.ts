/**
 * Shared SSRF guard. Any code that fetches a URL derived from user/model input
 * (the AI fetch_url tool, the /solve init fetch loop, …) must run a target
 * through checkUrlSafe first so it can't be pointed at the internal docker
 * network, cloud metadata (169.254.169.254), localhost admin ports, mongo,
 * redis, the gzctf api, etc. Extracted from AI/web.ts in the 2026-06-09 audit
 * so it's reused, not reimplemented per call-site.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  // IPv4: allow only globally routable ranges. Besides RFC1918, block
  // loopback, link-local/cloud metadata, CGNAT, documentation, benchmark,
  // multicast, and reserved ranges.
  const v4 = ip.split(".");
  if (v4.length === 4 && v4.every((part) => /^\d{1,3}$/.test(part))) {
    const octets = v4.map(Number);
    if (octets.some((part) => part > 255)) return true;
    const [a, b, c] = octets;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    if (a === 192 && b === 88 && c === 99) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true;
    return false;
  }

  // IPv6
  if (ip === "::" || ip === "::1") return true;
  if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true; // unique-local
  if (/^ff[0-9a-f]{2}:/i.test(ip)) return true; // multicast
  if (/^2001:db8:/i.test(ip)) return true; // documentation range
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
  if (isIP(hostNoBrackets)) {
    return { ok: true, resolvedHost: hostNoBrackets };
  }
  // Then DNS-resolve the hostname and re-check, so http://evil.com that
  // resolves to 127.0.0.1 still gets blocked. Check every A/AAAA answer rather
  // than only the resolver's first result; fetch may select a different answer.
  try {
    const addresses = await lookup(u.hostname, { all: true, verbatim: true });
    const unsafeAddress = addresses.find(({ address }) => isPrivateIp(address));
    if (unsafeAddress) {
      return { ok: false, error: "private_target", resolvedHost: unsafeAddress.address };
    }
    return { ok: true, resolvedHost: addresses[0]?.address };
  } catch {
    return { ok: false, error: "dns_lookup_failed" };
  }
}

export type SafeFetchErrorCode =
  | NonNullable<UrlGuardResult["error"]>
  | "invalid_redirect"
  | "too_many_redirects";

export class SafeFetchError extends Error {
  constructor(
    public readonly code: SafeFetchErrorCode,
    public readonly targetUrl: string,
  ) {
    super(`Safe fetch rejected ${targetUrl}: ${code}`);
    this.name = "SafeFetchError";
  }
}

export class ResponseTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Response body exceeds the ${maxBytes}-byte limit`);
    this.name = "ResponseTooLargeError";
  }
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface SafeFetchDependencies {
  fetchImpl?: FetchLike;
  checkUrl?: typeof checkUrlSafe;
  maxRedirects?: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const CROSS_ORIGIN_SECRET_HEADERS = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "cookie2",
];

/**
 * Fetch a public URL while validating the initial URL and every redirect hop.
 *
 * Native `redirect: "follow"` is unsafe for guarded, user-controlled URLs:
 * a public endpoint can redirect to localhost or cloud metadata after the
 * initial check. Redirects are therefore followed manually, with credentials
 * stripped when the origin changes.
 */
export async function safeFetch(
  urlStr: string,
  init: RequestInit = {},
  dependencies: SafeFetchDependencies = {},
): Promise<Response> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const checkUrl = dependencies.checkUrl ?? checkUrlSafe;
  const maxRedirects = dependencies.maxRedirects ?? 5;

  if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 20) {
    throw new RangeError("maxRedirects must be an integer between 0 and 20");
  }

  let currentUrl = urlStr;
  let method = (init.method ?? "GET").toUpperCase();
  let body = init.body;
  const headers = new Headers(init.headers);

  for (let redirects = 0; ; redirects++) {
    const guard = await checkUrl(currentUrl);
    if (!guard.ok) {
      throw new SafeFetchError(guard.error ?? "invalid_url", currentUrl);
    }

    const response = await fetchImpl(currentUrl, {
      ...init,
      method,
      body,
      headers,
      redirect: "manual",
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }
    if (redirects >= maxRedirects) {
      await response.body?.cancel().catch(() => undefined);
      throw new SafeFetchError("too_many_redirects", currentUrl);
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      await response.body?.cancel().catch(() => undefined);
      throw new SafeFetchError("invalid_redirect", currentUrl);
    }

    const currentOrigin = new URL(currentUrl).origin;
    if (nextUrl.origin !== currentOrigin) {
      for (const header of CROSS_ORIGIN_SECRET_HEADERS) {
        headers.delete(header);
      }
    }

    // Match Fetch redirect semantics: 303 becomes GET (except HEAD), while
    // 301/302 turn POST into GET. A body must not be forwarded after that.
    if (
      (response.status === 303 && method !== "HEAD") ||
      ((response.status === 301 || response.status === 302) && method === "POST")
    ) {
      method = "GET";
      body = undefined;
      headers.delete("content-length");
      headers.delete("content-type");
    }

    await response.body?.cancel().catch(() => undefined);
    currentUrl = nextUrl.toString();
  }
}

/**
 * Read a response body without allowing a malicious or broken upstream to
 * exhaust the bot's memory. The limit applies to bytes emitted by fetch after
 * content decoding, not only to the potentially untrustworthy Content-Length.
 */
export async function readResponseTextWithLimit(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("maxBytes must be a positive integer");
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new ResponseTooLargeError(maxBytes);
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new ResponseTooLargeError(maxBytes);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
