# Thread context benchmark

This suite exercises the real chat handler, model calls, native tool dispatcher, CTF worker, original image transport and calculator. Discord messages, histories, database writes and public search/page responses are synthetic. It sends no real Discord messages or DMs and submits no flags. A separate MongoDB round trip checks persistence across processes and deletes only its synthetic probe.

The corpus and literal-source grader were frozen before baseline execution. Six development cases cover discoveries beyond 30 messages/two hours, updates after the summon, corrections over older lists, the final unresolved question, an ordinary thread decision, and a hidden parent. Two reserved cases transfer to a starter image and a different set of names/slot numbers. They use fictional characters rather than researching a real person's medical information.

| Matched eight-case run | Strict passes | Model calls | Input tokens | Output tokens | Median turn |
| --- | ---: | ---: | ---: | ---: | ---: |
| Previous deployed version | 1/8 | 29 | 176,912 | 2,987 | 23.2 s |
| Selected candidate 3 | 8/8 | 32 | 190,498 | 12,472 | 51.2 s |

These are narrow synthetic context checks, not a general intelligence or CTF competition score. Strict checks include retained source-backed team values, the remaining numbered target, exact dates, successful actual image computation, and privacy. They also reject an unnecessary CTF investigation for an ordinary question. The same economical `gpt-6-luna` model handles both versions. Retaining more original evidence and generating the structured ledger takes more tokens and time; this change does not claim a cost reduction.

Candidate 1 passed 3/6 development cases: it lost a correction entry and sometimes omitted the slot number from the structured focus; the generic decision was ignored. Candidate 2 passed 5/6: it answered the generic decision correctly but called the CTF worker unnecessarily. Its two untouched reserved cases both passed after its source/image freeze. Candidate 3 changed current-request tool eligibility based on that development control, leaving eligible CTF worker prompts/inputs unchanged. It passed all eight cases; its two validation cases are explicitly a replay, not a second unseen holdout. Earlier failed runs remain available. The grader was not relaxed.

Manual evidence review found no unsupported recovered flags, remote-checker acceptance claims or hidden-parent leaks in the selected run. One reply redundantly requests clue 9 together with the missing primary entry, although the starter already gives the broad question. Its structured ledger still retains the prior values and correct remaining target. Passing the strict checks does not eliminate wording mistakes or establish unlimited thread recall.

The selected code also passes 376 tests in a checkout excluding unrelated local edits, strict scoped TypeScript checking, a Bun bundle, strict documentation build, and two existing CTF regressions (XOR calculation and multi-hop primary-source traversal). The image audit checks all 215 source/package paths against the previous image and permits exactly nine production changes. Runtime context is capped at 600 fetched messages, selected within a bounded text budget; checkpoints expire after 24 hours. There is no unbounded background solver. Two additional checks against the deployed container passed for starter-image computation and ordinary thread recall, using fake Discord destinations.

Run with a fresh output path:

```bash
bun benchmarks/hackerika-thread-context/run.ts \
  --image IMAGE_TAG --env-file /private/runtime.env \
  --chatgpt-auth-dir /private/chatgpt \
  --out benchmarks/hackerika-thread-context/NEW_RUN \
  --split dev --concurrency 2
```

Use `--split validation` for the two reserved/replay cases. `--container NAME` instead of `--image` uses an already-running container. Keep OAuth sessions and runtime environment files private; they are never copied into the image or committed. Inspect answers against the original fixture evidence; strict checks alone are not a semantic quality grade. The final runner help/scope/note text was clarified and a trailing worker space removed after historical runs; these do not change model inputs, fixtures or grading.

[selection.json](selection.json) records selection, costs, limits and verification. [image-audit.json](image-audit.json) records source isolation. [deployment.json](deployment.json) records runtime preservation and readiness. The separate Codex runner is a [documented design](../../docs/ai-behavior.md#proposed-isolated-codex-solver), not an enabled capability.
