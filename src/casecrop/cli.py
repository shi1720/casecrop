"""The casecrop command-line interface."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import __version__
from .command import CommandOracle
from .examples import CASES, demo
from .model import Trace
from .reducer import Result, minimize


def _write(result: Result, output: Path, case: str | None = None) -> None:
    output.mkdir(parents=True, exist_ok=True)
    if any(
        (output / name).exists() for name in ("report.json", "reduced.json", "test_regression.py")
    ):
        raise ValueError("output artifacts already exist; choose a new directory")
    result.save(output / "report.json")
    result.reduced.save(output / "reduced.json")
    if case is not None:
        (output / "test_regression.py").write_text(
            '"""Regression: the buggy control fails and the reference fix passes."""\n'
            "from pathlib import Path\nfrom casecrop import Trace\n"
            "from casecrop.examples import replay\n\n"
            'TRACE = Trace.load(Path(__file__).with_name("reduced.json"))\n\n'
            "def test_bug_reproduces():\n"
            f"    outcome = replay({case!r}, TRACE.events)\n"
            f"    assert outcome.signature == {result.signature!r}\n\n"
            "def test_golden_fix():\n"
            f"    assert replay({case!r}, TRACE.events, fixed=True).verdict == 'pass'\n",
            encoding="utf-8",
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="casecrop", description="Reduce a failing execution to a smaller regression case."
    )
    parser.add_argument("--version", action="version", version=__version__)
    commands = parser.add_subparsers(dest="command", required=True)
    demonstration = commands.add_parser(
        "demo", help="reduce a bundled failure and check its reference fix"
    )
    demonstration.add_argument("--case", choices=list(CASES), default="cache")
    demonstration.add_argument("--noise", type=int, default=30)
    demonstration.add_argument("--output", type=Path)
    reduction = commands.add_parser("reduce", help="reduce a trace with an explicit command oracle")
    reduction.add_argument("trace", type=Path)
    reduction.add_argument("--output", type=Path, required=True)
    reduction.add_argument("--signature")
    reduction.add_argument("--oracle-id", default="command")
    reduction.add_argument("--timeout", type=float, default=10)
    # Use --oracle followed by argv to avoid shell parsing and argparse remainder ambiguity.
    reduction.add_argument("--oracle", nargs=argparse.REMAINDER, required=True)
    for command in (demonstration, reduction):
        command.add_argument("--max-calls", type=int, default=500)
        command.add_argument("--repeats", type=int, default=1)
        command.add_argument("--json", action="store_true", help="write the full report to stdout")
        command.add_argument(
            "--require-minimal", action="store_true", help="exit 1 unless verified"
        )
    args = parser.parse_args(argv)
    try:
        if args.command == "demo":
            result = demo(
                args.case, noise=args.noise, max_calls=args.max_calls, repeats=args.repeats
            )
        else:
            trace = Trace.load(args.trace)
            oracle = CommandOracle(args.oracle, timeout=args.timeout)
            result = minimize(
                trace,
                oracle,
                signature=args.signature,
                max_calls=args.max_calls,
                repeats=args.repeats,
                oracle_id=args.oracle_id,
            )
        if args.output:
            _write(result, args.output, args.case if args.command == "demo" else None)
        if args.json:
            print(result.to_json(), end="")
        else:
            print(
                f"{len(result.original.events)} → {len(result.reduced.events)} events | "
                f"{result.oracle_calls} oracle calls | {result.status}"
            )
            print(f"Failure: {result.signature}")
            print(f"Confirmed: {result.confirmed} | Closure 1-minimal: {result.one_minimal}")
            if args.output:
                print(f"Artifacts: {args.output}")
        return 1 if args.require_minimal and not result.one_minimal else 0
    except (ValueError, TypeError, OSError, RecursionError) as exc:
        print(f"casecrop: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
