# Hackerika benchmarks

These suites exercise different parts of the bot. They use synthetic conversations and fake Discord destinations; live-provider suites spend API credits. Read each suite's protocol and limitations before comparing scores. Historical failed runs remain part of the evidence.

| Suite | Coverage | Evidence |
| --- | --- | --- |
| [Model deployments](hackerika-models/README.md) | Authorized ChatGPT plan, GPT-6 Luna for all roles; historical Flash consolidation; evaluator provenance | Live plan inference, image/tool/native search and exact-repo research checks, automatic refresh, 366 local tests and deployment receipts |
| [Capabilities](hackerika-capabilities/README.md) | Attribution, grounding, privacy, research, technical answers, attention, images, delivery counters and relationship fairness | Frozen production image comparisons, development and separate validation, deterministic checks, blind semantic judging |
| [Research](hackerika-research/README.md) | Exact repository identity, documentation navigation, implementation checks, versioned settings, configuration scope and source evidence | Frozen image comparisons, separate fresh validation, retained failed candidates, actual GitHub and native-search checks |
| [Mentions and references](hackerika-mentions/README.md) | Silent tagged users, reply targets, third-person follow-ups, speaker ownership and ambiguous references | Real-handler comparisons, fresh validation, retained failures, three-turn metadata provenance tests |
| [Tagged-person social intent](hackerika-mention-intent/README.md) | Opening-message banter, literal/audience controls and prior reference regressions | Candidate 3 on GPT-6 Luna: development15/16 versus baseline10/16; fresh validation8/8 for both; failed candidates retained |
| [Attention and context](hackerika-attention/README.md) | Untagged continuation, reply/react/silence, chronology and prompt efficiency | Routing, conversation and prompt revisions, including retained partial results |
| [Vision](hackerika-vision/README.md) | Native image input, reply attachments and Discord CDN transport | Visual regressions and deployment receipts |
| [Indonesian voice](hackerika-voice/README.md) | Brief expressive conversation and contextual tone | Before/after prompts, development/holdout and paired judgments |
| Attribution | Evidence ownership for affection changes and source attribution | [2026-10-16 deployment and targeted results](hackerika-attribution/deployment-2026-10-16.json) |
| Relationship rankings | All numeric relationship metrics, selectable sorting, member filtering and output limits | [Command deployment and regression checks](hackerika-ranking/deployment-2026-10-16.json) |

Scores describe these cases and configurations. They do not establish human equivalence, a universal accuracy rate, or a globally optimal prompt.
