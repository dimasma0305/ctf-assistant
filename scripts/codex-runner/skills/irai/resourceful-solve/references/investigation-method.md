# Hypothesis-driven investigation

Use the same Assuming → Searching → Proofing loop across domains, with an appropriate evidence standard.

| Domain | Specific problem statement | Useful model | Sufficient proof for the stated scope |
| --- | --- | --- | --- |
| Software engineering | Expected behavior versus observed behavior under named inputs and versions | Input, transformations, state, dependency boundaries, output | Original functional case changes from failure to success; relevant regression checks pass. |
| Defensive security | A named security property may be missing or incorrectly enforced | Assets, principals, trust boundaries, data flow, intended controls | Code/configuration establishes the finding; the repair enforces the property in non-exploitative control tests. |
| Technical research | A claim or competing explanation predicts a measurable observation | Variables, assumptions, controls, confounders, measurement procedure | Evidence answers the stated question with uncertainty, scope, and reproducible methods recorded. |

## Assuming: make uncertainty testable

Describe one concrete question. Examples: which component violates the API contract; where is an authorization decision enforced; does a claimed speedup hold on representative data?

Build only the system model needed for that question. Trace relevant inputs, transformations, decisions, state, and outputs. For source review, record file/function locations and where a lower-trust input crosses into an operation requiring a control. Inspect validation, authorization, and intended data handling without constructing an exploit.

Use a short working table when competing causes remain:

| Hypothesis | Supporting observation | What would reject it? | Next discriminating check | Status |
| --- | --- | --- | --- | --- |
| Candidate mechanism | Inspectable fact or source | Contrary observation | Bounded read or safe experiment | Open, supported, rejected, unresolved |

Keep observation, explanation, and confidence separate. Quantify confidence only when a defensible statistical procedure exists; otherwise state the specific uncertainty. Prefer a plausible rival explanation to a large list of speculative causes.

## Searching: reduce uncertainty

Search the problem's mechanism and version, not just its symptom. Connect Notion precedents, project evidence, official documentation, source code, and experiment outputs. For each retrieved claim, ask which hypothesis it affects and whether its conditions match this problem.

Use causal controls where possible: change one relevant factor, hold the others constant, and compare the result. If several factors must change, record that causal attribution remains weaker. Distinguish application misuse, dependency defects, version incompatibility, configuration, and measurement error.

In defensive security review, map a confirmed mechanism to a recognized weakness category only when the evidence fits. A scanner match, a dependency name in an advisory, or a suspicious function is a lead. Check version, configuration, relevant code paths, and existing controls before asserting applicability. State observed impact and potential impact separately; do not claim exploitability without evidence.

For research, check data provenance, units, baselines, confounders, and whether evaluation inputs leaked into tuning. A source citation supports what the source actually established, not every downstream interpretation.

## Proofing: meet a declared evidence standard

Test the proposed remedy against the original requirement and the nearest meaningful failure modes. Check an independent invariant or reference result where feasible. Keep the acceptance criterion stable during the experiment; if the user's requirement changes, explain the change and assess it separately.

For security fixes, verify the intended control in ordinary allowed/denied cases with synthetic data, along with relevant regressions. Scope the conclusion to the reviewed code and conditions. A passing test suite is evidence for its checks, not proof that a whole system has no vulnerabilities.

For empirical research, report variation and limitations. For a mathematical claim, distinguish a derivation or proof from numerical examples. If evidence is insufficient, label the remaining hypothesis and state the next observation needed.

## Final finding

Give the user a concise result containing the specific problem, affected component/version, established mechanism or remaining hypothesis, evidence locations, remedy, verification outcome, and meaningful limitations. Preserve a minimal reproducer for ordinary functional bugs or a benign control test for defensive security findings.

The security review method is informed by [OWASP Secure Code Review](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html): model trust boundaries and inspect how data and controls interact. Its use here is limited to defensive analysis and repair validation.
