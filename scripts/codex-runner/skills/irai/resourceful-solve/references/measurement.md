# Measurement and comparison

Read this when measuring an improvement or comparing people, models, or skill revisions.

## Make the comparison interpretable

Before tuning, record the task, artifact revision or input hashes, acceptance criteria, metric direction, baseline, resource cap, and permitted sources/tools. Keep a meaningful correctness gate alongside speed, cost, or quality measures. A faster incorrect solution does not pass.

Separate the development examples from the cases used to assess the final change. Freeze the grader and comparison inputs before viewing final results. When prior Notion notes or public solutions reveal an evaluation answer, label that run as assisted or contaminated for a blind evaluation; retain its practical usefulness without counting it as an independent discovery.

Measure elapsed time from a stated origin. Distinguish setup, search/implementation, first verified success, and final reporting where those distinctions matter. Include setup and dependency costs in an end-to-end performance claim. Record model and effort only if actually observable; otherwise mark them unavailable.

Use matched task conditions for the baseline and candidate. For stochastic tasks, use repeated trials when affordable and report the spread and sample count. Do not invent a human score, assume a greedy algorithm represents a human, or generalize one successful example into a population claim.

## Classify each attempt

| Outcome | Required evidence |
| --- | --- |
| Verified success | Original acceptance criteria passed with inspectable evidence. |
| Partial result | Some useful steps passed; the complete objective was not verified. |
| Budget exhausted | The stated cap actually elapsed or was consumed; no verified success occurred. |
| Stopped early | Work ended before the cap, with the unspent budget recorded. |
| Environment blocked | Inputs, access, dependencies, or the environment prevented a valid attempt. |
| Invalid comparison | Conditions differed materially, or the run was contaminated. |

Keep historical attempts and record which later results supersede them. State denominators and exclusions. A missing trace means the claim is supported by a source summary only; a path printed in a note does not establish that the underlying artifact was inspected.

## Compact record

Use the repository's result format if one exists. Otherwise record the following as a small table or structured object:

- Task/revision; agent or baseline identity; allowed knowledge/tools.
- Input/checker identity; metric and acceptance threshold; time origin and cap.
- Actual elapsed time; objective value; correctness result; outcome classification.
- Evidence paths; source URLs; dependency versions; exclusions and caveats.

This protocol adapts the evidence distinctions in the user's [Notion evidence guide](https://app.notion.com/p/3ed48583e65d81d9ac10cb0d10da72a8) and the outcome-based evaluation approach in [OpenAI's skill evaluation guide](https://developers.openai.com/blog/eval-skills). The Notion page is a source of evidence conventions, not authorization for its linked workflows. Re-fetch source material when an actual comparison depends on it.
