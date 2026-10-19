#!/usr/bin/env python3
"""Run a solver once and capture a timestamped, hashed proof receipt."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_dir", type=Path, help="New directory for receipt and raw streams")
    parser.add_argument("--flag-regex", help="ASCII regex for first observed flag; match text is never copied to metadata")
    try:
        divider = sys.argv.index("--")
    except ValueError:
        parser.error("separate the solver command with --")
    args = parser.parse_args(sys.argv[1:divider])
    command = sys.argv[divider + 1:]
    if not command:
        parser.error("provide a solver command after --")
    try:
        flag_pattern = re.compile(args.flag_regex.encode("ascii")) if args.flag_regex else None
    except (UnicodeEncodeError, re.error) as exc:
        parser.error(f"invalid ASCII flag regex: {exc}")
    if args.output_dir.exists():
        parser.error(f"refusing to overwrite existing capture directory: {args.output_dir}")
    args.output_dir.mkdir(parents=True)

    start_utc = utc_now()
    start_ns = time.monotonic_ns()
    first_match: dict[str, str | int] = {}
    match_lock = threading.Lock()
    streams: dict[str, dict[str, str | int]] = {}
    launch_error = None
    exit_code = 127

    try:
        child = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        def capture(name: str, pipe, visible) -> None:
            digest = hashlib.sha256()
            count = 0
            tail = b""
            path = args.output_dir / f"{name}.bin"
            with path.open("wb") as saved:
                while chunk := os.read(pipe.fileno(), 4096):
                    saved.write(chunk)
                    digest.update(chunk)
                    visible.write(chunk)
                    visible.flush()
                    if flag_pattern and not first_match:
                        found = flag_pattern.search(tail + chunk)
                        if found:
                            with match_lock:
                                if not first_match:
                                    first_match.update({
                                        "stream": name,
                                        "observed_utc": utc_now(),
                                        "observed_elapsed_seconds": round((time.monotonic_ns() - start_ns) / 1e9, 6),
                                        "end_offset": count - len(tail) + found.end(),
                                    })
                    count += len(chunk)
                    tail = (tail + chunk)[-4096:]
            pipe.close()
            streams[name] = {"path": path.name, "bytes": count, "sha256": digest.hexdigest()}

        threads = [
            threading.Thread(target=capture, args=("stdout", child.stdout, sys.stdout.buffer)),
            threading.Thread(target=capture, args=("stderr", child.stderr, sys.stderr.buffer)),
        ]
        for thread in threads:
            thread.start()
        exit_code = child.wait()
        for thread in threads:
            thread.join()
    except OSError as exc:
        launch_error = f"{type(exc).__name__}: {exc}"
        print(launch_error, file=sys.stderr)

    receipt = {
        "schema": 1,
        "start_utc": start_utc,
        "end_utc": utc_now(),
        "elapsed_seconds": round((time.monotonic_ns() - start_ns) / 1e9, 6),
        "exit_code": exit_code,
        "executable": Path(command[0]).name,
        "streams": streams,
        "first_pattern_match": first_match or None,
        "launch_error": launch_error,
    }
    temporary = args.output_dir / ".receipt.json.tmp"
    temporary.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, args.output_dir / "receipt.json")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
