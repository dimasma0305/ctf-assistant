# Model deployments — 2026-10-17

## ChatGPT plan activation

Production now uses the owner's authorized ChatGPT plan with `gpt-6-luna` and low reasoning for chat, image understanding, research, background work, native search and future semantic benchmark judging. [Activation evidence](chatgpt-plan-deployment-2026-10-17.json) records the exact image, completed plan inference from the live container, automatic credential refresh, healthy Discord/Mongo/HTTPS, preserved runtime settings and unchanged affection reset marker. [Preparation evidence](chatgpt-plan-preparation-2026-10-17.json) retains the earlier unauthenticated state.

The account catalog and OpenAI's Standard credit table identify Luna as the cheapest listed model available to this account. Limits still depend on the plan. See [connection and runtime instructions](../../docs/chatgpt-plan.md) and the optional `docker-compose.chatgpt.yml` for the private rotating credential mount and all-role settings.

Real [transport smoke tests](runs/chatgpt-luna-live-smoke-20261017/summary.json) passed text, JSON background output, native images, namespaced tool replay and hosted search (5/5). A separate [actual rsctf research probe](runs/chatgpt-luna-live-research-20261017/report.json) used nine primary-source observations and five model calls; all nine quoted passages were independently refetched from two pinned files. The search-only probe did not discover the rsctf repo, so its successful transport result is not a claim of accurate repository discovery. Exact supplied URLs let the research worker inspect the right project directly.

The final image passed [three handler regressions](runs/chatgpt-luna-c3-handler-smoke-20261017/summary.json), including an image from a replied-to message, with both model answers passing semantic judging. [Measurement correction](chatgpt-judge-measurement-correction-2026-10-17.json) retains a false critical judgment caused by omitting the image from judge input; the evaluator now receives the exact frozen pixels and provenance and rejects fixture hash mismatches. Prior judgments are unchanged.

The [tagged-person prompt experiment](../hackerika-mention-intent/README.md) rejected candidate 2 after reserved testing. Candidate 3 passed 15/16 development samples versus 10/16 for the matched baseline, then 8/8 fresh reserved trials, equal to the baseline. One weak two-person joke remains in the development failures. This is a measured improvement in the covered social-intent cases, not a claim of universal accuracy or a global optimum. All 366 local tests passed (1,169 assertions, 39 files); scoped strict types and the isolated final-image HTTP preflight passed.

The external proxy had stopped at 07:28 UTC, before the final bot deployment, because a historical Docker network was missing. Recovery restored its declared internal subnet and static IP without changing the proxy image/configuration; HTTPS was verified afterward. Failed recovery diagnostics remain in private evidence.

## V4.1 Flash consolidation

The earlier deployment consolidated chat, vision, background work, research and future semantic benchmark judging on `deepseek-flash` (DeepSeek V4.1 Flash). Research and judges previously defaulted to `deepseek-v4-pro`. This is now the historical pre-ChatGPT configuration. Model mapping and unit prices were checked against [DeepSeek's official table](https://api-docs.deepseek.com/quick_start/pricing/).

[Deployment evidence](deployment-2026-10-17.json) records healthy Discord/Mongo connections, the exact image/source hash and preserved runtime settings. Only `src/Services/AI/models.ts` changed inside the deployed image. Full local tests passed: 341 tests, 1,054 assertions, 34 files. The application bundled and scoped strict TypeScript checks passed. Four mocked judge/retry executions verify Flash request and protocol metadata; four additional checks reject mixed evaluator models before a comparison or partial retry.

All 1,521 historical benchmark run files remain unchanged. Comparing runs now requires matching evaluator models, rubric versions and rubric hashes. Changing a judge requires rejudging both sides in fresh directories; old Pro scores are not silently relabeled Flash scores.

Live model quality validation remains pending: the read-only DeepSeek balance endpoint returned `available=false`. No paid inference calls were attempted for this rollout. Local checks establish configuration and integration behavior, not equal semantic quality between models.

At the time of that Flash rollout, the social-intent persona remained unactivated. Its exact candidate-2 prompt is retained in a Flash image; [the historical execution amendment](../hackerika-mention-intent/model-migration-2026-10-17.json) predates the fresh ChatGPT cohorts above.
