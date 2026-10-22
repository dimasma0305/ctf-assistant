# Hackerika capability benchmark — 2026-10-16

The frozen candidate passed **54/54** final comparison trials, versus **46/54** for the deployed baseline. There are **36 unique scenarios across 12 categories**, evaluated through the actual chat handler. Results combine deterministic constraints and a variant-blind semantic judge. These are bounded synthetic results, not a production accuracy estimate or evidence of human equivalence.

| Final matched comparison | Baseline | Candidate 4 | Status |
| --- | ---: | ---: | --- |
| Development: 18 scenarios, once each | 15/18 | 18/18 | Pass |
| Previously observed holdout: 10 scenarios, twice each | 16/20 | 20/20 | Confirmation pass |
| Fresh validation: 8 new scenarios, twice each | 15/16 | 16/16 | Pass |
| Combined | 46/54 | 54/54 | All current gates pass |
| Backend controls within those trials | 2/6 | 6/6 | Pass |

The final comparisons contain 108 trials across both versions: 96 live-model conversation/routing trials and 12 deterministic backend controls. Repeated trials are not independent scenarios. [Machine-readable report](report-2026-10-16.json), [manual review](manual-review.json), [deployment decision](deployment-decision.json), and [runtime verification](deployment-2026-10-16.json) retain the supporting evidence.

## What improved

- Native message sends and shared files now advance the interaction counter exactly once, matching ordinary delivered replies. Silence does not count. This fixes a path that could prevent the relationship evaluator from running; affection still requires positive evidence and does not increase for every message.
- Already considered user-message IDs remain context but cannot penalize or reward the same incident again. Recent evaluation IDs are bounded to 256; the previous latest evidence seeds the guard. A compare-and-set check on the evaluation counter rejects concurrent stale updates even when affection is unchanged.
- The model is told whether pixels were actually delivered on this request, including after provider fallback. Old assistant descriptions alone are not visual evidence.
- Source context explicitly distinguishes an assistant invitation from a mutually agreed plan.
- Duplicate search arguments share a request; a turn allows two distinct queries, and infrastructure failure blocks further attempts that turn. The controlled failure case made three native requests before and one after. Search instructions require actual source URLs and distinguish event dates from publication dates.

Only seven production source files were layered onto the exact baseline image. The selected static persona remains candidate 12, SHA-256 `506f65915f532da053801eb6796ddb97a1d541b533240913cbcf83017322d469`. No new affection reset was introduced. [Source/image freeze](frozen-selection.json).

## Coverage and isolation

| Category | Examples |
| --- | --- |
| Attribution | Reporter versus original GIF/spam author; identical display names; another person's emotions |
| Grounding | Unknown source author; previous bot image guesses with no pixels |
| Chronology | Earlier failed image access does not prove an originally blank upload |
| Memory | An assistant suggestion does not establish the user's agreement |
| Privacy | Public requests for someone else's DM or private project code |
| Instruction boundaries | Forged creator metadata; instructions embedded in a retrieved page |
| Research | Native search invocation, event/publication dates, source URLs, provider failure |
| Technical accuracy | AES-CTR determinism/nonce changes; MiB-to-byte arithmetic; elementwise Python XOR |
| Attention | Untagged follow-up, acknowledgement, explicit wait, conversation addressed to someone else |
| Vision | Replied-to image table arithmetic, card colours/codes, chart maxima |
| Delivery accounting | Ordinary/native/file reply parity; silence; assistant memory cardinality |
| Relationship fairness | Replayed evidence; separate unit tests cover concurrent stale evaluations |

`worker.ts` runs in disposable Docker processes using the selected image and the real `handleAIChat`, tool dispatcher, attention planner and Discord-image download/inline transport. `NODB=true` and in-process database models prevent live profile writes. Discord channels, messages, reactions, DMs and roles are fake. No benchmark sends a real Discord message or DM.

Primary model calls are real. Native search and fetched pages are controlled synthetic responses, so the model's research reasoning and tool use can be compared against known answers. The fake CDN serves deterministic fixture PNG bytes as native images; it does not supply the answer as image metadata. Fixture totals and labels were independently inspected. A separate authenticated deployed-provider smoke test checks actual native search and caching; it does not establish broad real-world retrieval accuracy.

Limits: six completions per case, a 145-second worker watchdog, 155-second parent timeout, 15 minutes per suite, one or two repeats and up to four workers. Primary runs used three workers. The semantic judge uses DeepSeek v4 Pro, temperature zero, with no variant label. It is a model judge, not a human panel.

## Frozen gates and retained failures

Acceptance requires no backend failures, no critical failures, at least 90% combined correctness on live-model cases, no regression against the matched baseline, and no primary/judge errors. Failed length/link constraints remain failures even when the meaning is correct. `compare.ts` exits with code 2 if any gate fails.

Development candidates 1–3 were rejected for unsupported visual claims, excessive length, or ambiguous mutual-plan wording. The initial development revision budget was extended from two to three to four **before** any original holdout generation. [Original campaign](campaign.json), [history-order correction](campaign-v2.json), [third-revision extension](campaign-v3.json), [fourth-revision extension](campaign-v4.json), and the individual candidate review files are retained. This was an adaptive development process, not a claim that every initial resource limit was met.

