# Tagged-person social intent

Status: candidate 3 is deployed with the owner's authorized ChatGPT plan and economical `gpt-6-luna` model. [Deployment evidence](../hackerika-models/chatgpt-plan-deployment-2026-10-17.json) records the final image and runtime verification. The historical DeepSeek shortage and Flash amendment below remain prior evidence, not current execution settings.

## ChatGPT iterations and final validation

[The ChatGPT execution amendment](chatgpt-execution-amendment-2026-10-17.json) froze new matched baseline/candidate cohorts before generation. Historical DeepSeek scores were not relabeled or mixed with the new judge. Candidate 2 improved development from9/12 to12/12, but [reserved testing](chatgpt-candidate-2-validation-comparison-2026-10-17.json) passed only7/8: it assigned a checking task to someone tagged as a passive reader. It was rejected and never deployed.

Candidate 3 shortened and clarified the general distinction between joke targets, explanation recipients and passive audiences. It adds no person names, fixed punchlines or sin-list answers. Candidate-2 reserved cases became development regressions; [four new scenarios](corpus-candidate-3.ts) and the [candidate image/prompt hashes](chatgpt-candidate-3-freeze-2026-10-17.json) were fixed before generating new outputs.

[Development comparison](chatgpt-candidate-3-development-comparison-2026-10-17.json) passed15/16 versus baseline10/16, with zero critical/provider/judge errors. One two-target joke remained too generic and is retained as a failure. After [selection was recorded](chatgpt-candidate-3-selection-2026-10-17.json), both frozen images generated four fresh scenarios twice. [Fresh validation](chatgpt-candidate-3-validation-comparison-2026-10-17.json) passed8/8 for both variants, with zero critical/provider/judge errors. These establish the declared >=90% correctness and nonregression gates for this corpus; they do not establish universal accuracy or a globally optimal prompt. All candidate outputs were also manually inspected.

Normal model roles and future semantic judges now use the same economical account model. To reproduce an isolated image run, use a fresh output directory and the ChatGPT settings from [the connection guide](../../docs/chatgpt-plan.md), including `--chatgpt-auth-dir PRIVATE_DIRECTORY`. Judge with the same model and rubric on both sides. Protected credentials and full runtime environment files remain outside benchmark artifacts.

## Historical DeepSeek status

Before the subscription connection, candidate 2 was prepared but unactivated. The [Flash model-migration amendment](model-migration-2026-10-17.json) superseded the original Pro execution settings. DeepSeek returned `402 Insufficient Balance` during development, so model-backed testing stopped. At that time no reserved outputs had been generated. See [provider-failure.json](provider-failure.json) and [candidate-2-freeze.json](candidate-2-freeze.json). The older resume instructions below describe that historical stage; use the ChatGPT records above for the selected deployment.

## Reported behavior and change

The live message `infokan tujuh dosa besar @KudaLiar @Hackerika` already had correct KudaLiar identity metadata. The failure was conversational intent: Hackerika supplied a generic list without joining the joke about the tagged person. The user explicitly confirmed that a natural, light response to that joke was wanted. Earlier mention benchmarks tested identities and follow-up references, rather than this opening-message behavior.

The candidate changes only `src/Services/AI/persona.ts`. It instructs Hackerika to connect casual person-focused prompts to the tagged friend with one short playful remark, while preserving the factual answer. Literal requests, technical questions and people tagged as an audience retain their original purpose. The caller is not automatically another target. Jokes do not establish actual misconduct, personal history or grounds for moderation or relationship changes. No names, sin-list answers or fixed punchlines are hardcoded into the production prompt.

Candidate 1 did connect both reported-style prompts to their named targets. Its browser-tab response was `naya buka tab kayak buka booster pack, RAM-nya nangis 😭`. However, its unknown-target answer expanded into a long invented CTF-themed list. Candidate 2 adds clearer limits: keep the original factual list/definition, use one short aside, and avoid narrating identity lookup. These revisions still require live-model verification.

