import { readResponseTextWithLimit } from "../utils/urlGuard";

type Method = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

async function request(url: string, method: Method, headers: HeadersInit = {}) {
  const requestHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36",
    ...headers,
  };

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Upstream returned HTTP ${response.status}`);
  }

  return {
    data: await readResponseTextWithLimit(response, MAX_RESPONSE_BYTES),
    status: response.status,
  };
}

export { request };
