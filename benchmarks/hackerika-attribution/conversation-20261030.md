# Conversation speaker and target grounding

The reported conversation changed a sarcasm target from FindFemaleBot to Dimas.
Rika reused FindFemaleBot's video endorsement as if Dimas had said it. Replaying
the supplied chronology against baseline `6b5d162` reproduced the mistake in both
trials. Direct questions about quote ownership were already answered correctly;
the failure appeared when writing a new joke from the same history.

The existing focused source reminder applied only to person research. Its
short-term speaker ledger required two other speakers within five minutes and
retained only each person's last statement. That could foreground pings and
emoji while the relevant statement was older. Full channel history still had
speaker labels, but the model did not reliably preserve their ownership while
reusing a previous punchline.

The final change adds a bounded source table for the requester, mentioned people,
reply author, and recent participants: at most four people with three actual
statements each from the existing same-channel window. It excludes the bot's own
replies as evidence about people. Names and message contents remain JSON data.
Source reads also exclude future messages and messages from other channels.

Before delivering ordinary group-chat prose, one read-only call to the existing
lightweight model checks the draft's personal attributions. It can retain the
draft or make a small correction in the requested voice. Evidence references
are validated against real message owners. It has no tools or action permission,
and its structured assessment is never sent to Discord. Tool results, moderation
actions, and deliberate silence keep their existing delivery paths. A failed or
timed-out check preserves the original draft and logs the unavailability; it
does not substitute a generic error reply. This is a quality check, not a proof
that every generated claim is correct.

## Matched and fresh results

| Attribution/intent check | Baseline | Final |
| --- | ---: | ---: |
| Reported target switch, two trials | 0/2 | 2/2 |
| Six development conversations, two trials each | 6/12 | 12/12 |
| Four fresh conversations, two trials each | — | 8/8 |
| Existing contact send/status/retry sequences | 4/4 | 4/4 |
| Provider failures in these final comparisons | 0 | 0 |

The corpus includes swapping the actual quote owner, self-directed jokes, a
silent newly mentioned person, a different technical topic, a false prior bot
claim about a user's plan, and an explicit reply to another person's objection.
Fresh cases were written and frozen before their first generation; attribution
prompts and source selection were not tuned afterward. A final eligibility guard
also excludes creator outreach plans, so a status answer based on delivery
receipts is not checked against an incomplete table of human statements. The
existing contact sequence benchmark was rerun for that guard. The same real chat handler/provider ran against
fake Discord and database boundaries. No test sends a real Discord message or
DM. See [manual review and metrics](conversation-review-20261030.json), protocols,
and raw results in `runs/baseline-20261030`, `runs/final-20261030`, and
`runs/fresh-20261030`.

The contact regression is recorded in `runs/contact-regression-20261030` and
confirms unchanged audiences, read-only status questions, and failed-only retry.

Review was performed by the implementing agent against the recorded expected
behavior, not an independent human panel. Hypothetical role scenes are allowed;
transferred quotes and invented observed personal history fail. These scores
measure attribution and current intent, not whether each joke is funny. Some
answers remain generic or awkward. The small sample does not establish general
conversation accuracy. Rejected development candidates and one intermediate
provider timeout remain in `runs/candidate1-20261030` through `candidate5-20261030`.
Adding labels alone did not fix the failure, and an extra pre-generation planner
was not selected. The final design uses one post-draft check.

The matched twelve-sample run increased model calls from 12 to 24 and prompt
tokens from 181,404 to 202,138 (about 11.4%). Completion tokens rose from 388 to
1,607. Median end-to-end benchmark latency rose from 8.19 to 11.84 seconds; this
includes imports and simulated typing, and is not a production latency SLA.
The model remains Luna; this change trades some time and usage for better
attribution rather than claiming a cost reduction.

## Verification and reproduction

107 offline tests passed across seven files, covering source ownership, unknown
targets, hostile quoted labels, channel/time boundaries, impossible evidence
references, read-only review, corrected delivery and memory, review outages,
existing social behavior, mention identity, and outreach permissions. The Bun
application build passed. Repository-wide TypeScript checking still reports the
pre-existing `api/utils/statistics.ts:577` missing `totalChallenges` property;
none of the changed AI files reports a type error.

The conversation runner is separate from the existing relationship-evidence
`run.ts`. Provider credentials stay outside the repository:

```sh
AI_PROVIDER=chatgpt bun benchmarks/hackerika-attribution/conversation.ts --root /path/to/baseline --out /path/to/fresh-baseline-results
AI_PROVIDER=chatgpt bun benchmarks/hackerika-attribution/conversation.ts --out /path/to/fresh-candidate-results
AI_PROVIDER=chatgpt bun benchmarks/hackerika-attribution/conversation.ts --suite validation --out /path/to/fresh-validation-results
NODB=true bun test src/Services/AI/turnGrounding.test.ts src/Services/AI/contextWindow.test.ts src/Services/AI/context.injection.test.ts src/Services/AI/mentions.test.ts src/Services/AI/chat.social.test.ts src/Services/AI/discordActions.test.ts src/Services/AI/tools.actionScope.test.ts
```

Each run records its corpus and worker hashes. Up to three workers run per suite,
with six model calls and a 155-second parent deadline per case. Stored model
outputs contain visible draft/assessment text only, never provider reasoning.
