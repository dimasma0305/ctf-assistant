#!/usr/bin/env python3
"""Behavior checks for the compact CTF solve state helper."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("ctf_state.py")


class StateHelperTests(unittest.TestCase):
    def run_state(self, *arguments: str | Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), *(str(argument) for argument in arguments)],
            text=True,
            capture_output=True,
        )

    def init(self, path: Path) -> None:
        result = self.run_state(
            "init", path,
            "--name", "generic",
            "--goal", "reach verifier",
            "--scope", "local authorized fixture",
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_records_capability_and_consistent_pivot(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary) / "state.json"
            self.init(state)
            capability = self.run_state(
                "capability", state,
                "--primitive", "controlled read",
                "--control", "one selected index",
                "--constraints", "index below 16",
                "--observable", "returned bytes",
                "--reliability", "repeatable",
                "--impact-link", "select protected object",
                "--bridge-test", "probe one boundary identifier",
                "--evidence", "evidence/read.txt",
            )
            self.assertEqual(capability.returncode, 0, capability.stderr)
            self.assertEqual(capability.stdout.strip(), "C1")

            pivot = self.run_state(
                "pivot", state,
                "--branch", "encoding variants",
                "--trigger", "timebox expired",
                "--classification", "equivalent-variation",
                "--decision", "pivot",
                "--evidence", "evidence/variants.txt",
                "--next-action", "test alternate parser boundary",
            )
            self.assertEqual(pivot.returncode, 0, pivot.stderr)
            data = json.loads(state.read_text(encoding="utf-8"))
            self.assertEqual(data["capabilities"][0]["impact_link"], "select protected object")
            self.assertEqual(data["pivots"][0]["classification"], "equivalent-variation")
            self.assertEqual(data["next_action"], "test alternate parser boundary")

    def test_rejects_inconsistent_pivot(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary) / "state.json"
            self.init(state)
            result = self.run_state(
                "pivot", state,
                "--branch", "silent oracle",
                "--trigger", "positive control also silent",
                "--classification", "setup-failure",
                "--decision", "pivot",
                "--evidence", "evidence/control.txt",
                "--next-action", "try another exploit family",
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("inconsistent", result.stderr)

    def test_loads_state_created_before_capability_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary) / "old.json"
            state.write_text(json.dumps({
                "schema": 1,
                "challenge": {
                    "name": "old", "category": "unknown", "access_mode": "black-box",
                    "goal": "test",
                },
                "status": "searching",
                "hypotheses": [],
                "observations": [],
                "attempts": [],
                "proofs": [],
                "next_action": "resume",
            }), encoding="utf-8")
            result = self.run_state("summary", state)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("## Strongest recent capabilities\n- none", result.stdout)
            self.assertIn("## Latest pivots\n- none", result.stdout)
            self.assertIn("## Current test plan\n- none", result.stdout)

    def test_records_and_renders_structured_plan(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary) / "state.json"
            self.init(state)
            result = self.run_state(
                "plan", state,
                "--question", "does the controlled path change the observable",
                "--basis", "OBSERVED:ordinary input returns marker A",
                "--basis", "REPORTED:alternate state may return marker B",
                "--unknown", "whether the alternate state is reachable",
                "--control", "repeat ordinary input under unchanged state",
                "--step", "capture the ordinary control",
                "--step", "apply one state change and capture the response",
                "--success-if", "the response changes to marker B",
                "--failure-if", "both captures return marker A",
                "--max-claim-level", "capability",
                "--claim-scope", "one repeatable controlled state change",
                "--evidence", "evidence/state-diff.txt",
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), "T1")
            data = json.loads(state.read_text(encoding="utf-8"))
            plan = data["plans"][0]
            self.assertEqual(
                [item["kind"] for item in plan["basis"]],
                ["OBSERVED", "REPORTED"],
            )
            self.assertEqual(
                [step["order"] for step in plan["steps"]], [1, 2],
            )
            self.assertEqual(data["next_action"], "capture the ordinary control")

            summary = self.run_state("summary", state, "--plan")
            self.assertEqual(summary.returncode, 0, summary.stderr)
            lines = summary.stdout.splitlines()
            self.assertEqual([line.split(":", 1)[0] for line in lines], [
                "QUESTION", "BASIS", "UNKNOWNS", "CONTROL", "STEPS", "OUTCOMES",
            ])
            self.assertIn(
                "1. capture the ordinary control -> "
                "2. apply one state change and capture the response",
                summary.stdout,
            )
            self.assertIn("max_claim=capability", summary.stdout)

    def test_rejects_malformed_plan_basis_without_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary) / "state.json"
            self.init(state)
            result = self.run_state(
                "plan", state,
                "--question", "is a signal attributable",
                "--basis", "known without a label",
                "--unknown", "signal source",
                "--control", "known-negative input",
                "--step", "capture both inputs",
                "--success-if", "only the candidate input changes",
                "--failure-if", "the control changes too",
                "--max-claim-level", "observation",
                "--claim-scope", "this input pair",
                "--evidence", "evidence/pair.txt",
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("KIND:text", result.stderr)
            data = json.loads(state.read_text(encoding="utf-8"))
            self.assertEqual(data["plans"], [])

    def test_compact_summary_contains_only_decision_state(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary) / "state.json"
            self.init(state)
            hypothesis = self.run_state(
                "hypothesis", state,
                "--statement", "parser boundaries disagree",
                "--basis", "different normalized output",
                "--reject-if", "both paths produce identical bytes",
                "--test", "compare one controlled input",
                "--unlocks", "controlled read",
            )
            self.assertEqual(hypothesis.returncode, 0, hypothesis.stderr)
            observed = self.run_state(
                "observe", state,
                "--fact", "one decoder accepts the marker",
                "--source", "local experiment",
                "--evidence", "evidence/decoder.txt",
                "--hypothesis", "H1",
            )
            self.assertEqual(observed.returncode, 0, observed.stderr)
            capability = self.run_state(
                "capability", state,
                "--primitive", "controlled read",
                "--control", "one selected path",
                "--constraints", "relative paths only",
                "--observable", "returned bytes",
                "--reliability", "repeatable",
                "--impact-link", "read protected configuration",
                "--bridge-test", "request one non-secret marker",
                "--evidence", "evidence/read.txt",
                "--hypothesis", "H1",
            )
            self.assertEqual(capability.returncode, 0, capability.stderr)
            proof = self.run_state(
                "proof", state,
                "--level", "primitive",
                "--method", "controlled marker read",
                "--evidence", "evidence/read.txt",
                "--target", "local fixture",
                "--next-action", "bridge the read to configuration",
            )
            self.assertEqual(proof.returncode, 0, proof.stderr)
            compact = self.run_state("summary", state, "--compact")
            self.assertEqual(compact.returncode, 0, compact.stderr)
            lines = compact.stdout.splitlines()
            self.assertEqual(len(lines), 6)
            self.assertEqual([line.split(":", 1)[0] for line in lines], [
                "STATUS", "OBSERVED", "SUPPORTED", "HYPOTHESIS", "NEXT", "PROOF",
            ])
            self.assertIn("evidence/read.txt", compact.stdout)
            self.assertNotIn("created_at", compact.stdout)


if __name__ == "__main__":
    unittest.main()
