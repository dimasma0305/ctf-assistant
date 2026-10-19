---
name: ctf-deep-solve
description: "Solve hard authorized CTFs end to end across web, pwn, crypto, reversing, forensics, OSINT, or misc, with verified flag recovery. Do not use for authoring or quick quality screens."
---

# CTF Deep Solve

Solve the authorized challenge by repeating **Assuming → Searching → Proofing** until a clean flag or a specific external blocker. Classify material claims as `OBSERVED`, `INFERRED`, or `HYPOTHESIS`; never invent output, access, offsets, plaintext, or flags.

## Contract and workspace

Record the challenge, prompt, inputs, endpoint, credentials, flag format, rules, scope, deliverable, access mode, and UTC start time. Hash original artifacts and analyze copies. Keep secrets and flags out of public queries, third-party services, logs, and source control.

Stay inside the declared target. If an endpoint or artifact is missing, continue useful static work and identify the exact missing input; do not test similar public systems. Use the repository's challenge layout and checkpoint rules when present, otherwise keep a dedicated workspace and concise state record. For long handoffs, prefer `scripts/ctf_state.py summary <file> --compact`.

Keep one owner for a sequential exploit chain. Batch independent reads. Delegate only when authorized and when bounded independent work is likely to save more time than handoff and verification.

Load detail only when needed:

- sustained or branched work: [long-run strategy](references/long-run-strategy.md)
- category mechanics: load only [web](references/web.md), [pwn](references/pwn.md), [crypto](references/crypto.md), [reversing](references/reversing.md), [forensics](references/forensics.md), [OSINT](references/osint.md), or [misc](references/misc.md)
- research, acquisition, and tool choice: [research and tooling](references/research-and-tooling.md)
- a primitive with an unclear route to impact: [capability-to-impact](references/capability-to-impact.md)
- approaching or checking the win condition: [proof standard](references/proof-standard.md)
- methodology review or repeated narrative lock-in: [researcher operating style](references/researcher-operating-style.md)

## Assuming

Establish ordinary behavior and model inputs, outputs, state, trust boundaries, parsers, protections, mathematical assumptions, environmental constraints, and the win condition.

Keep a small hypothesis ledger. For each candidate mechanism, record supporting observations, a falsifier, the cheapest discriminating test, and the capability it could unlock. Rank by information gain, reachability, and exploit value. Trace controlled data or constraints to the decisive operation; an API name or framework alone does not establish a vulnerability.

## Searching

Widen in this order:

1. Supplied bytes, source, configuration, versions, and ordinary runtime behavior.
2. Prior private evidence only when it is in scope and the evaluation mode permits it; skip it for blind work.
3. Version-matched primary documentation, upstream source, specifications, advisories, papers, issue trackers, and official tool documentation.
4. Exact dependency releases or maintained tools when local inspection or execution can decide a hypothesis.
5. Exact-title searches and public writeups only when rules and evaluation mode allow them; record the exposure and do not call the run blind.

Research produces leads. Preserve source and access-mode provenance, then confirm version, configuration, data flow, and behavior locally. At a dependency boundary, compare minimal contract-valid and malformed inputs before assigning fault to the library or integration. Preserve commands and decisive output from interactive tools.

Keep reusable skills challenge agnostic. Store payloads, flags, exact tricks, writeups, and run evidence in the challenge workspace. A fresh blind investigator receives only permitted player inputs and general methodology.

Turn observations into verified capabilities such as read, write, oracle, state change, execution, key recovery, or forged-object acceptance. Record setup cost, lifetime, per-measurement cost, constraints, and proof level. After each capability, update the map from player input to flag and test the cheapest missing link. Before batching one state, compare stable-state and known-different controls so each observation remains attributable.

Maintain one primary path and one materially different evidence-backed fallback. Classify each plateau as capability gain, new constraint, equivalent variation, setup failure, or proof-ready. Repeat only when the next test can change the map; otherwise pivot or repair setup. Estimate brute-force space and throughput, checkpoint long work, and make solvers fail loudly when assumptions break. Parameterize endpoints and other instance values; hard-code one only when it is an invariant and record why.

Before a costly live trial of generated executable input, parse the final rendered input with a compatible parser, verify receiver limits and serialization, and replay a known accepted path through the same receiver. Distinguish syntax, serialization, limit, and runtime failures. Spend the live trial only after every local gate passes.

When adapting an upstream PoC, separate privileged test-harness setup from steps an ordinary target account can perform. Check whether that account can inspect the proposed proof artifact; if directory access prevents inspection, verify the resulting capability through an authorized behavior instead. Plan cleanup while the gained privilege or session is still available, then confirm it was revoked.

For a command crossing multiple shells or operating systems, run a low-privilege control through the same launcher and inspect the final argument or its exact error before the privileged trial. Check path separators, quoting, variable expansion, and redirection at the receiving process; a successful process launch alone does not prove the intended command ran.

## Proofing

At the first flag-like result through the real target, timestamp it, pause unrelated branches, preserve the smallest solver, and replay from a clean start. Prove the real win condition from player inputs; a primitive, paper chain, local placeholder, decoy, cached response, or author fixture is not a solve. For remote tasks, validate the remote path. Check flag format and characterize probabilistic reliability.

Preserve first-result and clean-replay times from the declared start. Capture visible before/after evidence when it proves a meaningful GUI state, and preserve the exact request when the successful path differs from the UI. Do not imply an interaction that was not used. Do not submit to an external scoreboard without user authorization.

If proof fails, return to Assuming with the new observation. Report the highest verified level: analysis, primitive, partial chain, local flag, or remote flag. Continue while authorization, budget, target access, and useful tests remain.

## Delivery

Finish exploitation and clean proof before delivery housekeeping. During exploitation, do not search for optional reporting material, inspect version-control state, or clean incidental files. For a requested formal write-up, use [CTF Report](../ctf-report/SKILL.md) when it is present; if it is unavailable, write the requested evidence-backed result directly without searching for it. Include the verified flag or explicit unverified status, root cause, exploit chain, reproducible solver or commands, access mode, proof, reliability, timing, and the best next test for a partial result. Read access to Notion does not authorize a write; use [CTF Notion Capture](../ctf-notion-capture/SKILL.md) only when requested after proof.

Stop only for verified completion, a user or budget stop, loss of authorization, or a specific blocker that available evidence cannot resolve. Several rejected hypotheses are progress, not a blocker. Use [CTF Workflow Improve](../ctf-workflow-improve/SKILL.md) for reusable process defects and keep challenge evidence out of this skill.
