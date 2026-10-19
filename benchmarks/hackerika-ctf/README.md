# Hackerika CTF capability benchmark

## TCP1P “solve another challenge” routing — 2026-10-19

The live request `@Hackerika solve 1 soal lagi yg ada di tcp1p` called `research_topic` and ended with a generic search failure. Its wording had the solve verb but no keyword recognized as a CTF task, so `solve_ctf` was omitted from that turn's tool list. The router now treats a challenge/soal/tantangan tied to TCP1P as a CTF request. The [matched image comparison](tcp1p-route-comparison-20261019.json) moved from **4/6 to 6/6** routing cases: the incident and an equivalent challenge request now require and expose `solve_ctf`; reminder, platform-research and banter controls remain outside that route. This checks routing only, not whether an unspecified challenge can ultimately be solved or its flag accepted.

This evaluates requested CTF investigations through the real chat handler, native tools, original Discord image transport, nested model calls, primary-source reader and isolated calculator. Discord sends, profiles and channel histories are synthetic. Public search/page responses use controlled fixtures; no real flags are submitted and no real Discord messages are sent. A separate live search/reader smoke and a private MongoDB checkpoint round trip validate transport/persistence independently.

## Results

| Set | Before | After |
| --- | ---: | ---: |
| Development | 2/8 | 7/8 |
| Holdout | 2/4 | 4/4 |
| Extra reserved validation | 1/4 | 4/4 |
| Total strict checks | 5/16 | 15/16 |

The one final failure returned all four correct ABO candidates but skipped actual calculator execution, so it fails the frozen receipt requirement. This failure is retained rather than relaxed. Both reserved sets passed completely, including native image OCR followed by actual computation. The scoped staged checkout passes 367 tests, strict source typechecking, Bun bundling and strict documentation build; the existing repository-research smoke checks pass 2/2. See [selection.json](selection.json) for usage, qualification and exact gates.

## Frozen tasks and proof

The development set covers XOR with encode-back verification, a teammate's ROT13 clue, multi-hop OSINT with an incident/upload-date distinction, ambiguous partial flags without the original story, ABO enumeration without invented Rh, source failure, page prompt injection and a request to rest. Initial holdout tasks cover two-layer encoding, small RSA, conflicting event/edit dates and missing checker rules. A later reserved set adds native image OCR plus calculation, another teammate's base64 clue, district/city granularity, and missing original story text.

Ground truth for computations was checked independently using Python's codecs/base64 and modular arithmetic. Flags and pages are invented for the benchmark. Structured tool receipts must show an actual successful calculation; plausible mental arithmetic alone does not establish execution. Source answers must inspect actual fixture documents. Deliberate silence is allowed for the rest control. Missing-evidence cases require a specific original-input request rather than the reported canned unavailable sentence. Internal/private context leaks, invented Rh, prompt-injection flags and unsupported checker-acceptance claims fail checks.

See [corpus.ts](corpus.ts), [grader.ts](grader.ts), [measurement-amendment.json](measurement-amendment.json) and [candidate-9-freeze.json](candidate-9-freeze.json). Protocols record corpus/worker/grader hashes, image, model-call limits and usage. Original failures and grader outputs are retained; v1.1/v1.2 regrades apply measurement corrections equally to baseline and all candidates. The OSINT grader accepts casing variants for the derived place/date because no checker casing rule was supplied; this does not claim the external flag would accept those variants. The RSA fixture was corrected with an independent oracle before any holdout run. Source task inputs were unchanged during candidate comparisons.

## Development record

The original bot hallucinated an XOR plaintext and declared the small RSA recovery ambiguous. Early worker candidates failed to execute their own proposed calculations, then exposed a transposed cipher copied from chat. Later testing found missing flag delimiters a model timeout that discarded useful checkpoint progress, and a delimiter check that incorrectly included echoed prefix components. A later planner call exceeded its 25-second request window; the final candidate allows 35 seconds per call within the unchanged 80-second investigation ceiling. The final traversal revision also follows a bounded primary-source frontier before accepting a missing-evidence decision at an index. The selected implementation uses explicit executable plans, original-input bindings, delimiter diagnostics and persisted computation receipts. It keeps candidates distinct from remote acceptance. All rejected attempts remain in their run directories.

The full model comparison uses frozen candidate 8. Candidate 9 adds only a routing guard so an active CTF cannot hijack unrelated social/Discord/platform-research requests; the worker, calculator, prompts and all other execution paths are unchanged. [route-equivalence.json](route-equivalence.json) verifies identical routing on all 16 frozen model cases, while separate negative unit controls exercise the changed behavior. Reserved outputs did not tune this guard.

Results and the operational receipt are recorded in [selection.json](selection.json) and [deployment.json](deployment.json). This is a small bounded capability/regression test, not a broad CTF competition score or a direct comparison with commercial research agents. Baseline outputs were available during implementation. Reserved candidate sets are evaluated after the source/image freeze and are not used to revise the selected candidate. Passing known synthetic cases does not verify the user's Securinets flag, whose original story/images/checker were not supplied here.

## Reproduce

Use the runtime's private environment file and an owner-only ChatGPT auth mount; never commit either. The runner executes the chosen immutable image, max 14 model calls per case, 155 seconds per case and 20 minutes per suite. Use a fresh output directory; earlier runs are never overwritten.

```sh
bun benchmarks/hackerika-ctf/run.ts --image IMAGE --env-file PRIVATE_ENV \
  --chatgpt-auth-dir PRIVATE_AUTH_DIR --out FRESH_OUTPUT --split dev --concurrency 2
```

Use `--split holdout` or `--split validation` for the reserved sets. Model/provider variation and network deadlines can affect results. Hardcoded flag syntax checks are independent of factual/semantic correctness; all critical outputs also receive source/receipt review. The smallest configured model is retained; heavier CTF turns necessarily use more calls/tokens than a casual message.
