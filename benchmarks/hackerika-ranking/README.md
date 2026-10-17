# Relationship ranking verification

`/affection ranking` and `/affection rank` display affection, trust, respect, comfort, chemistry, warmth, anger, hurt, interaction count and signed affection change. Choose any of these ten sorting metrics with `metric`; `limit` defaults to 10 and accepts up to 25.

The eight focused tests cover sorting independent of affection, deterministic ties, elapsed-time emotion decay (including fractional stored scores), legacy defaults, private-field exclusion, maximum-size embeds, alias metadata, guild/bot filtering, empty-board private summaries, shared cooldowns and bounded member-resolution batches. The complete test run passed 314 tests and 970 assertions across 30 files. No test sends real Discord messages or makes live model calls.

An isolated image preflight uses the real command file loader to verify that both aliases register and utility/test files are excluded. Deployment verification reads the actual registered Discord command schema, checks source hashes, health, preserved runtime configuration, unchanged AI/evaluator/search sources and the unchanged affection reset marker. The [deployment receipt](deployment-2026-10-16.json) records these checks.

Only current-server human members with a positive selected metric appear on that board. Profiles are global per person. A 500-profile candidate cap or failed member lookup is labelled incomplete. Numeric summaries do not select private messages, reasons or profile prose. Scores and profile data are not modified by the command.

Run the focused checks with:

```bash
bun test src/Commands/Public/Affection/utils/ranking.test.ts
```
