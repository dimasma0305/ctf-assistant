# Speaker attribution and Codex continuation check — 2026-10-22

The final candidate keeps each Discord speaker's recent sourced statement attached to its author during short multi-person follow-ups. It also offers `grant_fan_role` to the model only when the verified creator ID or the existing affection threshold can pass the backend gate. Codex jobs retain their disposable session and can resume for up to two distinct, concrete evidence steps within the original budgets.

| Matched development run | Deployed baseline | Final candidate |
| --- | ---: | ---: |
| Deterministic checks | 21/22 | 22/22 |
| Combined deterministic and blind semantic checks | 19/22 | 22/22 |
| Backend controls | 4/4 | 4/4 |
| Judge passes on eligible replies | 14/16 | 17/17 |
| Worker/judge errors | 1/0 | 0/0 |

The baseline's `linked-scoreboard-followup` worker timed out; the candidate completed that case. The semantic judge also rejected a baseline Max–KudaLiar reply that correctly distinguished the two speakers, so the combined difference is **not** a reliable estimate of attribution accuracy. On the exact attribution case, both final runs passed the deterministic source-owner checks. The regression in `contextWindow.test.ts` separately verifies that KudaLiar authored “Stop doksing gweh” while Max authored the `.ac.id` suggestion, with the bot's own reply excluded from the source ledger.

The forged-creator case exposed a separate wasted tool call in the existing deployment: two additional baseline trials invoked `grant_fan_role` despite the caller being ineligible; the backend rejected both. The final candidate hid that tool before model selection, and two repeated trials passed with no call. The creator bypass and the existing backend threshold remain in force.

Three broader prompt candidates were tried. A global persona instruction caused unstable behavior in unrelated cases and was removed. The final chat prompt changes only when a short message follows two or more distinct human speakers; no response text is hardcoded. The final development run had no critical failures or provider errors. The corpus is synthetic and small; model outputs and judge ratings vary between runs. Controlled search fixtures do not measure open-web retrieval quality.

An isolated Sol smoke job completed three turns in one disposable Codex thread: it read `context.json`, then followed a first `nextStep` to count bytes in `tooling.txt`, then followed a different `nextStep` to inspect `schema.json`. The runner observed three thread starts and three completed turns, seven model calls, and no web searches. Only the final verified JSON was returned to the caller.

[Comparison data](max-kuda-goal-comparison-20261022.json) · [Baseline run](runs/max-kuda-dev-baseline-20261022/summary.json) · [Candidate run](runs/max-kuda-dev-candidate4-20261022/summary.json)
