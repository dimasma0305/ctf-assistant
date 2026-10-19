---
name: resourceful-solve
description: "Diagnose and verify nontrivial software bugs, defensive findings, dependency behavior, or research questions through reproducible evidence. Do not use for CTF exploitation or experiments already owned by another workflow."
---

# Resourceful Solve

Repeat **Assuming → Searching → Proofing** until the requested outcome is demonstrated or a specific external blocker remains. Separate observation, inference, and hypothesis. For security work, use defensive source review, trust-boundary analysis, hardening, and non-exploitative regression checks; do not build exploits or autonomous attack workflows.

Load only the relevant detail:

- system models, security properties, and research controls: [investigation method](references/investigation-method.md)
- third-party attribution: [dependency fault isolation](references/dependency-isolation.md)
- performance or workflow comparisons: [measurement and comparison](references/measurement.md)
- prior internal evidence: [Notion Evidence Search](../notion-evidence-search/SKILL.md)
- isolated execution or external checks: [Tool Assisted Experiments](../tool-assisted-experiments/SKILL.md)

## Assuming

Extract the objective, constraints, environment, deliverable, and observable acceptance criteria. Inspect supplied artifacts and governing instructions first. Record expected versus actual behavior, the smallest failing input, exact output, affected versions, and relevant changes. Trace input through user code, configuration, environment, and dependencies to the first boundary that violates the requirement.

Keep a few falsifiable causes. For each, record supporting observations, likely owning component, and the cheapest discriminating test. Distinguish symptom, trigger, mechanism, and impact. A dependency stack frame does not assign fault. For optimization, freeze baseline, metric, environment, resource limits, representative inputs, and correctness conditions; report distributions and scope the claim to tested conditions.

Proceed on reversible assumptions when possible. Ask only for information that changes the objective or blocks progress. Authorization to read Notion, research online, or install locally does not authorize writing, publishing, spending, or changing unrelated services.

## Searching

Choose the smallest action that resolves the current uncertainty: inspect local evidence, read version-matched primary documentation or source, run a discriminating experiment, compare candidates on identical inputs, or perform an independent correctness check. Search exact errors, APIs, and versions before broadening. Treat issue titles and similar reports as leads until reproduced.

For suspected dependency faults, use the same version and minimal valid and malformed inputs outside the application. Compare documented contracts with actual caller inputs and outputs before attribution. Choose a remedy supported by the cause: fix caller logic or data, repair configuration, adopt a supported dependency fix, or use a documented workaround.

Batch independent reads and checks. Use subagents only when authorized, with bounded questions, inputs, artifact ownership, and acceptance criteria; verify their evidence. Keep dependent work sequential.

Exercise the user-visible path early. After failure, classify missing context, environment mismatch, rejected assumption, implementation defect, or weak measurement; change the hypothesis, input, or method before retrying. Preserve a concise checkpoint for sustained work. Complete independent implementation, commands, evidence, packaging, and verification steps before reporting the exact permission or input that blocks the rest; do not seek unrelated credentials.

## Proofing

When possible, preserve the original failure and run the same case after the change under matched conditions. Check the original acceptance criteria and repository gates relevant to the change. Use independent computation or controls for empirical claims; a new test that mirrors the implementation is weak evidence.

For security findings, define the security property and required attacker influence, establish controlled reachability through source evidence, then verify the repair with non-exploitative controls. For dependency changes, check the installed version, isolated behavior, and application integration.

If proof fails, retain useful partial work, revise the hypothesis, and continue. If the original failure cannot be reproduced, label the result unverified and state the exact missing evidence rather than claiming a demonstrated fix.

Deliver the artifact with a compact record of the suspected cause, decisive search evidence, before/after proof, commands, versions, provenance, and material limitations. Write to Notion only when the user requested it.
