# Message ownership and relationship evidence

The reported incident showed Dimas pointing Hackerika at a GIF from KudaLiar, followed by an ambiguous reprimand. The live profile evaluation reduced Dimas from 2 to 1 and described his source clarification as shifting blame. KudaLiar's evaluation stayed at 0. The incorrect opinion establishes the attribution error; the repair is not based only on two scores happening to change at the same time.

The revision records source ownership separately from the current speaker, marks assistant speech as context, and asks profile evaluation to cite the target user's own message IDs. The backend rejects relationship numbers, opinions and new moments when their evidence references another user's source, a bot reply, invented IDs, or no IDs. This verifies authorship, not intent; the model still has to interpret what an owned message means. Normal penalties for a user's own sustained provocation remain possible. A score comparison also prevents a pending draft from overwriting an intervening correction.

The same eight synthetic cases were run twice per variant with the same model and temperature. The [protocol](runs/owner-evidence-1/protocol.json), [raw generations](runs/owner-evidence-1/results.json), [original strict summary](runs/owner-evidence-1/summary.json), and [derived metrics](metrics.json) are retained.

| Check | Before | After |
| --- | ---: | ---: |
| Samples | 16 | 16 |
| Incorrect penalties for reporting/clarifying/uncertain users | 6 | 0 |
| Correct penalties for the user's own deliberate provocation | 4/4 | 4/4 |
| Numerically correct model proposals | 10/16 | 16/16 |
| Original combined score/evidence check | 10/16 | 15/16 |
| Request errors | 0 | 0 |

The strict after check remains **15/16**: one unknown-owner case correctly proposed unchanged scores and empty evidence, so the backend held the relationship update. The original checker required nonempty accepted evidence even for unchanged neutral scores. Its result has not been rewritten. Baseline evidence is implicitly accepted by the legacy writer; its `validEvidence` count is not a claim that the old system verified message ownership.

Three short reply cases were also inspected [before/after](reply-probe-first.json). One refinement of the dynamic actor context was then checked on the same three cases; [those outputs](reply-probe-after-refinement.json) remain available. Known-source replies identify KudaLiar as the sender. Unknown-source wording can still imply observing a GIF that was only discussed in the text, so these probes do not establish perfect visual grounding or a general voice-quality improvement. They use synthetic text context, no pixels, and no tools. The static selected persona remains candidate 12.

No Discord message or DM was sent by the benchmark, and it never connected to the database. No real media, message IDs, credentials, or private profile contents appear in the public corpus. This is a targeted regression comparison, not a held-out global accuracy benchmark or proof of human equivalence.

To reproduce with the configured DeepSeek key:

```bash
NODB=true bun benchmarks/hackerika-attribution/run.ts \
  --after benchmarks/hackerika-attribution/prompts/after.txt \
  --out benchmarks/hackerika-attribution/runs/reproduction
```
