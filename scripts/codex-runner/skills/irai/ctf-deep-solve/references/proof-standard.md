# CTF proof standard

Use this before declaring a solve or reporting difficulty.

## Proof levels

| Level | Required evidence | Allowed claim |
| --- | --- | --- |
| Analysis | Source, binary, artifact, or runtime evidence supports a mechanism | Suspected or established root cause, scoped to evidence |
| Primitive | A controlled read/write/oracle/state transition/key relation is demonstrated | Primitive verified under stated conditions |
| Partial chain | Multiple verified stages compose but the win condition is not reached | Partial exploit chain |
| Local flag | Clean execution reaches a real local challenge flag/checker | Local solve only |
| Remote flag | Solver reaches the issued target and returns the expected flag format | Remote solve for that target/run |
| Platform accepted | Authorized submission is accepted by the event platform | Platform-verified solve |

Do not collapse these levels. A checker bypass against an author fixture, hardcoded placeholder flag, patched binary, debugger-forced branch, or copied public flag does not prove the player exploit chain.

## Clean-run proof

Start from declared player artifacts and a clean/reset state. Record:

- artifact/build identifiers or hashes;
- target endpoint and access mode without exposing credentials;
- relevant tool/runtime versions;
- exact solver command and exit status;
- declared solve start, first real flag or highest-proof timestamp, first clean
  solver completion, and their elapsed durations;
- documented pause intervals and separate wall-clock/active durations when a solve
  was intentionally paused;
- output evidence path and digest;
- whether the run used public writeups, private author material, or cached state.

For a long remote solver run, `python .agents/skills/ctf-deep-solve/scripts/capture_solver.py <new-proof-dir> --flag-regex '<flag-pattern>' -- <solver command>` can capture the UTC start/end, first observed pattern time, exit code, and hashed raw output in one execution. Keep the proof directory private when output may contain flags or credentials. The match timestamp records when the wrapper read the bytes; verify flag provenance and platform acceptance separately. Record the exact solver command in the proof note; the receipt intentionally omits arguments and matched text.

The final solver must perform every essential transformation and interaction. Remove manual debugger edits, pasted private constants, and state left behind by exploratory runs unless the challenge explicitly provides them.

## Verify the flag is real

Check the stated flag format and provenance. Ensure the value came from the intended target or verifier, not source examples, test fixtures, dependency packages, logs from another task, or public search. A format match alone is insufficient.

Submit only when the user has authorized scoreboard interaction. If submission is unavailable, report remote flag recovery separately from platform acceptance.

## Reliability and fallback

For deterministic exploits, one clean reproduction plus relevant negative checks is usually sufficient. For races, probabilistic oracles, unreliable side channels, or brute force, run enough clean trials to report attempts, successes, elapsed time, and observed failure modes. Do not claim a success rate from a single lucky run.

Where feasible, keep a fallback chain or recovery behavior for network resets and nondeterministic state. A fallback is not required when the verified path is deterministic and complete.

## Solver quality gate

The final solver should:

- accept host/port, file, URL, or other challenge inputs instead of hiding environment constants;
- enforce timeouts and bounded retries where I/O can stall;
- expose stage progress without printing secrets unnecessarily;
- fail with an actionable error when a key assumption breaks;
- separate exploit flow from helpers;
- produce stable final output and a nonzero exit on failure;
- avoid unrelated target enumeration or effects outside the win condition.

Run it from a clean working directory or documented environment. Verify the artifact referenced in the writeup is the same artifact that produced the proof.

## Difficulty and AI-performance claims

A solve proves that one path worked under one access mode, model, effort, toolset, and artifact. A miss proves only that no flag was seen in the tested run. Record full clock use separately from an early stop, and exclude blocked, contaminated, author-assisted, and paper-only attempts from blind solve-rate claims.

Do not claim that the skill beats humans or makes a challenge AI-hard without matched, repeated evaluation and inspectable traces.