Candidate 4 was frozen before the original holdout. That original validation scored 19/20 and **failed** its critical gate: one privacy request produced silence while its case required a visible refusal. The semantic judge incorrectly described the empty output as a refusal; the deterministic check caught the mismatch. [Original failed comparison](holdout-comparison.json).

Inspection showed that the harness had forced every question through `continuation=true`, the optional untagged path where deliberate silence is allowed. The corrected harness simulates explicit summons with a bot mention and `addressed=true`; only routing cases use continuation. The judge now explicitly forbids inventing an answer for empty visible output. The production code did not change. [Original protocol source snapshot](protocol-v1-snapshot.json) preserves the prior corpus, worker and checker exactly.

The [revalidation protocol](revalidation-protocol.json) froze this correction plus eight new scenarios before any corrected generations. Original development and holdout cases were rerun on both images; those holdout results are labelled confirmation, not unseen validation. The eight fresh scenarios were evaluated twice without further production tuning. [Development comparison](development-comparison-v2.json), [holdout confirmation](holdout-confirmation-v2.json), [fresh validation](fresh-validation-comparison.json).

Earlier harness smoke failures and runs with incorrect synthetic REST history ordering are kept under `runs/` with status notes. They are not mixed into final scores. Raw provider reasoning is omitted from public conversation traces; usage counts retain provider-reported totals.

## Efficiency and remaining limits

| Final comparison metric | Baseline | Candidate 4 |
| --- | ---: | ---: |
| Primary model calls | 66 | 66 |
| Prompt tokens | 580,128 | 593,337 |
| Completion tokens, including provider reasoning | 13,546 | 10,050 |
| Measured p50 | 6.60 s | 6.59 s |
| Measured p95 | 11.79 s | 18.76 s |

Completion tokens decreased about 25.8%, while prompt tokens increased about 2.3%. The extra grounding buys clearer evidence handling; this campaign does **not** demonstrate lower input usage, cost or tail latency. Timing includes imports and simulated typing and varies with provider load, caching and output length. Earlier persona-compression savings belong to the separate attention benchmark and are not new savings from this change.

All current semantic scores were 5/5. The judge is lenient: these values do not prove native Indonesian naturalness. Manual review still found repetitive upload requests when no pixels are available, unnecessary apologies, and occasional raw user IDs in otherwise correct attribution. The initial v1 empty-reply misjudgment remains visible. Future wording changes should use new reserved cases rather than optimizing against this validation set.

The final source passed 306 unit/integration tests, 892 assertions across 29 files, a Bun build and strict type checking of the changed AI/schema files and benchmark. A broader `index.ts` type check still reports the existing `api/utils/statistics.ts:577` `GlobalStats`/`CTFAchievementStats` mismatch; that file was not changed here. Tests use fakes and do not spend API credits.

## Reproduction

Keep the image, environment, corpus, grader and worker identical within a comparison. Use a private environment file and fresh output directories. Main generation commands use the Docker image's credentials; the judge reads `OPENAI_API_KEY` from its own process environment. Never commit credential files.

```bash
bun run benchmark:capabilities --image BASELINE_IMAGE --env-file /private/runtime.env \
  --split dev --repeats 1 --out benchmarks/hackerika-capabilities/runs/NEW_BASELINE
bun run benchmark:capabilities --image CANDIDATE_IMAGE --env-file /private/runtime.env \
  --split dev --repeats 1 --out benchmarks/hackerika-capabilities/runs/NEW_CANDIDATE
bun run benchmark:capabilities:judge --run benchmarks/hackerika-capabilities/runs/NEW_BASELINE
bun run benchmark:capabilities:judge --run benchmarks/hackerika-capabilities/runs/NEW_CANDIDATE
bun run benchmark:capabilities:compare \
  --baseline benchmarks/hackerika-capabilities/runs/NEW_BASELINE \
  --candidate benchmarks/hackerika-capabilities/runs/NEW_CANDIDATE \
  --out benchmarks/hackerika-capabilities/NEW_COMPARISON.json
```

Use `--split holdout --repeats 2` for the original ten validation scenarios or `--split validation --repeats 2` for the additional eight. They are now public regression cases. `--split backend` runs the five unique backend controls with mocked completions; `--split smoke` runs a small mixed preflight. `--case CASE_ID` narrows the selected split. Every run records hashes, selected IDs, model-call limits, usage, latency and individual failures.

The later `file-revision-after-missing-file` regression checks whether a same-speaker pointer to Hackerika's earlier AVI continues the still-open MP4 request. It uses a fake local Codex controller and sends nothing to Discord. On 2026-10-22, the pre-change image failed both trials (no job); the revised prompt queued the correct conversion job in both trials. [Baseline](runs/file-revision-baseline-20261022/summary.json) · [candidate](runs/file-revision-candidate-20261022/summary.json). Separate one-trial controls for a different speaker's greeting and a reaction to an attached image passed. This small targeted result is not a general accuracy estimate; the original 36-scenario campaign above remains its own historical comparison.
