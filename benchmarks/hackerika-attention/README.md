# Conversation continuity and prompt compression

## Subject changes and personal boundaries — 2026-10-17

The current revision preserves speaker names and explicit mention identities in the attention history, including history restored from the channel cache. The semantic planner distinguishes the person asked to answer from a tagged subject. A new request about another person can continue the bot's conversation without another bot mention; a friend-directed acknowledgement or an explicit handoff to a human can stay quiet. The planner compares the previous request with the latest request, rather than assuming the previous answer covered both subjects.

Recent personal boundaries also inform reply selection and the main social prompt. Continued provocation from the same person need not receive friendly banter. The bot can stay silent or uphold the boundary, while treating a reporter as a separate person. Sincere apologies, neutral technical questions, harmless compliments and ordinary consensual banter remain valid interactions. Existing per-person feelings, scoped cooldowns, privacy and action permissions are retained.

| Matched check, `gpt-6-luna` | Previous runtime | Selected revision |
| --- | ---: | ---: |
| Planner, 24 cases × 2 trials | 45/48; reported-case gate failed | 48/48 |
| Full attention coordinator and chat handler, 12 cases × 2 trials | 20/24 | 23/24 automated; 24/24 after disclosed review |
| Fresh planner, 4 cases × 2 trials | 8/8 | 8/8 |
| Fresh boundary/actor checks, 2 cases × 2 trials | 4/4 | 4/4 |
| Incorrect punishment of bystanders/harmless compliments | 0 | 0 |
| Provider/judge errors in matched and fresh checks | 0 | 0 |

The previous runtime ignored all four full-handler trials of the reported subject-switch requests. The selected revision delivered them. Candidate 1 was rejected for a remaining planner miss. Candidate 2 reached 48/48 planner decisions but failed target preservation in a generated answer and one semantic boundary check. Their results remain in `runs/`.

The first delivery fixture accidentally omitted the previous ten-item answer supplied in the report, leaving its religious context ambiguous. The [measurement amendment](context-fixture-amendment-2026-10-17.json) restores that history and records the failure; both runtimes were rerun on identical corrected inputs. Requirements, word budgets and checker rules were retained. One automated judge then rejected a hypothetical joke addressed to the newly requested subject as an unsupported subject switch. The [development review](context-candidate-3-development-review-2026-10-17.json) preserves that raw failure and explains its adjudication. The raw automated score remains 23/24.

The [selection](context-candidate-3-selection-2026-10-17.json) was recorded before generating [fresh validation](context-fresh-validation-2026-10-17.json). No prompt or checker changed afterward. Both runtimes passed the fresh examples; this demonstrates retained behavior rather than a measured improvement on those examples. Baseline boundary probes did not consistently reproduce the user's friendly Buzz Lightyear response, so the boundary results support the tested consistency, not a universal improvement claim. The candidate can still add an unnecessary apology in a reporter correction.

Full local validation passed **367 tests, 1,171 assertions**, scoped strict TypeScript checks and the Bun bundle. The [image audit](context-candidate-3-image-audit-2026-10-17.json) confirms only `attention.ts`, `spontaneous.ts` and `socialPrompt.ts` changed from the previous production image. This revision spends a little more prompt context: the [matched direct-turn comparison](context-token-comparison-2026-10-17.json) adds 218 mean input tokens (2.34%); it makes no token-saving or speed claim. Live model probes use synthetic Discord/database destinations and never send manual server messages or DMs. These small suites do not establish human equivalence or a global optimum.

Reproduce with a fresh output directory and a private runtime environment file:

```bash
bun benchmarks/hackerika-attention/run.ts --container ctf-assistant-ctf-assistant-1 --corpus benchmarks/hackerika-attention/followup-corpus-2026-10-17.json --repeats 2 --out benchmarks/hackerika-attention/runs/new-routing
bun benchmarks/hackerika-mentions/run.ts --container ctf-assistant-ctf-assistant-1 --corpus benchmarks/hackerika-attention/boundary-corpus.ts --split dev --repeats 2 --out benchmarks/hackerika-attention/runs/new-context
bun benchmarks/hackerika-mentions/judge.ts --corpus benchmarks/hackerika-attention/boundary-corpus.ts --run benchmarks/hackerika-attention/runs/new-context
```

Image-based trials additionally require `--env-file PRIVATE_FILE --chatgpt-auth-dir PRIVATE_DIRECTORY`. The [deployment receipt](context-deployment-2026-10-17.json) records runtime preservation, health and source verification.

## Earlier continuity and compression revision

The active revision treats messages in a conversation Hackerika recently joined as possible follow-ups, with a semantic choice between reply, reaction and silence. It does not require a fresh mention or quote-reply for every turn. The original ambient planner used a five-minute channel cooldown, three-minute user cooldown and 45-second evaluation cooldown; those suppressed real follow-ups. Ongoing conversations now have a separate bounded evaluation budget and normal conversational tone. Recent context is restored from the same channel's short cache after a restart. Ignore boundaries, source revision guards and channel privacy still apply.

