# Hackerika Indonesian voice benchmark

This benchmark compares a frozen prompt before the voice revision with candidate prompts. It uses synthetic conversations and simulated tool results: it never logs into Discord, sends a real message, or reads member conversations. The generation model and effort match the bot configuration unless explicitly overridden. API calls use the configured DeepSeek key.

The corpus and rubric are frozen before tuning. Development cases cover ordinary conversation, useful concise technical answers, requested detail, Indonesian emotional expression, and deliberate silence. Separate holdout cases are reserved for final comparison. Model outputs are judged anonymously by a separate Pro model with balanced A/B order, alongside deterministic word budgets, identity, framing, and wait checks. This is an AI-judged proxy for naturalness, not a measured human-native baseline or proof of a globally optimal prompt.

```bash
bun run benchmarks/hackerika-voice/run.ts --split smoke --candidate benchmarks/hackerika-voice/prompts/candidate-1.txt --out benchmarks/hackerika-voice/runs/smoke
bun run benchmarks/hackerika-voice/run.ts --split dev --candidate benchmarks/hackerika-voice/prompts/candidate-1.txt --out benchmarks/hackerika-voice/runs/round-1
bun run benchmarks/hackerika-voice/run.ts --suite validation-3 --split holdout --repeats 2 --candidate benchmarks/hackerika-voice/prompts/candidate-7.txt --out benchmarks/hackerika-voice/runs/final-reserved-replay
```

Each run records prompt/tool/corpus/judge hashes, model/effort, SDK/runtime versions, matched conditions, limits, raw synthetic outputs, latency, token usage, deterministic checks, paired judgments, and an acceptance summary. Successful generations are cached by the complete experiment identity; failed or partial generations are not cached. API errors and timeouts count as failed observations, not successes or silent responses.

The runtime prompt is `prompts/candidate-12.txt`: compressed persona/action guidance with chronological grounding and explicit silence. It follows candidate 8's voice/vision work; earlier selections and comparisons are retained. See [the results and limitations](report.md), the [conversation optimization report](../hackerika-attention/README.md), and the [image capability benchmark](../hackerika-vision/README.md). Run `bun run benchmark:voice --split dev --repeats 2 --out benchmarks/hackerika-voice/runs/replay` to repeat a comparison. Pick a new output directory to preserve prior evidence. A repeat with existing cache reuses generations and makes fresh judging calls, so judge scores can fluctuate.

The original holdout and validation-2 were used for review in earlier rounds and are no longer untouched evidence. `--suite regression --split dev` runs the focused credential, encryption, and speaker-attribution cases. `--suite validation-3 --split holdout` uses the new 16-case final suite. The original corpus and rubric remain unchanged; every suite records its own corpus hash. All calls and limitations are retained, including failed or partial acceptance gates.

For the latest revision, `--suite context --split dev` uses six known chronological-grounding cases. `--suite conversation-final --split holdout` uses the eight-case reserved suite frozen after candidate 12 was selected. That suite has now been reviewed and must be treated as regression evidence in future tuning. Validation-3 was also reviewed earlier and is a known-case regression for candidates 9–12.

The default limits are three concurrent jobs, 180 total API calls, 25 minutes, four model rounds per synthetic turn, 4096 completion tokens per generation, 90 seconds per generation request, and 45 seconds per judging request. Pass criteria are defined in `rubric.ts`; the runner does not change them to suit results. Tuning should stop when criteria pass and further revisions show no meaningful benefit. Do not inspect holdout outputs to design a candidate and then call that same comparison untouched validation.

Pinned dependencies come from the repository lockfile: OpenAI-compatible SDK 4.104.0 and Bun 1.3.14 were available at initial setup. Provider models are aliases and can change; each run records the requested name and timestamp rather than claiming immutable weights. Follow [DeepSeek's thinking/tool-call requirements](https://api-docs.deepseek.com/guides/thinking_mode/) when modifying the runner.
