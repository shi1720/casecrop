"""Deterministic complement reduction followed by a closure-deletion audit."""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .model import Event, Outcome, Trace

Oracle = Callable[[tuple[Event, ...]], Outcome]


class BaselineError(ValueError):
    """The original input did not consistently reproduce the target failure."""


class _BudgetExhausted(Exception):
    pass


@dataclass(frozen=True)
class Trial:
    number: int
    phase: str
    kept: tuple[str, ...]
    outcome: Outcome
    samples: tuple[Outcome, ...]
    cached: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "number": self.number,
            "phase": self.phase,
            "kept": list(self.kept),
            "outcome": self.outcome.to_dict(),
            "samples": [s.to_dict() for s in self.samples],
            "cached": self.cached,
        }


@dataclass(frozen=True)
class Witness:
    event: str
    removed: tuple[str, ...]
    verdict: str
    trial: int | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "event": self.event,
            "removed": list(self.removed),
            "verdict": self.verdict,
            "trial": self.trial,
        }


@dataclass(frozen=True)
class Result:
    original: Trace
    reduced: Trace
    signature: str
    status: str
    one_minimal: bool
    confirmed: bool
    oracle_calls: int
    cache_hits: int
    trials: tuple[Trial, ...]
    witnesses: tuple[Witness, ...]
    max_calls: int
    repeats: int
    oracle_id: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "algorithm": "closure-ddmin-v1",
            "oracle_id": self.oracle_id,
            "input_digest": self.original.digest,
            "signature": self.signature,
            "status": self.status,
            "one_minimal": self.one_minimal,
            "confirmed": self.confirmed,
            "oracle_calls": self.oracle_calls,
            "cache_hits": self.cache_hits,
            "config": {"max_calls": self.max_calls, "repeats": self.repeats},
            "original": self.original.to_dict(),
            "reduced": self.reduced.to_dict(),
            "trials": [trial.to_dict() for trial in self.trials],
            "witnesses": [witness.to_dict() for witness in self.witnesses],
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2, ensure_ascii=True) + "\n"

    def save(self, path: str | Path) -> None:
        Path(path).write_text(self.to_json(), encoding="utf-8")


