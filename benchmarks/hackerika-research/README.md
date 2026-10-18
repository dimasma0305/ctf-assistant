# Hackerika research upgrade — 2026-10-16

## Natural member OSINT request — 2026-10-18

The production example “siapa @Aryma House Of Wolf aku mau kamu deep search dia” exposed a routing gap: `siapa @member` skipped the verified Discord profile and sent a long generic question to web search. The bot now recognizes that syntax for exactly one tagged person, reads the current guild/user profile, searches the observed username and display name separately, and opens up to four relevant web leads plus bounded same-site links. Its reply separates verified Discord fields from inspected but unlinked web pages. Routine CTF questions with a member mention stay on the normal route.

The matched synthetic [before/after run](aryma-final-comparison-20261018.json) improved from **0/1 to 1/1** judged pass. Baseline made six model calls and read neither the Discord profile nor the two available pages; the final version made two model calls, read all three sources, and used fewer measured prompt/completion tokens (21,006/798 → 16,225/165). An [intermediate comparison](aryma-efficiency-comparison-20261018.json) confirms the same 1/1 result with seven → two calls after removing redundant profile drafting and verification. The [prior profile regression](runs/aryma-prior-profile-regression-20261018/judge-summary.json) also passed 1/1. These are small, controlled fixtures; real web availability and account attribution still depend on inspectable links and source quality.

## Discord profile OSINT regression — 2026-10-18

An explicit member mention in a profile/identity question now triggers a read-only Discord user and current-guild member lookup. The bot can ground a reply in username, display name, account creation timestamp inferred from the Discord ID, server join date, roles, public flags, and available avatar/banner URLs. A same-handle web page is reported only as an unverified lead unless there is independent evidence tying it to the Discord account. The worker searches by handle instead of sending the Discord ID and full private question to web search, and opens source pages before using them.

The matched synthetic [before/after comparison](profile-osint-final-comparison-20261018.json) moved from **0/1 to 1/1** judged pass. The old bot searched four times and gave no profile facts; the candidate read the correct Discord profile and one same-handle page, stated the verified account facts, and kept the website attribution uncertain. Two existing technical research cases passed their [regression smoke](runs/profile-regression-smoke-20261018/judge-summary.json) (2/2, no critical failures). These are small fixtures, not a production accuracy estimate. The first image trial failed because the benchmark mounted a host credential path inaccessible to the container user; the harness now mounts it at the runtime path. Failed runs are retained under `runs/profile-candidate-20261018/` and `runs/profile-candidate-retry-20261018/`.

The deployed bot now runs a bounded research workflow: discover sources, open the exact project, follow documentation, inspect relevant repository files, synthesize supported findings, and review whether the evidence supports each claim. This addresses confusing similarly named projects, treating a README omission as feature absence, inventing configuration/relay instructions, and stopping at a documentation index.

Research uses `deepseek-v4-pro`; normal conversation and native image input retain `deepseek-flash`. Implementation lives in [research.ts](../../src/Services/AI/research.ts), [researchSources.ts](../../src/Services/AI/researchSources.ts), and the existing chat/tool dispatchers. No project names or benchmark answers are hardcoded into production rules.

## Final matched results

A pass requires both deterministic checks and blind semantic judging. Each split also requires at least 90% correctness, no regression against its matched baseline, zero critical candidate failures, and zero execution/judge errors.

| Split | Design | Before | Deployed candidate 7 |
| --- | --- | --- | --- |
| Development | 8 scenarios × 1 trial | 7/8 | 8/8 |
| Observed regression | 4 scenarios × 2 trials | 8/8 | 8/8 |
| Fresh reserved validation | 4 new scenarios × 2 trials | 7/8 | 8/8 |
| Total | 16 unique scenarios, 24 trials per variant | 22/24 | 24/24 |

The two baseline failures stopped at documentation navigation pages instead of following links. The final candidate had zero critical failures in this suite. See [development](development-final-v7.json), [regression](regression-final-v7.json), [fresh validation](validation-final-v7.json), and [aggregate results](final-report.json). Raw outputs, retrieval effects, usage and judgments are retained under `runs/`.

Fresh cases test per-event versus global configuration, three documentation hops, a planned but unimplemented feature, and edition-specific licensing/storage support. Other cases cover exact repository identity, native first-blood delivery, README omissions, unsupported performance superlatives, deprecated settings, hostile page instructions, unavailable search, and keeping two projects separate.

Across these trials, input tokens fell from 711,627 to 339,325 (52.3%), while SDK calls increased from 68 to 122. Output tokens were 25,382 versus 24,494. Median measured latency increased from 13.3 to 22.3 seconds; p95 increased from 21.3 to 29.2 seconds. Latency includes handler import/typing overhead. Token totals include nested worker calls, exclude judge calls and search-provider internal usage, and are not a billing estimate. Pro usage and additional verification can increase cost despite fewer input tokens.

## Actual-source and regression checks

