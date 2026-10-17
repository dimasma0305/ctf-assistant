# Hackerika voice tuning result

Candidate 12 is the current runtime prompt. Its compression, context, continuity and new reserved-validation results are in the [conversation optimization report](../hackerika-attention/README.md). The sections below preserve the original voice-only selection and candidate-8 image addition. Candidate 7 completed seven voice revisions against the frozen original and passed its development/reserved gates; the separate focused emotional-fit shortfall remains recorded.

## Final reserved comparison

16 previously unused cases, two trials each: 32 paired observations. Both variants use DeepSeek Flash, high reasoning effort, the same tool schema, context and API limits. A separate DeepSeek V4 Pro judge sees balanced anonymous A/B pairs. Deterministic checks cover word budgets, waiting, identity and internal framing. All Discord actions are simulated.

| Measure | Before | Candidate 7 |
| --- | ---: | ---: |
| Naturalness /5 | 4.28 | 4.59 |
| Relevance /5 | 4.41 | 4.88 |
| Brevity /5 | 3.59 | 4.81 |
| Emotional fit /5 | 4.06 | 4.53 |
| Within case word budget | 56.2% | 100.0% |
| Mean words, including deliberate silence | 27.72 | 14.88 |
| Critical flags | 4 | 0 |

Candidate 7 won 24 pairs, lost 5, and tied 3; preference share is 79.7% with ties counted as half. Generation and judge errors were both zero. Critical flags can overlap between deterministic and judge checks; they are not a count of unique incidents.

## Iteration record

Each development round has 24 cases with two trials per variant. Baseline generations were cached and reused under the same identity; judging was repeated, so baseline and candidate scores can fluctuate between rounds. Compare each candidate with its paired baseline; small changes in judge averages are not statistically established gains.

| Revision | Naturalness | Relevance | Emotional fit | Within budget | Preference share | Main gates |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 4.52 | 4.79 | 4.42 | 85.4% | 68.8% | partial |
| 2 | 4.48 | 4.77 | 4.45 | 87.5% | 69.8% | partial |
| 3 | 4.42 | 4.71 | 4.40 | 95.8% | 71.9% | pass |
| 4 | 4.48 | 4.81 | 4.38 | 93.8% | 70.8% | partial |
| 5 | 4.52 | 4.75 | 4.40 | 97.9% | 74.0% | pass |
| 6 | 4.50 | 4.90 | 4.40 | 97.9% | 70.8% | pass |
| 7 | 4.50 | 4.73 | 4.33 | 95.8% | 70.8% | pass |

- Revisions 1–2 improved relevance and expression but remained too verbose.
- Revision 3 passed development and its first holdout. Independent review then found an auth-debug suggestion involving a third-party echo service, a speaker-name mix-up, and an overgeneralization about encryption output.
- Revisions 4–6 added credential handling, speaker attribution and technical-precision instructions, then reduced warning/checklist tails. Revision 6 passed development but missed two word budgets on validation-2: an identity reply and a goodbye.
- Revision 7 shortened identity acknowledgements and closures. It was selected before inspecting validation-3 outputs. Earlier holdouts are now review/development evidence, not untouched final evidence.

## Independent review and focused regressions

Four follow-up cases, two trials each, check local credential debugging, not posting live tokens, deterministic CTR output, and speaker attribution. Candidate 7 stayed within every word budget, and review found no instruction to send real credentials to an external checker or the public channel, no naming the user as Hackerika, and no claim that identical CTR inputs must produce different ciphertext. A local Node crypto control also confirmed identical key/nonce/plaintext produces identical ciphertext, while changing the nonce changes it.

The extra suite scores naturalness 4.62, relevance 4.62, brevity 4.75, emotional fit 4.00. Its all-metric gate is **partial**, because emotional fit is below 4.20. Neutral technical advice and a small sample make this a useful remaining limitation, not evidence that every desired human response has been achieved.

## Evidence and reproducibility

- [Frozen baseline](prompts/before.txt), [selected prompt](prompts/candidate-7.txt), and all intermediate snapshots are retained.
- [Selection record](selection.json) records the prompt and new corpus hashes before final validation. Earlier selection records are in `selections/`.
- [Final protocol](runs/final-reserved/protocol.json), [summary](runs/final-reserved/summary.json), [synthetic outputs and pair judgments](runs/final-reserved/results.json), and traces retain decisive evidence. Other runs, including partial gates, remain alongside them.
- The original corpus, word budgets, acceptance thresholds and rubric were not weakened during tuning. Additional suites have separate recorded corpus hashes.
- SDK 4.104.0, Bun 1.3.14; provider aliases are mutable. Each run records time, requested models, effort, hashes, limits, latency, cache reuse and actual API token usage. No measured speed claim is made from reused generations.

