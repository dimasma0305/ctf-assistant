# Relationship evaluation regression, 2026-10-28

The reported profile reached interaction 529 and reset its evaluation counter, but affection stayed at 3. A read-only replay reproduced unchanged judgments. The first prompt-only calibration passed simple cases but still failed the full profile replay: its short decision said no fresh messages were available even though five eligible user turns were present. Interleaved `contextOnly` history was being generalized to the entire transcript.

Production now supplies `newExchanges` separately from three prior exchanges and all five explicit numeric baselines. The shorter prompt permits small evidence-backed growth without rewarding empty greetings or point farming. Invalid/incomplete responses no longer consume the batch. Valid unchanged responses clear stale Δ and are distinguishable from failures on the board.

| Check | Before | Final candidate |
| --- | --- | --- |
| Full reported-profile replay, 3 trials each | Afeksi +0, +0, +0 | Afeksi +1, +1, +1 |
| Synthetic suite, 10 cases × 2 trials | 18/20 | 20/20 |
| Mean input tokens, synthetic suite | 2,897 | 1,347 |
| Input tokens, reported-profile replay | 4,876 | 2,548 |
| Local regression checks | — | 52 passed |

Both live variants used `gpt-6-luna`, temperature 0.3, the same numeric baseline and transcript data, JSON output, and 60-second request limits. Synthetic cases cover personal warmth, care, humor, technical contribution, empty greetings, normal assistance, point farming, other-speaker blame, previously evaluated evidence, and intentional boundary violations. A structural validation failure counts as failure even if the numeric direction looks acceptable. No model judge was used.

Evidence: [final synthetic results](runs/separated-20261028/summary.json), [final full-profile replay](runs/production-replay-separated-20261028/results.json). The failed prompt-only experiment is preserved in [production-replay-20261028](runs/production-replay-20261028/results.json); its simple synthetic suite passed 20/20 for both versions in [calibration-20261028](runs/calibration-20261028/summary.json). This demonstrates why the full replay mattered. These are small regression/development samples, not proof that every social judgment is correct. Cases were reused across revisions.

No Discord messages or database mutations occur in either benchmark. Raw production messages and profile notes are kept outside the repository; only aggregate numeric replay results and an input hash are retained. The later operator repair of the missed batch is separate from these measurements.

Run with the already configured provider credentials:

```sh
NODB=true AI_PROVIDER=chatgpt bun benchmarks/hackerika-relationships/run.ts --out /tmp/relationship-regression-new
NODB=true AI_PROVIDER=chatgpt bun benchmarks/hackerika-relationships/replay.ts --profile /private/profile-export.json --out /tmp/relationship-replay-new
NODB=true bun test src/Services/AI/relationshipEvaluation.test.ts src/Services/AI/userProfile.test.ts src/Services/AI/chat.social.test.ts src/Commands/Public/Affection/utils/ranking.test.ts
```

`replay.ts` marks the latest five answered exchanges as eligible in memory only. The final candidate uses the production input formatter; the baseline uses the original interleaved transcript. This command is for diagnosing a known missed batch, not automatically rescoring historical interactions.
