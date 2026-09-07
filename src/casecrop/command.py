"""Explicit command oracle protocol. Process limits are not a security sandbox."""

from __future__ import annotations

import json
import math
import os
import signal
import subprocess
import tempfile
import time
from collections.abc import Sequence
from contextlib import suppress
from pathlib import Path

from .model import Event, Outcome, Trace


def _unique(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate outcome key")
        result[key] = value
    return result


class CommandOracle:
    """Run argv with {trace} replaced by a temporary candidate JSON path.

    Stdout must be one JSON Outcome object. Nonzero exit, timeout, excess output,
    and malformed protocol are UNRESOLVED, never evidence of the target failure.
    On POSIX a separate process group is killed after each invocation, including
    successfully exited parents. Windows cleanup covers the direct process only.
    """

    def __init__(
        self,
        argv: Sequence[str],
        *,
        timeout: float = 10,
        max_output_bytes: int = 1_000_000,
        cwd: str | Path | None = None,
    ) -> None:
        if isinstance(argv, str) or not argv or not all(isinstance(arg, str) for arg in argv):
            raise ValueError("argv must be a nonempty sequence of strings")
        if not any("{trace}" in arg for arg in argv):
            raise ValueError("command must include a {trace} placeholder")
        if isinstance(timeout, bool) or not math.isfinite(timeout) or timeout <= 0:
            raise ValueError("timeout must be finite and positive")
        if type(max_output_bytes) is not int or max_output_bytes < 1:
            raise ValueError("max_output_bytes must be positive")
        self.argv = tuple(argv)
        self.timeout = timeout
        self.max_output_bytes = max_output_bytes
        self.cwd = cwd

    def __call__(self, events: tuple[Event, ...]) -> Outcome:
        with tempfile.TemporaryDirectory(prefix="casecrop-") as directory:
            trace_path = Path(directory) / "candidate.json"
            Trace(events).save(trace_path)
            argv = [arg.replace("{trace}", str(trace_path)) for arg in self.argv]
            with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
                process = subprocess.Popen(
                    argv,
                    cwd=self.cwd,
                    stdout=output,
                    stderr=errors,
                    stdin=subprocess.DEVNULL,
                    start_new_session=os.name == "posix",
                )
                stop = ""
                deadline = time.monotonic() + self.timeout
                try:
                    while process.poll() is None:
                        if (
                            os.fstat(output.fileno()).st_size + os.fstat(errors.fileno()).st_size
                            > self.max_output_bytes
                        ):
                            stop = "command output limit exceeded"
                            break
                        if time.monotonic() >= deadline:
                            stop = "command timed out"
                            break
                        time.sleep(0.01)
                finally:
                    if os.name == "posix":
                        with suppress(ProcessLookupError):
                            os.killpg(process.pid, signal.SIGKILL)
                    elif process.poll() is None:
                        process.kill()
                    process.wait()
                if (
                    os.fstat(output.fileno()).st_size + os.fstat(errors.fileno()).st_size
                    > self.max_output_bytes
                ):
                    stop = "command output limit exceeded"
                if stop:
                    return Outcome.unresolved(stop)
                if process.returncode != 0:
                    return Outcome.unresolved("command exited unsuccessfully")
                output.seek(0)
                try:
                    data = json.loads(
                        output.read(self.max_output_bytes).decode("utf-8"),
                        object_pairs_hook=_unique,
                    )
                    if not isinstance(data, dict) or set(data) - {"verdict", "signature", "reason"}:
                        raise ValueError("invalid outcome")
                    return Outcome(**data)
                except (ValueError, TypeError, UnicodeError, RecursionError):
                    return Outcome.unresolved("command returned invalid outcome JSON")
