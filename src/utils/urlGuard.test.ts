import { describe, expect, test } from "bun:test";
import {
  ResponseTooLargeError,
  SafeFetchError,
  checkUrlSafe,
  isPrivateIp,
  readResponseTextWithLimit,
  safeFetch,
  type UrlGuardResult,
} from "./urlGuard";

const allowPublicUrl = async (): Promise<UrlGuardResult> => ({
  ok: true,
  resolvedHost: "93.184.216.34",
});

describe("isPrivateIp()", () => {
  test("blocks private and non-routable IPv4 ranges completely", () => {
    expect(isPrivateIp("100.127.255.254")).toBe(true);
    expect(isPrivateIp("198.19.255.255")).toBe(true);
    expect(isPrivateIp("203.0.113.10")).toBe(true);
    expect(isPrivateIp("224.0.0.1")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });

  test("accepts a globally routable IPv6 literal without a DNS lookup", async () => {
    expect(await checkUrlSafe("https://[2606:4700:4700::1111]/")).toEqual({
      ok: true,
      resolvedHost: "2606:4700:4700::1111",
    });
  });
});

describe("safeFetch()", () => {
  test("rejects a public-to-private redirect before requesting the private URL", async () => {
    const requested: string[] = [];
    const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
      requested.push(String(input));
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1:3000/admin" },
      });
    };

    const promise = safeFetch(
      "https://public.example/challenges",
      {},
      {
        fetchImpl,
        checkUrl: async (url): Promise<UrlGuardResult> =>
          url.includes("127.0.0.1")
            ? { ok: false, error: "private_target" }
            : allowPublicUrl(),
      },
    );

    await expect(promise).rejects.toMatchObject({
      name: "SafeFetchError",
      code: "private_target",
    });
    expect(requested).toEqual(["https://public.example/challenges"]);
  });

  test("follows public redirects manually and strips cross-origin secrets", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      calls.push({ url: String(input), init });
      if (calls.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://cdn.example/challenges.json" },
        });
      }
      return new Response('{"ok":true}', { status: 200 });
    };

    const response = await safeFetch(
      "https://api.example/challenges",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer secret",
          Cookie: "session=secret",
          "Content-Type": "application/json",
        },
        body: "{}",
      },
      { fetchImpl, checkUrl: allowPublicUrl },
    );

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[0].init?.redirect).toBe("manual");
    expect(calls[1].init?.redirect).toBe("manual");
    expect(calls[1].init?.method).toBe("GET");
    expect(calls[1].init?.body).toBeUndefined();

    const redirectedHeaders = new Headers(calls[1].init?.headers);
    expect(redirectedHeaders.has("authorization")).toBe(false);
    expect(redirectedHeaders.has("cookie")).toBe(false);
    expect(redirectedHeaders.has("content-type")).toBe(false);
  });

  test("enforces the redirect limit", async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response(null, {
        status: 302,
        headers: { location: "/again" },
      });

    await expect(
      safeFetch("https://public.example/start", {}, {
        fetchImpl,
        checkUrl: allowPublicUrl,
        maxRedirects: 1,
      }),
    ).rejects.toBeInstanceOf(SafeFetchError);
  });
});

describe("readResponseTextWithLimit()", () => {
  test("rejects a streamed body that exceeds the byte limit", async () => {
    const response = new Response("123456");
    await expect(readResponseTextWithLimit(response, 5)).rejects.toBeInstanceOf(
      ResponseTooLargeError,
    );
  });

  test("returns a body within the byte limit", async () => {
    const response = new Response("hello");
    expect(await readResponseTextWithLimit(response, 5)).toBe("hello");
  });
});
