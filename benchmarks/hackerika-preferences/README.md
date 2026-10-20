# Hackerika preference benchmark

Synthetic Discord conversations test whether Hackerika answers subjective questions with a concrete preference, keeps it when teased, avoids ranking people's worth by appearance, and still accepts factual corrections. The runner uses the configured chat model and never sends Discord messages or invokes bot tools.

`run.ts` accepts `--prompt-file` for a frozen baseline prompt and `--only holdout` for separate paraphrases. `score.ts` combines the development and holdout results. Baseline source: commit `edf3a1765b74`; candidate: the adjacent persona/voice edits. The result file records prompt hashes and every visible response.

On 2026-10-20 with `gpt-6-luna`, one sample per case scored **7/10 before** and **10/10 after** (development 4/6 → 6/6; holdout 3/4 → 4/4). This is a focused prompt check, not proof of consistent behavior across every conversation or model run. The score checks the explicit scenarios; review the response text for tone and nuance.
