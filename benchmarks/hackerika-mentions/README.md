# Discord mentions and conversational references — 2026-10-17

Hackerika now retains the public identity behind an explicit Discord tag, including people who have not spoken, people absent from the member cache, and tags inside a replied-to message. Source message IDs and speaker ownership accompany recent tags so follow-ups can distinguish the speaker, the person being discussed, and the bot being summoned. Ambiguous targets require clarification; tags and jokes are not evidence of misconduct.

## Changes

- Resolve identities from Discord user/member payloads before requesting missing members. Preserve known names during lookup failures; cap one batch at ten IDs and three seconds.
- Retain bounded identity snapshots in channel memory and the existing short-lived channel cache. Include tagged identities in reply context independently of the reply author's identity.
- Supply current/recent tag source IDs, author IDs and same-speaker attribution. First-person words in a user message belong to that speaker; “kamu/Rika” and explicit corrections can change the target.
- Record empty mention lists on untagged turns. Strip backend speaker labels when interpreting legacy memory so an author's ID never becomes an invented tag target.
- Keep identity metadata out of provider message properties, assistant speech and profile transcript text. Preserve role/implicit-reply distinctions and channel boundaries.

Production changes are limited to seven files: `mentions.ts`, `memory.ts`, `cache.ts`, `context.ts`, `chat.ts`, `vision.ts` and `persona.ts`. Existing research worker/source-reader/search implementations, relationship evaluation/reset code and ranking commands are inherited unchanged from the live baseline image.

## Final matched evaluation

The suite uses actual `handleAIChat` and live DeepSeek calls with synthetic Discord user/member payloads, fake destinations, channel cache and clean memory. It does not send real messages/DMs or write live profiles. Required identities and metadata boundaries receive deterministic checks; a blind model judge checks the conversational answer. A pass requires both checks. Gates require at least 90% correctness, no regression, zero critical final failures and no unresolved execution/judge errors.

| Set | Design | Before | Candidate 3 |
| --- | --- | --- | --- |
| Development | 6 scenarios × 1 | 3/6 | 6/6 |
| Observed regression | 8 scenarios × 1 | 7/8 | 8/8 |
| Fresh reserved validation | 2 new scenarios × 2 | 0/4 | 4/4 |
| Total | 16 unique scenarios; 18 trials per variant | 10/18 | 18/18 |

See [development](release-dev-comparison.json), [regression](release-regression-comparison.json), [fresh validation](release-validation-comparison.json), [aggregate report](final-report.json), and [frozen release source/checkers](release-frozen-selection.json). Final fresh cases cover identity after several untagged follow-ups and distinguishing the current speaker, their tag target and a bystander. Their outputs were not used for further tuning.

The exact production “bukan confess” wording was not reproduced in the controlled replay. The underlying missing-identity path was reproduced for direct tags, quoted tags and a silent target absent from the member cache. Backend changes and focused three-turn tests establish the data/provenance repair; the model still interprets conversational meaning.

## Retained selection history

| Candidate | Observation | Disposition |
| --- | --- | --- |
| 1 | Development 12/12 versus 6/12; original reserved set 7/8 versus 8/8 | Rejected: one ambiguous-reference reply described the bot's own intended meaning instead of clarifying the caller's target |
| 2 | New matched development 6/6, observed regression 4/4 and four newly reserved scenarios 8/8 | Rejected after source audit: a third untagged turn could falsely extract the backend speaker label as a user tag |
| 3 | Corrected legacy extraction and explicit empty lists; final three sets 18/18 | Selected after fresh validation and deterministic provenance checks |

The original internal two-candidate cap was extended to three before candidate-3 generation because a reproducible metadata defect remained. `protocol.json`, `protocol-v2.json` and `protocol-v3.json` retain the reasons, resource bounds, corpus changes and fresh-set policy. Earlier reserved sets became observed regression once their failures informed a revision. Earlier candidate selection records and all failed runs remain available.

Three candidate-3 regression judge executions failed initially. A separate minimal provider diagnostic succeeded; the cause of the original failures was not captured. Only those three failed executions were retried once, with the same rubric, unchanged primary outputs and no replacement of valid pass/fail judgments. Both the original failed judgments and the successful retry audit remain under `runs/candidate-3-regression-v3` and `runs/candidate-3-regression-v3-retry`. No primary answers were regenerated for that retry.

The model judge is imperfect: some baseline judgments accept an unknown-name answer despite a known payload identity, and another incorrectly criticizes valid bot self-identification. Deterministic required-name checks independently reject those lookup failures. Critical counts include failed task requirements and should not be interpreted as a hallucination rate.

## Other verification and limits

The final source passed **341 local tests, 0 failures, 1,054 assertions across 34 files**. Eight mention tests cover explicit versus implicit tags, payload-only/DM identities, fresh guild identities, bounded lookup, hostile display names, cached names and channel isolation, provider/profile boundaries, and three-turn persistence. The expanded three-turn test failed before the speaker-label fix and passed afterward. Scoped strict TypeScript checks and the Bun application build passed.

On the final image, the existing capability smoke passed 3/3: technical CTR correctness, native delivery bookkeeping and a native image supplied through a reply. The two model answers passed semantic judging; the backend case passed deterministic checks.

The additional research smoke passed 2/2 deterministic checks and 1/2 model judgments. The first-blood answer gives the correct direct-webhook configuration, but reads incomplete documentation and adds unnecessary uncertainty about unasked payload details. Actual retrieval also disproves the judge's claim that the organizer guide had been read: available fixture files are not inspected files. The original judgment remains unchanged, and this is retained as a **partial** auxiliary result rather than reported as 2/2. See [retrieval audit](research-smoke-review.json). This patch does not establish improved general research accuracy.

The benchmark is small, synthetic and model-judged; it is not a production accuracy estimate or proof of perfect social understanding. Unknown-tag replies may still use technical wording or overstate earlier participation. The deterministic repair provides identity and source ownership; source interpretation and natural phrasing remain model-dependent.

## Reproduction and deployment

Live model suites spend API credits. Use a private authorized environment file; the runner refuses to overwrite previous runs.

```bash
bun benchmarks/hackerika-mentions/run.ts --image IMAGE --env-file PRIVATE_ENV --out FRESH_RUN --split dev --repeats 1 --concurrency 2
bun benchmarks/hackerika-mentions/judge.ts --run FRESH_RUN
bun benchmarks/hackerika-mentions/compare.ts --baseline BEFORE_RUN --candidate AFTER_RUN --out FRESH_COMPARISON.json
```

The current `holdout` split contains observed regression cases; `validation` contains the final two reserved cases, now also observed. Future tuning needs new reserved inputs. `retry-judge.ts` creates a separate directory and only retries failed judge executions; it never changes primary generations or valid judgments.

[Deployment evidence](deployment-2026-10-17.json) records the exact image/source hashes, runtime and health checks, preserved MongoDB/UI containers and unchanged affection-reset marker. Private runtime configuration and the original image are retained for rollback.
