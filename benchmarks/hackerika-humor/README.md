# Mild adult humor — 2026-10-17

The owner requested a little tolerance for adult jokes that are indirect. The revision explicitly permits short, non-graphic double entendre, relaxed flirting, a reaction or silence. It discourages moral lectures, automatic negative feelings, relationship penalties, cooldowns, deletion and private handoffs solely because a joke has an adult implication. The bot should keep its response at the same non-graphic level.

The same preference is included in background relationship evaluation. A mutually accepted mild joke is not evidence of harassment, and it need not earn points either. A refusal still matters: repeated unwanted remarks, coercion and sexualization of minors are outside this allowance. The previous attention logic and per-person boundaries are retained.

The [protocol](protocol-2026-10-17.json) froze 17 development cases and four fresh cases before generations. It uses the actual chat/attention coordinator and profile distiller with `gpt-6-luna`, synthetic Discord identities, fake delivery and database destinations, and one clean process per case. Development runs use one trial per case; fresh runs use two. All generated replies and tool receipts are retained. Relationship cases evaluate actual fake profile writes against starting scores of 5, including whether accepted jokes invent conflict memories or whether an explicit boundary breach is excused.

Development passed 17/17 for the previous runtime and 16/17 for the candidate under automated judging. [Review](development-review-2026-10-17.json) accepted the candidate's remaining non-graphic quip, giving 17/17 reviewed. The raw judge objected to “tambah ronde” as escalation; review found it remained an indirect joke without explicit acts, coercion or body details. The original failure remains preserved. This is an explicit preference change, with retained behavior on the tested examples; the baseline already tolerated these jokes, so these results do not establish an accuracy improvement.

Judging began before the last candidate generation finished. A [completeness record](measurement-completeness-2026-10-17.json) documents the one-sample supplement with the same rubric and no regenerated response. It retains the original partial judgments. No scoring requirements were weakened. The [selection](selection-2026-10-17.json) was recorded before fresh generations.

The selected candidate passed **8/8 fresh trials automatically**, including both profile evaluations. The baseline passed 7/8 automatically and 8/8 after review. Its remaining judgment objected to a modest `angerDelta: 5` after an explicit refusal was dismissed, while the same judge passed the candidate's `angerDelta: 6, hurtDelta: 3` for that scenario. The [fresh record](fresh-validation-2026-10-17.json) keeps both raw results and explains this inconsistent strictness. No prompt or checker changed after fresh generations. No tested mild joke caused punitive social actions, negative relationship scores relative to its starting profile, or an invented conflict memory.

Only `socialPrompt.ts` and the distillation prompt inside `userProfile.ts` differ from the previous production image; the [image audit](image-audit-2026-10-17.json) verifies this. Local checks passed 367 tests, 1,171 assertions, scoped strict TypeScript and the Bun bundle. No live Discord message, DM or profile change is sent by these benchmarks.

The [prompt comparison](prompt-cost-2026-10-17.json) adds 133 mean input tokens (1.48%) on the six matched initial mild-humor completions; this change does not claim token savings or better latency. The [deployment receipt](deployment-2026-10-17.json) records the activated image, source hashes, service health and preserved configuration/reset marker.

To reproduce, choose a new output directory:

```bash
bun benchmarks/hackerika-mentions/run.ts --container ctf-assistant-ctf-assistant-1 --corpus benchmarks/hackerika-humor/corpus.ts --split dev --repeats 1 --out benchmarks/hackerika-humor/runs/new-dev
bun benchmarks/hackerika-mentions/judge.ts --corpus benchmarks/hackerika-humor/corpus.ts --run benchmarks/hackerika-humor/runs/new-dev
bun benchmarks/hackerika-humor/summarize.ts --run benchmarks/hackerika-humor/runs/new-dev
```

Wait for the generation run to finish before judging. For fresh cases, use `--split validation --repeats 2` and another fresh directory. Image trials require an explicit private environment file and credential directory, as described in the attention benchmark. Automated judging is variable and the cases are small; these results do not establish human equivalence or a global optimum.
