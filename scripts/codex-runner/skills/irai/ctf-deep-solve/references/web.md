# Web and browser CTFs

Model principals, origins, sessions, routes, state stores, queues/bots, and every boundary where untrusted input reaches a parser or privileged action. Establish an ordinary request and response before mutation.

High-value questions include:

- Where is identity established, propagated, and rechecked? Can object ownership or role assumptions diverge between layers?
- Do URL, path, host, redirect, proxy, cache, serialization, template, SQL, shell, XML, or browser parsers disagree about the same bytes?
- Which state changes happen before validation, across retries, or in a different worker?
- For admin bots, what are the browser version, origin, navigation sequence, cookies, CSP, sandbox, popup behavior, and timeout?
- Which server response, timing difference, outbound request, or browser behavior can act as an oracle?

Use a scripted HTTP client for exact requests and cookies. Use a real browser when rendering, origin policy, storage, navigation, or timing is decisive. Capture raw requests/responses and browser console/network evidence. Prove the smallest primitive, then connect it to the privileged data or action that yields the flag.

When a bot visits an attacker-controlled page, use [the browser signal probe](../../../scripts/browser_signal_probe.md) if repeated parent-page measurements would resolve a concrete hypothesis. Compare an equivalent control and a known-different control before interpreting a candidate. Missing callbacks are inconclusive.