## Before and after

| Check | Previous | Selected revision |
| --- | ---: | ---: |
| Routing: 16 cases, two trials | 23/32 | 32/32 |
| Consecutive untagged follow-ups | blocked | pass |
| Incorrect interruptions on critical routing cases | 0 | 0 |
| Static prompt, UTF-16 characters | 22,375 | 11,671 |
| Mean input tokens, main voice suite | 15,416 | 11,849 |
| Mean input tokens, reviewed regression | 15,037 | 10,731 |
| Native image factual answers | 14/14 | 14/14 |
| Fresh eight-case validation relevance | 4.875/5 | 4.875/5 |
| Fresh validation within word budget | 93.75% | 100% |
| Fresh validation critical flags | 2 | 0 |

The prompt is about **48% shorter**. Actual mean input-token reductions were **23.1%** on the main suite and **28.6%** on reviewed regression. These counts include the complete prompt/tools and simulated tool rounds for those synthetic cases; production history and tool usage vary. Cached baseline generations retain their recorded token counts. Their zero replay latency is not a speed measurement.

The [optimization protocol](optimization-protocol.json) was frozen before candidate outputs. Candidates 9–11 exposed missing follow-ups, verbose corrections, and a text acknowledgement of an explicit request to wait. Those results remain preserved. Candidate 12 passed the predeclared compression and quality non-regression checks on the main and reviewed suites. Its [selection was frozen](frozen-selection-12.json) before the new `conversation-final` suite was generated or judged; that suite passed all original voice gates, including the preference target. See the [complete summary](optimization-summary.json), [selected prompt](../hackerika-voice/prompts/candidate-12.txt), and [fresh results](../hackerika-voice/runs/compact-12-final/results.json).

Results remain qualified: the generic 60% preference-improvement target was not reached on the main/reviewed comparisons, so their original summaries remain partial. Targeted context emotional fit remained 4.0/5, equal to that comparison's baseline but below the 4.2 voice gate. Manual review also found residual awkward wording, a mistaken possessive in one multi-speaker context response, and an unnecessary debugging suggestion in a fresh case. These are not claims of perfect grounding, human equivalence, universally improved accuracy, or a global optimum. AI judges vary, including scores on reused baseline outputs. The original corpus, word budgets, rubric, critical checks and earlier results were retained.

## Reproduce

Routing uses the real attention function and live provider, with synthetic messages and no Discord sends:

```bash
bun run benchmark:attention --container ctf-assistant-ctf-assistant-1 --out benchmarks/hackerika-attention/runs/replay
bun run benchmark:voice --candidate benchmarks/hackerika-voice/prompts/candidate-12.txt --baseline benchmarks/hackerika-voice/prompts/candidate-8.txt --split dev --repeats 2 --out benchmarks/hackerika-voice/runs/replay-compact
bun run benchmark:vision --native-baseline --candidate benchmarks/hackerika-voice/prompts/candidate-12.txt --baseline benchmarks/hackerika-voice/prompts/candidate-8.txt --out benchmarks/hackerika-vision/runs/replay-compact
```

Use a new output directory. The routing harness records the corpus/source hashes and bounded live calls; its frozen expectations are in [cases.json](cases.json). Planner revisions 1 and 2 reached 30/32; revision 3 reached 32/32 and is identical in the deployed candidate-12 image. The fresh suite is now reviewed evidence for subsequent work, not a reusable untouched holdout.

Full chat-handler probes additionally exercise an untagged follow-up, meaningful technical response, acknowledgement/explicit-wait silence, and a reply to the actual previously failing Discord image. Test destinations are fakes. Runtime source/prompt hashes, Discord readiness and HTTP health are checked after activation; protected runtime environment and rollback files remain outside source and build contexts.

## Internal annotation output repair

A later production reply copied `[Discord chronology: ...]` into public text. Before the repair, a minimal runtime reproduction confirmed that chronology was appended directly to assistant-history content. Chronology now stays once in current user context; assistant-history examples remain public speech. A shared output filter strips reserved annotations from regular replies, native sends/edits, private openings and optional closings, including truncated/nested/fenced variants. Empty results cannot be delivered as empty messages; ordinary JSON/timestamps/code remain intact.

The full suite passed **286 tests**. A live-provider chat-handler probe forcibly appended the reported annotation to the provider's answer and verified that delivered text and assistant memory stayed clean. A separate actual-upload reply probe preserved image understanding. Both used fake Discord destinations. The selected candidate-12 prompt is unchanged. The [deployment receipt](output-metadata-fix-2026-10-15.json) records runtime hashes, preserved chronology, readiness and health checks.