## Recorded evidence

| Variant | Development outputs | Deterministic checks after correction | Valid semantic judgments |
| --- | --- | --- | --- |
| Production baseline | 12 successful | 9/12 | 12/12 executed; 10 passed |
| Candidate 1 | 11 successful, 1 provider failure | 10/12 | 0; all 11 attempts failed after balance exhaustion |
| Candidate 2 | Not run | Not available | Not available |

These are incomplete development results, not a demonstrated overall quality improvement. [The incomplete comparison](candidate-1-incomplete-comparison.json) fails the deployment gates. Failed and partial runs are retained. Candidate 1 has not been selected.

The suite contains eight new development scenarios and four prior identity/reference regressions. Four additional reserved scenarios are defined for two trials each, but remain unexecuted. Coverage includes the opening joke, alternate names, browser-tab banter, congratulations, unknown identities, explicit neutral lists, explanation recipients, a technical audience, ambiguous references and speaker ownership.

The real handler and live models run inside isolated processes with synthetic Discord/cache/profile destinations. These tests do not send public messages, DMs or relationship updates. The baseline at the start of this experiment was `ctf-assistant:mentions-candidate-3-20261017`, frozen under a separate immutable tag in [protocol.json](protocol.json). No affection reset or production restart was performed for this revision.

## Measurement correction

The first lexical checks incorrectly rejected colloquial `males`, equivalent English/Latin terms and a correct Discord recipient ping. The browser-tab test also unnecessarily required a spelled-out name even when the reply clearly addressed the target. The original corpus is preserved as [corpus-v1.ts](corpus-v1.ts); [measurement-correction.json](measurement-correction.json) documents the changes.

[rescore.ts](rescore.ts) checks immutable case inputs, reproduces the old deterministic grades, and applies the corrected checks to both recorded variants in fresh directories without any API calls. Original responses, judgments and protocols remain untouched. The semantic system rubric is unchanged; the browser-tab expectation now explicitly accepts an unambiguous implicit reference. Historical semantic judgments remain historical evidence. No fresh validation claim is derived from regrading development outputs.

## Local validation and remaining gate

The candidate image builds successfully and the application bundles successfully. Scoped strict TypeScript checking covers the persona, shared benchmark harness and new corpus/rescoring code. Full test results are recorded in [status.json](status.json), including an initial timing failure. The timed-out identity fixture included a random cosmetic 6–18 second away pause inside its 15-second timeout; the isolated test now fixes cosmetic randomness without changing production behavior. The focused eight-test mention suite then passed.

After API balance is restored, inspect candidate 1's preserved outputs using the one-time failed-judge retry, then run candidate 2 development. Select a candidate only after checking semantic results and all failed/critical outputs. Freeze the selection before generating both baseline and selected-candidate reserved trials. Deployment requires at least 90% combined correctness, zero critical failures/provider errors and no regression against the matched baseline. The selected prompt must stay frozen while reserved outputs are generated and evaluated.

The shared harness accepts the separate frozen corpus:

```sh
bun benchmarks/hackerika-mentions/run.ts \
  --corpus benchmarks/hackerika-mention-intent/corpus.ts \
  --image ctf-assistant:mention-intent-candidate-2-20261017 \
  --env-file /absolute/private/runtime.env \
  --out benchmarks/hackerika-mention-intent/runs/candidate-2-dev \
  --split dev --repeats 1 --concurrency 2

bun benchmarks/hackerika-mentions/judge.ts \
  --corpus benchmarks/hackerika-mention-intent/corpus.ts \
  --run benchmarks/hackerika-mention-intent/runs/candidate-2-dev
```

The judge uses the configured DeepSeek credentials. Do not print environment files or raw SDK diagnostics. Use `--split validation --repeats 2` only after recording a passing selection, for both the frozen baseline and selected image. Benchmark results describe these scenarios and model settings; they do not establish human equivalence, universal accuracy or a globally optimal prompt.