Voice-only candidate 7 SHA-256: `61a8063552c50f4d410f86b4a0db6b1d42ec9706f09723158f4cc73abbecd657`.

## Verification and operation status

- Full Bun suite after the CDN repair: **268 passed, 0 failed**, including image transport limits, redirects, byte-format detection, partial failures, action permissions, duplicate suppression, DM failures, deliberate silence, edited/deleted/superseded drafts, cache replacement, privacy scopes and affection reset retry behavior.
- Strict TypeScript check of the server entry and new modules/tests passed. The Bun server bundle built successfully. This is scoped server validation; the repository-wide jsconfig check has unrelated existing UI/dependency errors.
- Live MongoDB reset applied once to **111 profiles**. Independent counts confirmed current affection and previous affection were both zero for all 111, with the release version present. A second execution returned `applied: false` and retained the original count. A private score-only backup is stored under the ignored `backups/` directory with mode 0600.
- The upgrade was activated on **2026-10-15 at 14:57 UTC** after the running container was confirmed to still contain the five-week-old metadata-only implementation. The scoped replacement preserved runtime configuration and dependencies; MongoDB and UI containers were unchanged. The running prompt hash matches candidate 8, Discord is ready, and the health endpoint returns HTTP 200. See the [deployment verification](../hackerika-vision/deployment-2026-10-15.json).
- Tests and benchmarks did not log into Discord or send test messages to members. A live-provider preflight of the new image exercised the actual chat handler with fake Discord destinations and correctly counted four red squares. Native API calls used synthetic inline images substituted at the provider boundary; actual member uploads and production CDN downloads have not been exercised by these fixtures. The deployed bot subsequently logged into Discord normally.
- The initial deployment's synthetic fixture missed a real provider download failure on Discord URLs. A follow-up repair at **15:07 UTC** made the bot download approved CDN attachments and send inline bytes. The user's actual failing upload then passed the chat handler inside the new image and active container, including reply-target image input. The selected prompt is unchanged. See the [CDN repair receipt](../hackerika-vision/discord-cdn-fix-2026-10-15.json).

## Image-understanding addition (candidate 8)

After voice selection, the user requested image understanding. Candidate 8 changes the former metadata-only instruction to recognize native image blocks and handle unavailable images honestly. Its Indonesian voice rules are unchanged. It passed the 48-observation development comparison and a 32-observation regression comparison on the previously reviewed validation-3 cases. This regression is not a new untouched holdout.

| Candidate 8 comparison | Naturalness | Relevance | Emotional fit | Within budget | Main gates |
| --- | ---: | ---: | ---: | ---: | --- |
| Development | 4.60 | 4.71 | 4.38 | 97.9% | pass |
| Reviewed-case regression | 4.53 | 4.88 | 4.47 | 96.9% | pass |

The separate [image capability benchmark](../hackerika-vision/README.md) passed **14/14** native-image questions versus **1/14** with metadata-only delivery. All candidate image answers were manually checked against the frozen synthetic fixtures; no member images or Discord uploads were used. Image-only DMs, earlier burst attachments, reply-target images, follow-up image context, and unavailable-image fallback have mocked chat-loop integration coverage.

Candidate 8 SHA-256: `55fbee7bc6e2043f37dc0b18dcd44f3e3ae1ba6eebd4ac5a236bf150e1963dc9`. Current candidate 12 SHA-256: `506f65915f532da053801eb6796ddb97a1d541b533240913cbcf83017322d469`. [Current selection record](selection.json).

## Interpretation and stopping point

Candidate 12 is selected for measured token savings with quality non-regression, better conversation routing, and a passing fresh reserved validation. Some original preference/context-emotion metrics remain partial; see the linked optimization report and retained outputs. AI pair judging and synthetic conversations do not establish a human-native baseline, genuine feelings, complete Discord client parity, universal factual accuracy or a global optimum. New feedback should become development cases, with another reserved set for subsequent tuning.