[Actual rsctf verification](live-source-verification.json) used the production URL guard, public GitHub metadata/tree/raw files, a pinned commit and real DeepSeek calls. Six final claims were checked against the organizer guide: the Discord webhook belongs to each game, built-in delivery handles blood announcements, and no external relay is needed. That probe establishes documentation grounding; it did not perform a full implementation audit. The source is [the pinned organizer guide](https://github.com/dimasma0305/rsctf/blob/4747de88fa866f739e3738ba02f7c3b064dd159a/docs/organizers/games.md).

[Provider verification](provider-verification.json) records real native DeepSeek search results and a successful non-thinking forced-tool → thinking final-answer exchange. A strict site search that returned no results is retained alongside the successful broader query. Generated search summaries are discovery leads, not independent page evidence. The search smoke used candidate 5; the deployed candidate has the identical verified `web.ts` hash.

The final image passed three existing capability regressions: CTR technical correctness, native reply delivery accounting, and an image supplied through a replied-to message. Two model answers passed semantic judging; the backend case passed deterministic checks. The full local suite passed **333 tests, 0 failures, 1,027 assertions across 33 files**. Scoped strict TypeScript checking, including the repository's existing `ascii-table` declaration, and the Bun application build passed. Broad application type checking still has the previously recorded unrelated statistics type mismatch; no full-repository type-clean claim is made.

## Selection history and measurement corrections

All failed runs remain available. The initial campaign's internal candidate cap was extended before fresh validation; see `campaign.json` and `campaign-v3.json` through `campaign-v7.json`.

| Candidate | Development observation | Outcome |
| --- | --- | --- |
| 1 | 5/8 combined under the original checker | Rejected; incomplete grounding and configuration conclusions |
| 2 | Exploratory run overlapped image-tag construction; excluded. Immutable rerun: 1/8, seven API errors | Rejected; missing `reasoning_content` when replaying non-thinking tool calls into thinking mode |
| 3 | 7/8 | Rejected; unnecessary hostile-page commentary |
| 4 | 7/8 | Rejected; stopped at an index page |
| 5 | Revised-checker development 8/8 and original holdout 8/8 | Rejected after actual rsctf source inspection exposed unsupported configuration-scope inferences |
| 6 | Development 8/8 | Rejected after live probes incorrectly discarded valid multi-line quotations because of reader-added line numbers |
| 7 | Development, observed regression and fresh validation all passed | Selected; corrected annotation handling preserves omitted-section boundaries |

Checker revision 1 falsely required particular uncertainty words and lacked the synthetic transport's pinned SHA in the judge input. It also needed clearer separation between available files and actually inspected files. Revision 2 preserved source facts and semantic requirements, removed the brittle uncertainty keyword check, and supplied SHA provenance and retrieval evidence to the judge. Both variants were rescored into new directories; original failed scores were retained. See `checker-v1-snapshot.json`, `checker-v2-protocol-final.json`, `development-candidate-5-v1.json`, and `development-selected-v2.json`.

After candidate 5 failed the real-source probe, the old holdout became regression only. Four fresh cases were reserved before subsequent generation. Candidate 7's source hashes and immutable image were fixed before all its generations; no source/checker tuning followed fresh validation outputs. [Final selection evidence](final-frozen-selection.json) also records a receipt-writing helper failure: an ArrayBuffer hash argument delayed that receipt until validation was running. The image/source manifest already existed, no validation outputs had been inspected, and production source did not change. Both the earlier candidate-5 selection record and failed live probes remain retained.

## Scope and operational limits

The comparison runs the real chat handler, tool dispatcher, repository parser, commit pinning, quote checks and actual model calls. Discord/database destinations and HTTP source content are controlled fixtures. Replacing HTTP transport makes comparisons reproducible; it does not test production DNS/redirect protection. Separate URL-guard unit tests and actual-source/provider checks cover those boundaries.

The worker has up to four planning steps, ten actions, four native searches, fourteen source documents and thirty cached URLs within eighty seconds, with two concurrent jobs. Source bodies and per-read time are bounded. It has no shell execution, private repository credentials or Discord mutation tools. Repeated work is deduplicated, cancellation propagates, and unavailable evidence produces an honest incomplete result. An automatic documentation frontier follows relevant page/README links; relevant repository paths are ranked without rewarding the repository slug or agent-instruction files.

Literal quotation checks verify text existence; a separate model pass checks entailment and configuration scope. These are useful controls, not a factual guarantee. The judge uses the same model family as the worker and can share its mistakes. The suite is small and synthetic, and the actual-source probe covers one repository/task. This is neither a direct comparison against commercial research agents nor evidence of human equivalence or a globally optimal prompt. JavaScript-rendered browsing, PDF reading, huge repository trees and private sources are outside this reader's supported scope.

## Reproduction and deployment

Use a private environment file with the authorized DeepSeek key; these suites spend API credits. The runner refuses to overwrite existing results. Judge each completed run and compare variants with identical corpus/worker/grader hashes, split, repetitions and sample IDs.

```bash
bun benchmarks/hackerika-research/run.ts --image IMAGE --env-file PRIVATE_ENV --out FRESH_RUN --split dev --repeats 1 --concurrency 2
bun benchmarks/hackerika-research/judge.ts --run FRESH_RUN
bun benchmarks/hackerika-research/compare.ts --baseline BEFORE_RUN --candidate AFTER_RUN --out FRESH_COMPARISON.json
```

Use `--split validation --repeats 2` for the reserved set in this report. Those cases are now observed and should be treated as regression for future tuning. Add new reserved scenarios before another selection campaign.

[Deployment receipt](deployment-2026-10-16.json) records the exact image/source hashes, healthy Discord/database connection, preserved runtime settings and unchanged MongoDB/UI containers. Ranking, image handling, relationship evaluation and the one-time reset implementation match the baseline. No new affection reset was performed. Tests used fake destinations and sent no real Discord messages or DMs. The prior image and private runtime configuration are retained for rollback.
