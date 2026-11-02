# Indonesian support conversation review — 2026-11-02

Candidate 7 is a narrow voice change, selected after reviewing seven prompt variants. It lets Hackerika respond warmly when a person asks for help while worried, instead of treating every emotional message as a one-line reaction. Everyday wording, concise closures, speaker continuity, and evidence-limited reassurance are the intended behavior. Replies remain model-generated; there are no keyword-triggered canned responses.

This is **not a clean benchmark win across every suite**. Development support examples improved, while some validation replies became slightly repetitive. Two final suites missed their preference gates. The narrow change was selected after inspecting the actual outputs, with those limitations retained below, rather than claiming that the prompt is universally optimal.

## Implementation

- `src/Services/AI/indonesianVoice.ts`: ordinary spoken Indonesian; permission to answer the substance of a worried question; short, warm endings without reopening a resolved problem; no forced slang, emoji, or generic empathy opening.
- `src/Services/AI/persona.ts`: distinguish lack of evidence from certainty; preserve what a number/object refers to; request redaction of login QR/codes when asking for verification screenshots; greet a new speaker without retelling someone else's problem.
- Existing technical-detail guidance, model routing, tool permissions, and persistence are unchanged. This does not add a new case-memory store or fix response latency.

Baseline: source revision `9c9bf21`, snapshot `prompts/support-20261102/before.txt`, SHA-256 `5c024068edc960c7b2984075b49ab85cd239931bf6c5849bd3c03be8fa2e4b10`.

Selected snapshot: `prompts/support-20261102/candidate-7.txt`, SHA-256 `1f780356ff2dd2992ee97c1221145f8173aabd833ebf4d26a02321303af70f6e`.

System prompt length increased from 31,671 to 32,786 JavaScript string units (+1,115, about 3.5%). No extra inference or routing call is introduced at runtime. This change is aimed at conversational quality, not prompt-size reduction.

## Evaluation method

`supportCases.ts` contains 19 synthetic fixed-history scenarios: seven development examples, six original holdout examples later used as regressions, and six reserved examples. Cases cover worry/self-blame, uncertain number ownership, interleaved speakers, correcting an unsupported claim, phishing evidence, technical explanations, grief, relief, and explicit requests to wait. There are no real member IDs, phone numbers, credentials, or account screenshots in these fixtures.

The runner uses the full system prompt and tool definitions, but simulates all tool execution. Nothing is sent to Discord and no production relationship data is changed. The generator uses the configured ChatGPT adapter with low reasoning effort. An anonymized A/B judge uses `gpt-6.1-sol`; this is model judging, not a human study or an independent model-family assessment. A/B order alternates. One generation per case/variant/model was used; repeated candidate runs reuse successful generations by identity hash and obtain new judgments.

Before the release runs, the judge payload was corrected to include the same current-speaker context as the generator. Without it, an earlier judge incorrectly treated the known speaker name Rafi as invented. Earlier results are preserved but are not directly comparable to release judgments.

The reserved set was written before observing candidate-5 validation results and first run against candidate 6. Candidate 7 adds a speaker-greeting clarification based on the older regression set. Reserved cases were rechecked, so this is not a claim that the final selection has a completely untouched holdout. The reserved preference threshold of 50% was set before its first run; development/regression retain the existing 60% threshold. No threshold was changed after a failing release result.

## Final results

Scores are judge averages out of 5, shown as baseline → candidate. Preference counts a tie as half a win. All completed final judgments had zero critical flags, and all final generations stayed inside their case word budgets. These checks do not prove absence of errors outside the sample.