@dataclass
class _Run:
    trace: Trace
    oracle: Oracle
    max_calls: int
    repeats: int
    target: str | None
    oracle_id: str
    calls: int = 0
    hits: int = 0
    trials: list[Trial] = field(default_factory=list)
    cache: dict[tuple[str, ...], tuple[Outcome, tuple[Outcome, ...]]] = field(default_factory=dict)

    def test(self, candidate: tuple[Event, ...], phase: str, *, fresh: bool = False) -> Outcome:
        key = tuple(e.id for e in candidate)
        cached = key in self.cache and not fresh
        if cached:
            outcome, samples = self.cache[key]
            self.hits += 1
        else:
            if self.calls + self.repeats > self.max_calls:
                raise _BudgetExhausted
            observed = []
            for _ in range(self.repeats):
                self.calls += 1
                # Propagate programmer errors. An accidental crash is not bug reproduction.
                sample = self.oracle(candidate)
                if not isinstance(sample, Outcome):
                    raise TypeError("oracle must return an Outcome; booleans are ambiguous")
                observed.append(sample)
            samples = tuple(observed)
            kinds = {(sample.verdict, sample.signature) for sample in samples}
            if len(kinds) != 1:
                outcome = Outcome.unresolved("inconsistent outcomes across repeated trials")
            else:
                outcome = samples[0]
                if outcome.verdict == "fail" and self.target and outcome.signature != self.target:
                    outcome = Outcome.unresolved("different failure signature")
            # Unknown results are deliberately retried rather than cached as stable facts.
            if outcome.verdict != "unresolved":
                self.cache[key] = (outcome, samples)
        self.trials.append(Trial(len(self.trials) + 1, phase, key, outcome, samples, cached))
        return outcome

    @staticmethod
    def delete(current: tuple[Event, ...], removed: set[str]) -> tuple[Event, ...] | None:
        """Linear forward cascade. Earlier-prerequisite validation makes one pass sufficient."""
        kept = []
        for event in current:
            if event.id in removed or any(dep in removed for dep in event.requires):
                if event.pinned:
                    return None
                removed.add(event.id)
            else:
                kept.append(event)
        return tuple(kept)

    def execute(self) -> Result:
        current = self.trace.events
        baseline = self.test(current, "baseline", fresh=True)
        if baseline.verdict != "fail":
            detail = f": {baseline.reason}" if baseline.reason else f" ({baseline.verdict})"
            raise BaselineError(
                "baseline does not consistently reproduce the target failure" + detail
            )
        self.target = baseline.signature
        witnesses: list[Witness] = []
        status, minimal, confirmed = "budget_exhausted", False, False
        try:
            n = 2
            while current:
                size = max(1, (len(current) + n - 1) // n)
                accepted = False
                for start in range(0, len(current), size):
                    chunk = {e.id for e in current[start : start + size]}
                    candidate = self.delete(current, chunk)
                    if candidate is None or candidate == current:
                        continue
                    if self.test(candidate, "reduce").verdict == "fail":
                        current = candidate
                        n = max(2, n - 1)
                        accepted = True
                        break
                if accepted:
                    continue
                if n >= len(current):
                    break
                n = min(len(current), n * 2)

            # Audit every allowed closure deletion. Restart after any further reduction:
            # an earlier PASS can become FAIL when the current context changes.
            while True:
                witnesses = []
                changed = False
                for event in current:
                    candidate = self.delete(current, {event.id})
                    if candidate is None:
                        witnesses.append(Witness(event.id, (), "protected", None))
                        continue
                    candidate_ids = {e.id for e in candidate}
                    removed = tuple(e.id for e in current if e.id not in candidate_ids)
                    outcome = self.test(candidate, "audit")
                    witnesses.append(
                        Witness(event.id, removed, outcome.verdict, self.trials[-1].number)
                    )
                    if outcome.verdict == "fail":
                        current = candidate
                        changed = True
                        break
                if not changed:
                    break
            minimal = all(w.verdict in ("pass", "protected") for w in witnesses)
            confirmation = self.test(current, "confirm", fresh=True)
            confirmed = confirmation.verdict == "fail"
            if not confirmed:
                status, minimal = "unstable", False
            else:
                status = "complete" if minimal else "unresolved"
        except _BudgetExhausted:
            minimal = False
        return Result(
            self.trace,
            Trace(current),
            self.target,
            status,
            minimal,
            confirmed,
            self.calls,
            self.hits,
            tuple(self.trials),
            tuple(witnesses),
            self.max_calls,
            self.repeats,
            self.oracle_id,
        )


def minimize(
    trace: Trace,
    oracle: Oracle,
    *,
    max_calls: int = 500,
    repeats: int = 1,
    signature: str | None = None,
    oracle_id: str = "unspecified",
) -> Result:
    """Shrink a trace while preserving the original failure and dependency validity.

    The oracle must reset its state each call and return an Outcome. The call budget
    counts physical invocations, including repeats, baseline and final confirmation.
    Uncaught oracle exceptions propagate. This function does not sandbox or preempt it.
    Assuming a deterministic oracle, a complete result is 1-minimal under cascade
    deletions, not globally smallest. Repetition cannot prove determinism.
    """
    if not isinstance(trace, Trace):
        raise TypeError("trace must be a Trace")
    if not callable(oracle):
        raise TypeError("oracle must be callable")
    if type(repeats) is not int or repeats < 1:
        raise ValueError("repeats must be a positive integer")
    if type(max_calls) is not int or max_calls < repeats:
        raise ValueError("max_calls must allow at least one complete baseline trial")
    if signature is not None:
        Outcome.fail(signature)
    if not isinstance(oracle_id, str) or not oracle_id.strip() or len(oracle_id) > 200:
        raise ValueError("oracle_id must be a nonempty string of at most 200 characters")
    return _Run(trace, oracle, max_calls, repeats, signature, oracle_id).execute()
