# Long-run strategy for hard CTFs

Use this reference after initial triage when the challenge has several stages, interactive tooling, long computation, or repeated failed hypotheses.

## Keep a compact external state

Use `scripts/ctf_state.py` or the repository's equivalent. At a phase change or handoff, run `summary <state-file> --compact` to carry only status and goal, the latest observation, strongest capability, open hypothesis with falsifier, next test, and proof level. Keep detailed records and raw evidence in the state file and referenced paths:

- immutable challenge contract and artifact hashes;
- current access/research mode;
- hypotheses with rejection tests and status;
- observations tied to command output, file/line, address, packet, or source URL;
- attempts, results, and why a branch was rejected;
- verified capabilities, their impact bridge, and the next missing link;
- pivot trigger, outcome classification, evidence, and next branch;
- solver/checkpoint paths and current proof level.

Do not store credentials or the literal flag in a broadly readable checkpoint. Store an evidence path and digest where possible. Write the state after every decisive observation, pivot, or long-running checkpoint. At resume, read the contract, open hypotheses, strongest capability, last evidence, and next test before running anything.

Before a costly or ambiguous test, use `ctf_state.py plan` to record labeled
basis, unknowns, a control, ordered steps, outcome conditions, the maximum claim,
and an evidence destination. Use `summary --plan` as the execution handoff.

## Preserve critical-path continuity

Keep the sequential exploit chain with one owner in one continuous session while
that session remains usable. Combine independent read-only inventory checks at
intake, then make dependent decisions from their returned evidence. Do not spend
new agents or model turns on planning, status, bookkeeping, reporting, or a
duplicate review that the owner can perform directly. Use a handoff only for an
independent branch, material context pressure, tool isolation, or a failed
session, and pass the compact state rather than the full transcript.

## Prevent common agent failures

### Imagined observations

Label statements `OBSERVED`, `INFERRED`, or `HYPOTHESIS`. Only tool output, inspected bytes/source, or direct source material is observed. Run the command before reasoning from its expected result.

### Narrative lock-in

For the leading hypothesis, name the strongest contrary fact and a cheap rejection test. Keep one alternative that explains the same symptom differently. New evidence may change the intended category or attack surface.

### Repetitive loops

An attempt must change an input, state, hypothesis, tool, or measurement. After repeated failures under unchanged conditions, stop retrying and inspect the failure mechanism. Record the rejected branch so compaction or a fresh session does not rediscover it blindly.

### Context flooding

Keep raw decompiler output, packet dumps, debugger logs, and scan output in evidence files. Bring only decisive excerpts and their locations into the working context. Prefer small targeted reads over entire repositories or binaries.

### Premature brute force

Calculate the candidate space, expected throughput, probability of success, checkpoint plan, and available budget first. Look for algebraic, format, prefix, oracle, or verifier constraints that shrink the space. Sample a small batch to measure real throughput before scaling.

### Expensive interactions

For an oracle behind a visit, login, restart, rate limit, or short-lived object, measure setup time and per-measurement time separately. Check whether multiple observations can reuse the same live state. A small controlled sequence should confirm that each observation is attributable to the intended state and that the state has not changed in a way that invalidates later samples. Estimate total cost from the number of expensive interactions plus the measurements inside them. If the interaction count dominates, improve information gained per interaction before tuning individual waits.

### Local/remote drift

Record runtime, library, loader, architecture, browser, service configuration, and protocol differences. Parameterize the solver and validate assumptions separately. Never hide a remote-only failure behind a local flag.

## Manage branches by evidence value

Choose the next action by expected information gain divided by cost. Short checks that eliminate several hypotheses outrank elaborate exploit construction on an unverified primitive.

Use branch timeboxes as pivot triggers. When a branch consumes its allotted time
without a new observation or capability, run the
[capability-to-impact checkpoint](capability-to-impact.md). Continue only when a
test can strengthen the capability, establish a new constraint, or bridge to a
security-relevant operation. Otherwise summarize the branch, record the
unresolved assumption, and move to the best materially different alternative.
Return only when new evidence changes its value.

Maintain one primary chain and one fallback when possible. A fallback should differ in primitive, entry point, or assumption; cosmetic payload variants are one branch.

### Parallel investigation

Delegate only when two or more materially different questions can be tested independently and the expected time saved exceeds coordination cost. Give each investigator the same permitted player contract, artifact hashes, and time budget, then one branch question, a rejection test, allowed target effects, a separate scratch path, and a boundary that excludes the other branches' tests. Assign any shared test to one owner. For an independent or blind run, do not pass another investigator's hypothesis, prior challenge notes, or a known solution. Converge on the main owner as soon as the remaining chain becomes sequential.

One coordinator owns shared state, the capability map, and the final solver. Coordinate rate limits and access to stateful targets before concurrent requests; one target operator may be needed. A branch handoff identifies exact commands and evidence paths, labels observations and inferences, records rejected explanations, and names the capability gained or next discriminating test. The coordinator checks underlying evidence and reproduces a claimed primitive before building on it. Before a follow-on branch, pass the relevant negative tests with their exact setup and measured observable so the next investigator can identify what remains untested. Stop duplicate branches and merge results before assigning new searches. Use an independent clean replay for the final proof when feasible.

Treat branch timeboxes as latest report times, not scheduled waits. Send a testable finding as soon as it is ready; the coordinator should integrate it on arrival and stop work that the finding makes redundant.

To judge whether parallelism helped, compare runs with the same player inputs, research permissions, time budget, and proof standard. Record time to first verified capability and clean flag, tool or token cost, duplicate work, and unsupported claims. A faster plausible answer is not a faster solve.

## Switch from exploration to proof

At the first flag-like output from the real target, record the time and pause
unrelated searches and branches. Preserve the exact request and output, save the
minimal solver, and attempt a clean replay before expanding the investigation.
If replay verifies the win condition, close redundant work. If it fails, record
which assumption broke and return to the best remaining hypothesis.

## Manage expensive work

For brute force, incremental leaks, symbolic execution, fuzzing, or corpus processing:

- use deterministic seeds when appropriate;
- log exact inputs, command, versions, and start time;
- checkpoint partial progress atomically;
- expose progress and failure rates;
- bound workers, storage, memory, and network rate;
- make resume idempotent;
- validate hits through a separate checker before continuing the exploit.

Do not let a silent background job become the entire strategy. Analyze early samples and intermediate failures; they often reveal a better model.

## Resume and handoff

A useful checkpoint lets another session answer: What is the exact win condition? What facts are verified? Which paths failed and why? What capability is currently available? What is the next discriminating test? Which command resumes the expensive work?

If no flag is obtained, deliver that state plus the strongest bounded next step. Partial progress is valuable when its proof level and limitations are explicit.