| Run directory under `runs/` | Generator | Cases | Naturalness | Relevance | Emotional fit | Preference | Overall gate |
| --- | --- | ---: | --- | --- | --- | ---: | --- |
| `support-release-dev-20261102` | gpt-6.1-sol | 7 | 5.00 → 4.86 | 4.57 → 5.00 | 4.43 → 5.00 | 71.4% | Passed |
| `support-release-regression-20261102` | gpt-6.1-sol | 6 | 5.00 → 5.00 | 5.00 → 5.00 | 4.83 → 5.00 | 58.3% | Below 60% preference gate: one win, five ties |
| `support-release-validation-general-20261102` | gpt-6.1-sol | 6 | 4.83 → 4.83 | 5.00 → 5.00 | 4.83 → 4.83 | 41.7% | Below 50% preference gate: one win, three ties, two losses |
| `support-release-validation-security-20261102` | gpt-5.6-sol | 6 | 5.00 → 4.80 | 4.60 → 5.00 | 4.80 → 4.80 | 40.0% | Incomplete: one judge request returned `server_is_overloaded`; scores cover five cases |
| `support-release-validation-security-retry-20261102` | gpt-5.6-sol | 6 | 4.83 → 5.00 | 4.67 → 5.00 | 4.67 → 4.83 | 66.7% | Passed on rejudging the same cached outputs |

The retry was made because of the judge service error. Its changed preferences on identical answers show judgment variance; it is not independent evidence that response generation improved. Both results are retained. Likewise, naturalness did not improve numerically on the general-model release sets. The clearest measured gain is relevance/emotional fit in the development support cases, not an across-the-board style score increase.

Manual review found the general validation losses understandable: one response restated the earlier file scare after the user was already relieved, and another added unnecessary advice after alternate SMS verification had succeeded. Both were factually cautious, but the old replies were tighter. These remain known style limitations.

Representative generated closure from the development set:

> nggak ganggu kok, fi. syukurlah sekarang udah tenang 🥹

Representative correction:

> iya, belum ada sumbernya. aku tadi keliru bilang nomor itu resmi tanpa verifikasi.

These are recorded model outputs, not strings inserted into production reply handlers.

## Iteration record and checks

All intermediate snapshots and `support-*20261102` run records are retained, including failures. Broad early revisions produced unnecessarily long technical explanations; some gpt-5.6 variants gave unsupported reassurance. Those were rejected. Candidate 6 restored the original technical-detail guidance and narrowed the support instructions; candidate 7 adds the new-speaker clarification.

The focused runtime tests passed: **62 tests, 164 assertions, zero failures**, covering `chat.social`, `attention`, `output`, `turnGrounding`, and `modelRouter`. These tests were run after candidate 6. The final additional persona sentence was exercised in the candidate-7 model regression (`support_new_speaker`), and the complete prompt export succeeded. There are no tests that merely assert the presence of new prompt wording.

Cached baseline latency appears as zero in run summaries; it is not actual response time. No latency improvement is claimed. This is API-only fixed-history evaluation, not a live Discord end-to-end test, a longitudinal conversation study, or a guarantee that every spontaneous reply will be natural.

## Reproduction

Use the repository's existing authenticated provider configuration; do not put credentials in arguments or artifacts. For example:

```bash
AI_PROVIDER=chatgpt CHATGPT_REASONING_EFFORT=low bun benchmarks/hackerika-voice/run.ts \
  --suite support --split dev --model gpt-6.1-sol --judge-model gpt-6.1-sol --effort low \
  --baseline benchmarks/hackerika-voice/prompts/support-20261102/before.txt \
  --candidate benchmarks/hackerika-voice/prompts/support-20261102/candidate-7.txt \
  --out /tmp/hackerika-support-review --max-calls 80 --max-minutes 15 --concurrency 2
```

Use `--suite support --split holdout` for the original regression set, and `--suite support-reserved --split holdout` for the reserved set. The latter was also run with `--model gpt-5.6-sol`. Choose a fresh output directory for each run. Successful generations are cached; increase `--repeats` (up to 3) to request additional trial identities. Inspect `summary.json.passed` and judge errors: the runner's process exit status alone does not indicate a passed quality gate.
