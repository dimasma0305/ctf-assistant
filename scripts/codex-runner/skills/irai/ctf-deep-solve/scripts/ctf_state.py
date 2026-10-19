#!/usr/bin/env python3
"""Maintain an atomic, compact state file for a long CTF solve."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path


STATUSES = {"triage", "assuming", "searching", "proofing", "partial", "blocked", "solved"}
RESULTS = {"supported", "rejected", "partial", "failed", "blocked", "succeeded"}
PROOF_LEVELS = {"analysis", "primitive", "partial-chain", "local-flag", "remote-flag", "platform-accepted"}
FLAG_PROOFS = {"local-flag", "remote-flag", "platform-accepted"}
CAPABILITY_RELIABILITY = {"single-observation", "repeatable", "probabilistic"}
PLAN_BASIS_KINDS = {"OBSERVED", "REPORTED", "INFERRED", "HYPOTHESIS"}
PLAN_CLAIM_LEVELS = {"observation", "capability", "proof"}
PIVOT_DECISIONS = {
    "stronger-capability": {"bridge", "prove"},
    "new-constraint": {"bridge", "pivot"},
    "equivalent-variation": {"pivot"},
    "setup-failure": {"repair"},
    "proof-ready": {"prove"},
    "external-blocker": {"block"},
}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load(path: Path) -> dict:
    try:
        data = json.loads(path.read_text())
    except FileNotFoundError as exc:
        raise SystemExit(f"State file does not exist: {path}") from exc
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON state file {path}: {exc}") from exc
    required = {"schema", "challenge", "status", "hypotheses", "observations", "attempts", "proofs"}
    missing = required - data.keys()
    if missing:
        raise SystemExit(f"State file is missing keys: {', '.join(sorted(missing))}")
    # Schema 1 state files predate explicit capability and pivot records.
    data.setdefault("capabilities", [])
    data.setdefault("pivots", [])
    data.setdefault("plans", [])
    return data


def save(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = now()
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def next_id(items: list[dict], prefix: str) -> str:
    return f"{prefix}{len(items) + 1}"


def require_hypothesis(data: dict, hypothesis_id: str | None) -> None:
    if hypothesis_id and not any(item["id"] == hypothesis_id for item in data["hypotheses"]):
        raise SystemExit(f"Unknown hypothesis: {hypothesis_id}")


def command_init(args: argparse.Namespace) -> None:
    if args.file.exists():
        raise SystemExit(f"Refusing to overwrite existing state: {args.file}")
    timestamp = now()
    data = {
        "schema": 1,
        "created_at": timestamp,
        "updated_at": timestamp,
        "status": "triage",
        "challenge": {
            "name": args.name,
            "event": args.event,
            "category": args.category,
            "goal": args.goal,
            "flag_format": args.flag_format,
            "scope": args.scope,
            "access_mode": args.access_mode,
            "research_policy": args.research_policy,
        },
        "artifact_hashes": [],
        "hypotheses": [],
        "observations": [],
        "attempts": [],
        "capabilities": [],
        "pivots": [],
        "plans": [],
        "proofs": [],
        "next_action": args.next_action,
    }
    save(args.file, data)
    print(f"Initialized {args.file}")


def command_hypothesis(args: argparse.Namespace) -> None:
    data = load(args.file)
    item = {
        "id": next_id(data["hypotheses"], "H"),
        "created_at": now(),
        "priority": args.priority,
        "status": "open",
        "statement": args.statement,
        "basis": args.basis,
        "reject_if": args.reject_if,
        "test": args.test,
        "unlocks": args.unlocks,
    }
    data["hypotheses"].append(item)
    data["next_action"] = args.test
    save(args.file, data)
    print(item["id"])


def command_observe(args: argparse.Namespace) -> None:
    data = load(args.file)
    require_hypothesis(data, args.hypothesis)
    item = {
        "id": next_id(data["observations"], "O"),
        "created_at": now(),
        "fact": args.fact,
        "source": args.source,
        "evidence": args.evidence,
        "hypothesis": args.hypothesis,
    }
    data["observations"].append(item)
    if args.next_action:
        data["next_action"] = args.next_action
    save(args.file, data)
    print(item["id"])


def command_attempt(args: argparse.Namespace) -> None:
    data = load(args.file)
    require_hypothesis(data, args.hypothesis)
    item = {
        "id": next_id(data["attempts"], "A"),
        "created_at": now(),
        "hypothesis": args.hypothesis,
        "action": args.action,
        "result": args.result,
        "observation": args.observation,
        "evidence": args.evidence,
    }
    data["attempts"].append(item)
    if args.hypothesis and args.result in {"supported", "rejected"}:
        for hypothesis in data["hypotheses"]:
            if hypothesis["id"] == args.hypothesis:
                hypothesis["status"] = args.result
                break
    data["next_action"] = args.next_action
    save(args.file, data)
    print(item["id"])


def command_capability(args: argparse.Namespace) -> None:
    data = load(args.file)
    require_hypothesis(data, args.hypothesis)
    item = {
        "id": next_id(data["capabilities"], "C"),
        "created_at": now(),
        "primitive": args.primitive,
        "control": args.control,
        "constraints": args.constraints,
        "observable": args.observable,
        "reliability": args.reliability,
        "impact_link": args.impact_link,
        "bridge_test": args.bridge_test,
        "evidence": args.evidence,
        "hypothesis": args.hypothesis,
    }
    data["capabilities"].append(item)
    data["next_action"] = args.next_action or args.bridge_test
    save(args.file, data)
    print(item["id"])


def parse_plan_basis(values: list[str]) -> list[dict[str, str]]:
    parsed = []
    for value in values:
        kind, separator, statement = value.partition(":")
        kind = kind.strip().upper()
        statement = statement.strip()
        if not separator or kind not in PLAN_BASIS_KINDS or not statement:
            choices = ", ".join(sorted(PLAN_BASIS_KINDS))
            raise SystemExit(
                f"Plan basis must be KIND:text with KIND in: {choices}"
            )
        parsed.append({"kind": kind, "statement": statement})
    return parsed


def command_plan(args: argparse.Namespace) -> None:
    data = load(args.file)
    require_hypothesis(data, args.hypothesis)
    basis = parse_plan_basis(args.basis)
    item = {
        "id": next_id(data["plans"], "T"),
        "created_at": now(),
        "question": args.question,
        "basis": basis,
        "unknowns": args.unknown,
        "control": args.control,
        "steps": [
            {"order": index, "action": action}
            for index, action in enumerate(args.step, 1)
        ],
        "success_if": args.success_if,
        "failure_if": args.failure_if,
        "max_claim_level": args.max_claim_level,
        "claim_scope": args.claim_scope,
        "evidence": args.evidence,
        "hypothesis": args.hypothesis,
    }
    data["plans"].append(item)
    data["next_action"] = args.next_action or args.step[0]
    save(args.file, data)
    print(item["id"])


def command_pivot(args: argparse.Namespace) -> None:
    data = load(args.file)
    allowed = PIVOT_DECISIONS[args.classification]
    if args.decision not in allowed:
        choices = ", ".join(sorted(allowed))
        raise SystemExit(
            f"Decision {args.decision!r} is inconsistent with "
            f"{args.classification!r}; choose: {choices}"
        )
    item = {
        "id": next_id(data["pivots"], "V"),
        "created_at": now(),
        "branch": args.branch,
        "trigger": args.trigger,
        "classification": args.classification,
        "decision": args.decision,
        "evidence": args.evidence,
        "next_action": args.next_action,
    }
    data["pivots"].append(item)
    data["next_action"] = args.next_action
    save(args.file, data)
    print(item["id"])


def command_proof(args: argparse.Namespace) -> None:
    data = load(args.file)
    item = {
        "id": next_id(data["proofs"], "P"),
        "created_at": now(),
        "level": args.level,
        "method": args.method,
        "evidence": args.evidence,
        "clean_run": args.clean_run,
        "target": args.target,
    }
    data["proofs"].append(item)
    data["status"] = "proofing" if args.level not in FLAG_PROOFS or not args.clean_run else "solved"
    data["next_action"] = args.next_action
    save(args.file, data)
    print(item["id"])


def command_status(args: argparse.Namespace) -> None:
    data = load(args.file)
    if args.status == "solved" and not any(
        proof["level"] in FLAG_PROOFS and proof["clean_run"] for proof in data["proofs"]
    ):
        raise SystemExit("Cannot mark solved without a clean local, remote, or platform flag proof")
    data["status"] = args.status
    if args.next_action is not None:
        data["next_action"] = args.next_action
    save(args.file, data)
    print(args.status)


def command_hash(args: argparse.Namespace) -> None:
    data = load(args.file)
    data["artifact_hashes"].append({"path": args.path, "sha256": args.sha256, "recorded_at": now()})
    save(args.file, data)
    print(args.sha256)


def one_line(value: object) -> str:
    """Collapse user-controlled state text into one readable checkpoint line."""
    return " ".join(str(value).split())


def compact_summary(data: dict) -> str:
    challenge = data["challenge"]
    observation = data["observations"][-1] if data["observations"] else None
    capability = data["capabilities"][-1] if data["capabilities"] else None
    open_hypotheses = [item for item in data["hypotheses"] if item["status"] == "open"]
    hypothesis = open_hypotheses[-1] if open_hypotheses else None
    proof = data["proofs"][-1] if data["proofs"] else None
    lines = [
        f"STATUS: {data['status']} | GOAL: {one_line(challenge['goal'])}",
        (
            f"OBSERVED: {observation['id']} {one_line(observation['fact'])} "
            f"[{one_line(observation['evidence'])}]"
            if observation else "OBSERVED: none"
        ),
        (
            f"SUPPORTED: {capability['id']} {one_line(capability['primitive'])}; "
            f"constraints={one_line(capability['constraints'])}; "
            f"next_link={one_line(capability['impact_link'])} "
            f"[{one_line(capability['evidence'])}]"
            if capability else "SUPPORTED: none"
        ),
        (
            f"HYPOTHESIS: {hypothesis['id']} {one_line(hypothesis['statement'])}; "
            f"reject_if={one_line(hypothesis['reject_if'])}; "
            f"test={one_line(hypothesis['test'])}"
            if hypothesis else "HYPOTHESIS: none open"
        ),
        f"NEXT: {one_line(data.get('next_action') or 'not recorded')}",
        (
            f"PROOF: {proof['id']} {proof['level']} "
            f"({'clean' if proof['clean_run'] else 'exploratory'}); "
            f"{one_line(proof['method'])} [{one_line(proof['evidence'])}]"
            if proof else "PROOF: none"
        ),
    ]
    return "\n".join(lines)


def plan_summary(data: dict) -> str:
    if not data["plans"]:
        return "PLAN: none"
    plan = data["plans"][-1]
    basis = " | ".join(
        f"{item['kind']}={one_line(item['statement'])}"
        for item in plan["basis"]
    )
    unknowns = " | ".join(one_line(value) for value in plan["unknowns"])
    steps = " -> ".join(
        f"{step['order']}. {one_line(step['action'])}" for step in plan["steps"]
    )
    lines = [
        f"QUESTION: {plan['id']} {one_line(plan['question'])}",
        f"BASIS: {basis}",
        f"UNKNOWNS: {unknowns}",
        f"CONTROL: {one_line(plan['control'])}",
        f"STEPS: {steps}",
        (
            f"OUTCOMES: success={one_line(plan['success_if'])}; "
            f"failure={one_line(plan['failure_if'])}; "
            f"max_claim={plan['max_claim_level']} "
            f"({one_line(plan['claim_scope'])}) "
            f"[{one_line(plan['evidence'])}]"
        ),
    ]
    return "\n".join(lines)


def command_summary(args: argparse.Namespace) -> None:
    data = load(args.file)
    if args.json:
        print(json.dumps(data, indent=2, sort_keys=True))
        return
    if args.compact:
        print(compact_summary(data))
        return
    if args.plan:
        print(plan_summary(data))
        return
    challenge = data["challenge"]
    print(f"# {challenge['name']} — {data['status']}")
    print(f"Category: {challenge['category']} | Access: {challenge['access_mode']}")
    print(f"Goal: {challenge['goal']}")
    print(f"Next: {data.get('next_action') or 'not recorded'}")
    print("\n## Open hypotheses")
    open_items = [item for item in data["hypotheses"] if item["status"] == "open"]
    if not open_items:
        print("- none")
    for item in open_items:
        print(f"- {item['id']} [{item['priority']}]: {item['statement']} — test: {item['test']}")
    print("\n## Latest observations")
    for item in data["observations"][-5:]:
        print(f"- {item['id']}: {item['fact']} ({item['source']})")
    if not data["observations"]:
        print("- none")
    print("\n## Strongest recent capabilities")
    if not data["capabilities"]:
        print("- none")
    for item in data["capabilities"][-3:]:
        print(
            f"- {item['id']}: {item['primitive']} — control: {item['control']} — "
            f"next link: {item['impact_link']}"
        )
    print("\n## Latest pivots")
    if not data["pivots"]:
        print("- none")
    for item in data["pivots"][-3:]:
        print(
            f"- {item['id']}: {item['classification']} → {item['decision']} "
            f"[{item['evidence']}]"
        )
    print("\n## Current test plan")
    if not data["plans"]:
        print("- none")
    else:
        plan = data["plans"][-1]
        print(f"- {plan['id']}: {plan['question']} — control: {plan['control']}")
        for step in plan["steps"]:
            print(f"  {step['order']}. {step['action']}")
    print("\n## Proof")
    if not data["proofs"]:
        print("- none")
    for item in data["proofs"]:
        clean = "clean" if item["clean_run"] else "exploratory"
        print(f"- {item['id']}: {item['level']} ({clean}) — {item['method']} [{item['evidence']}]")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    sub = root.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init", help="Create a new state file")
    init.add_argument("file", type=Path)
    init.add_argument("--name", required=True)
    init.add_argument("--event", default="unknown")
    init.add_argument("--category", default="unknown")
    init.add_argument("--goal", required=True)
    init.add_argument("--flag-format", default="unknown")
    init.add_argument("--scope", required=True)
    init.add_argument("--access-mode", choices=["blind", "black-box", "source-assisted", "writeup-assisted", "author-assisted"], default="black-box")
    init.add_argument("--research-policy", default="generic public research allowed; exact writeups unconfirmed")
    init.add_argument("--next-action", default="Inventory artifacts and establish ordinary behavior")
    init.set_defaults(func=command_init)

    hypothesis = sub.add_parser("hypothesis", help="Add a testable hypothesis")
    hypothesis.add_argument("file", type=Path)
    hypothesis.add_argument("--statement", required=True)
    hypothesis.add_argument("--basis", required=True)
    hypothesis.add_argument("--reject-if", required=True)
    hypothesis.add_argument("--test", required=True)
    hypothesis.add_argument("--unlocks", required=True)
    hypothesis.add_argument("--priority", choices=["high", "medium", "low"], default="medium")
    hypothesis.set_defaults(func=command_hypothesis)

    observe = sub.add_parser("observe", help="Record a verified observation")
    observe.add_argument("file", type=Path)
    observe.add_argument("--fact", required=True)
    observe.add_argument("--source", required=True)
    observe.add_argument("--evidence", required=True)
    observe.add_argument("--hypothesis")
    observe.add_argument("--next-action")
    observe.set_defaults(func=command_observe)

    attempt = sub.add_parser("attempt", help="Record an attempted test or exploit step")
    attempt.add_argument("file", type=Path)
    attempt.add_argument("--hypothesis")
    attempt.add_argument("--action", required=True)
    attempt.add_argument("--result", choices=sorted(RESULTS), required=True)
    attempt.add_argument("--observation", required=True)
    attempt.add_argument("--evidence", required=True)
    attempt.add_argument("--next-action", required=True)
    attempt.set_defaults(func=command_attempt)

    capability = sub.add_parser("capability", help="Record a capability-to-impact checkpoint")
    capability.add_argument("file", type=Path)
    capability.add_argument("--primitive", required=True)
    capability.add_argument("--control", required=True)
    capability.add_argument("--constraints", required=True)
    capability.add_argument("--observable", required=True)
    capability.add_argument("--reliability", choices=sorted(CAPABILITY_RELIABILITY), required=True)
    capability.add_argument("--impact-link", required=True)
    capability.add_argument("--bridge-test", required=True)
    capability.add_argument("--evidence", required=True)
    capability.add_argument("--hypothesis")
    capability.add_argument("--next-action")
    capability.set_defaults(func=command_capability)

    plan = sub.add_parser("plan", help="Record a bounded, evidence-producing test plan")
    plan.add_argument("file", type=Path)
    plan.add_argument("--question", required=True)
    plan.add_argument(
        "--basis", action="append", required=True, metavar="KIND:TEXT",
        help="repeatable; KIND is OBSERVED, REPORTED, INFERRED, or HYPOTHESIS",
    )
    plan.add_argument("--unknown", action="append", required=True)
    plan.add_argument("--control", required=True)
    plan.add_argument("--step", action="append", required=True)
    plan.add_argument("--success-if", required=True)
    plan.add_argument("--failure-if", required=True)
    plan.add_argument(
        "--max-claim-level", choices=sorted(PLAN_CLAIM_LEVELS), required=True,
    )
    plan.add_argument("--claim-scope", required=True)
    plan.add_argument("--evidence", required=True)
    plan.add_argument("--hypothesis")
    plan.add_argument("--next-action")
    plan.set_defaults(func=command_plan)

    pivot = sub.add_parser("pivot", help="Record and validate an evidence-aware branch decision")
    pivot.add_argument("file", type=Path)
    pivot.add_argument("--branch", required=True)
    pivot.add_argument("--trigger", required=True)
    pivot.add_argument("--classification", choices=sorted(PIVOT_DECISIONS), required=True)
    pivot.add_argument(
        "--decision",
        choices=sorted({decision for decisions in PIVOT_DECISIONS.values() for decision in decisions}),
        required=True,
    )
    pivot.add_argument("--evidence", required=True)
    pivot.add_argument("--next-action", required=True)
    pivot.set_defaults(func=command_pivot)

    proof = sub.add_parser("proof", help="Record an achieved proof level")
    proof.add_argument("file", type=Path)
    proof.add_argument("--level", choices=sorted(PROOF_LEVELS), required=True)
    proof.add_argument("--method", required=True)
    proof.add_argument("--evidence", required=True)
    proof.add_argument("--target", required=True)
    proof.add_argument("--clean-run", action="store_true")
    proof.add_argument("--next-action", default="Prepare reproducible deliverable")
    proof.set_defaults(func=command_proof)

    status = sub.add_parser("status", help="Change solve status")
    status.add_argument("file", type=Path)
    status.add_argument("status", choices=sorted(STATUSES))
    status.add_argument("--next-action")
    status.set_defaults(func=command_status)

    artifact_hash = sub.add_parser("hash", help="Record an artifact SHA-256")
    artifact_hash.add_argument("file", type=Path)
    artifact_hash.add_argument("--path", required=True)
    artifact_hash.add_argument("--sha256", required=True)
    artifact_hash.set_defaults(func=command_hash)

    summary = sub.add_parser("summary", help="Print a handoff")
    summary.add_argument("file", type=Path)
    summary_format = summary.add_mutually_exclusive_group()
    summary_format.add_argument("--json", action="store_true")
    summary_format.add_argument("--compact", action="store_true", help="Print six decision-relevant lines")
    summary_format.add_argument("--plan", action="store_true", help="Print the current structured test plan")
    summary.set_defaults(func=command_summary)
    return root


def main() -> int:
    args = parser().parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
