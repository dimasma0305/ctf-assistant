# Capability-to-impact checkpoint

Load this reference when a primitive does not immediately identify the next
exploit step, a branch reaches its timebox, or repeated tests produce no new
observable. Its purpose is to spend the next test on a missing link instead of a
cosmetic payload variation.

## Map the proved capability

Record one compact row for the strongest positive primitive:

| Field | Question |
| --- | --- |
| Primitive | What operation was directly observed? |
| Control | Which target, value, size, offset, timing, state, or repetition can the player choose? |
| Constraints | Which characters, ranges, lifetimes, origins, permissions, parser stages, or environmental conditions limit it? |
| Observable | Which output, state change, crash, callback, timing signal, or verifier response proves the effect? |
| Reliability | Was it seen once, repeated deterministically, or measured probabilistically? |
| Impact link | What next security-relevant operation would move this capability toward the win condition? |
| Bridge test | What cheapest test would prove or reject that link? |
| Evidence | Which saved command, output, capture, or source location supports each claim? |

Describe only demonstrated control. For example, a read of one fixed object is
not yet an arbitrary read; code execution in a helper process is not yet access
to a protected service. Name the missing dimension rather than upgrading the
primitive by inference.

Build a short path from the primitive to the win condition:

```text
observed primitive → missing control or state → security-relevant operation → win condition
```

Test the earliest uncertain arrow. Prefer a bridge test that distinguishes
several explanations or makes a previously hidden effect observable. If the
signal depends on a callback, crash, timing change, or rendered state, first run
an equivalent negative control and a known-different positive control. Failure
of the positive control is a setup failure, not evidence against the primitive.

## Apply the pivot gate

At the branch timebox or after consecutive tests add no distinct observation,
classify the latest evidence:

| Classification | Required decision |
| --- | --- |
| Stronger capability | Update the map and test the next missing link, or enter proof if the win condition is reached. |
| New constraint | Update the map, then choose a bridge that respects it or pivot to a materially different path. |
| Equivalent variation | Close the variation family and pivot. Do not spend another trial on a cosmetic change. |
| Setup failure | Repair or replace the measurement before judging the exploit hypothesis. |
| Proof-ready | Stop exploration and perform the clean proof path. |
| External blocker | Record the dependency and evidence; mark the solve blocked only when no useful local or independent branch remains. |

Record every gate classification as a pivot decision, including repair, proof,
and external blocking. Add or update a capability record when the outcome is a
stronger capability or a new constraint. A proof-ready result belongs in the
proof and pivot records; do not relabel the flag-like output as another
capability.

A materially different pivot changes an entry point, trust boundary, parser,
state transition, primitive, or assumption. A new encoding of the same
unobservable effect remains the same branch.

Before ending an unsolved run, check every still viable branch against the map.
If the budget and authorization remain and one branch has a cheap test that can
change the map, run it. If none does, record the measured blockers and the best
test unlocked by the missing external input. Do not convert unused time by
itself into a reason to keep issuing equivalent tests.

Use `scripts/ctf_state.py capability` and `scripts/ctf_state.py pivot` when the
bundled helper is available. The concise records are also the source for the
root-cause, attack-path, dead-end, and proof statements in the required report.
