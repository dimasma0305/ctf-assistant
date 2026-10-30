# Native subagent execution repair — 2026-10-30

Production job `7626ffe4-fa58-44ea-9b91-22e82db30709` did start an isolated
Sol worker and read the irai research references. It failed after five model
requests, before any source read. The generic `worker_failed` status hid the
actual inference error. This was a separate integration path from the earlier
worker-image recovery test: the request explicitly asked for local subagents.

The exact private packet was replayed outside the production queue. The upstream
returned HTTP 400, `subscription_sharing_unsupported_capability`, parameter
`input`, when Codex supplied native `agent_message` items. Their content included
visible peer text and sometimes opaque `encrypted_content` state. The subscription
endpoint accepts ordinary messages but not those local harness envelopes.

## Repair and observed progression

| Replay | Observed result |
| --- | --- |
| Baseline and input-shape capture | Both failed at five calls with the same HTTP 400. Only structural input metadata was exported. |
| Visible peer-message adaptation alone | Passed the unsupported-input point, then failed because the old single-stream gate returned `model_busy` to concurrent agents. |
| Adaptation plus queued concurrency | Research ran, but consumed all 36 shared model calls before returning a final answer. |
| Shared remaining-budget guidance and finalization window | Completed in 32 calls, with two searches and six source-read attempts. Returned cited findings; two successful source pages were recorded. |
| Independent final replay | All seven execution checks passed. Completed in 33 calls, three searches and six source-read attempts, with four successful source pages. Both irai research references were read. Elapsed 123.7 seconds. |

The adapter preserves visible peer communication, attribution, tool-call/output
pairs, order, and native parent reasoning items. It does not decrypt, display or
reinterpret opaque peer-state ciphertext. Unknown peer content fails explicitly
instead of being silently discarded. The resulting peer text is identified as
task data, not new user authorization.

The per-job gateway now allows three active model streams and eight queued
requests, with cancellation and shared hard limits. Every agent receives the
remaining job-wide model/source budget. The final six investigation calls (two
for CTF) disable further tools and request supported findings, unresolved gaps
and the parent's final result. This preserves the existing limits and leaves the
chat model's choice of whether to delegate unchanged. It does not add a keyword
router or switch models.

HTTP errors and HTTP-200 stream failures retain bounded machine-readable error
metadata. Large valid terminal events are recognized up to the existing response
limit. Private diagnostics exclude provider error prose, credentials, Discord
content and internal agent messages. The user sees a specific integration or
usage-limit explanation when applicable, rather than a guessed research failure.

## Verification and limits

The focused regression suite has 93 passing tests, including the production
gateway with concurrent streams, cancellation, tool-budget finalization, input
compatibility and provider failure handling. The application bundles successfully.
Explicit TypeScript checking reports the pre-existing missing `totalChallenges`
field at `api/utils/statistics.ts:577`; it reports no error in the changed code.

The final public-profile answer cited HCS, CTFtime and AlpacaHack evidence. It kept
unverified Discord ownership and other gaps explicit. These are execution and
source-use checks, not a claim of exhaustive research or verified private identity.
The `peerMessagesAdapted` metric counts envelopes seen across requests, including
replayed history; it is not the number of distinct subagents.

Evidence:

- [Failed and intermediate replays](runs/peer-protocol-20261030/replays.json)
- [Independent final replay](runs/peer-replay-20261030/result.json)
- [Reusable private-job replay](replay-job.ts)

Direct replays used the unchanged private packet, identified only by hash in the
final report. They made no production queue submissions, Discord reads or Discord
writes. No raw packet, provider body or internal reasoning is committed. The
historical failed production job remains failed; test completion is not fabricated
as its result. The final replay's top-level elapsed time is measured by the harness;
its nested `stats.elapsedMs` remains zero because that counter was controller-owned
at the time of that run. Future harness runs set that counter too.

Official protocol references: [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
and [Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery).
