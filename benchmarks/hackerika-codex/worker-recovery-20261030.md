# Agent delegation and irai verification — 2026-10-30

The reported Mirai request reached `delegate_codex` twice, then used
`research_topic`. The controller was unavailable before accepting a job: its
worker image had been pruned, and rebuilding depended on the removed desktop
release directory for Codex CLI 0.163.0. A successful tool-dispatch log did not
mean a worker had started. The short Discord answer was inline research, not
an isolated irai investigation.

The chat model's choice to delegate was already correct. No keyword router,
forced deepsearch dispatch, or change to the chat model was introduced. Default
worker routing remains `auto` → `gpt-6-sol`.

## Changes

- Pin the tested CLI 0.166.0 executable pair and retain it under the controller's
  state directory. Validate both SHA-256 hashes and the reported CLI version
  before publishing a retained copy. Copy no configuration or credentials.
  Later worker rebuilds use the retained copy independently of desktop updates.
- Use one worker-image constant in build, readiness, execution and controller
  code. Readiness reports the configured image. Custom images are not silently
  replaced with another version.
- Label inline research as temporary fallback when worker preparation fails.
  Apply that status after answer grounding so the profile formatter cannot
  silently erase it. Failed submission cannot promise a running job.
- Reject malformed/nonstandard HTTP responses through the request promise.
  HTTP 999 previously threw from an asynchronous callback. The source gateway
  now returns a concrete source-access failure and can continue to other pages.
- Preserve a bounded larger discovered-source set. A roster's first 60 links
  previously exhausted the global set; later links were silently unusable.
  Trailing-slash variants share a lookup key while origins, other paths and
  query strings remain distinct. Public-address/redirect checks still apply.

irai remains the reviewed bundle at
`e32691ac881396a1aa060f5174756bf7f44e5f22`, containing `resourceful-solve` and
`ctf-deep-solve`. Installation alone is not evidence of execution.

## Verification

The focused suite contains 81 passing tests: runtime retention/corruption,
readiness and admission, source traversal, blocked-source recovery, SSRF,
research grounding, fallback status, and benchmark evidence validation.
The application bundles successfully. Explicit TypeScript checking still
reports the existing `api/utils/statistics.ts:577` missing `totalChallenges`;
it reports no errors in these changes.

The worker image was built and then rebuilt from the retained runtime. Its
tested image ID is `sha256:c0fa4018710c2be712ed827f12c678ebe458cfc36ebce8ee37ddd1c5005c7206`.
CLI output inside the container is `codex-cli 0.166.0`.

| Real-path test | Result |
| --- | --- |
| Private controller submission | HTTP 202; completed on default Sol; successful shell commands; resourceful skill read; correct CSV medians and ratio. 6/6 checks, 41.6 s. |
| First profile run after runtime recovery | Agent completed, but HTTP 999 exposed an uncaught transport exception. Gateway-only depth checks failed; the rolling receipt window also lost initial skill reads. Preserved as failed evidence. |
| Profile run after transport fix | Both irai reference reads recorded; HTTP 999 returned a bounded failure; agent continued via curl. Gateway depth checks still failed, exposing the source-set/slash issues. |
| Final profile run after source fixes | 6/6 checks; both skill/reference reads; 7 distinct successfully inspected gateway pages, including discovered sources beyond the original 3; 3 searches, 11 source attempts, 16 model calls, 42 completed command records; 243.4 s. |

The final answer used roster links, repository contents and a vendor advisory.
It distinguished contribution to an HCS research article/repository from the
vendor's reporter credit, and did not claim that matching handles prove Discord
account control. LinkedIn HTTP 999 and GitHub profile HTTP 410 remained real
source-access limits; neither was counted as an inspected page. A separate
gateway-only live check records the HTTP 410 failure explicitly, while confirming
that a newly discovered research-repository link remains readable after the roster.

Evidence:

- `runs/controller-spawn-20261030/result.json`
- `runs/profile-depth-20261030/result.json`
- `runs/profile-depth-candidate-20261030/result.json`
- `runs/profile-depth-final-20261030/result.json`
- `runs/source-gateway-live-20261030.json`

The final profile run passed the original gateway-only depth checks. The harness
also now supports body-backed curl reads of GitHub Markdown/API records for future
runs, since curl is an intentionally supported agent tool. That does not rewrite
earlier scores. Raw command outputs are optional private traces outside the repo;
committed receipts retain command text and output hashes. Skill-read evidence is
collected before the production rolling receipt window truncates older commands.

These runs used synthetic Discord IDs, a private controller socket for admission
testing, and no Discord writes. The original user request was not replayed into
the live channel. This is one real research case plus focused regressions, not a
claim of optimal prompts, universal research quality, or verified private identity.

Official reference for intentional version pinning:
[Build iterative repair loops with Codex](https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex).
