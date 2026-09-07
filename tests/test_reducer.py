import itertools

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from casecrop import BaselineError, Event, Outcome, Trace, minimize


def test_dependencies_and_pinned_ancestors():
    trace = Trace(
        [
            Event("setup"),
            Event("pinned", requires=["setup"], pinned=True),
            Event("noise"),
            Event("bug"),
        ]
    )
    seen = []

    def oracle(events):
        ids = {e.id for e in events}
        assert {"setup", "pinned"} <= ids
        seen.append(ids)
        return Outcome.fail("x") if "bug" in ids else Outcome.pass_()

    r = minimize(trace, oracle)
    assert r.reduced.ids == ("setup", "pinned", "bug")
    assert r.one_minimal and r.confirmed
    assert [w.verdict for w in r.witnesses] == ["protected", "protected", "pass"]
    assert r.oracle_calls == len(seen)


@pytest.mark.parametrize("size", [0, 1, 2, 10])
def test_empty_failure_is_valid(size):
    r = minimize(Trace(Event(str(i)) for i in range(size)), lambda _: Outcome.fail("constant"))
    assert not r.reduced.events
    assert r.one_minimal and r.confirmed and r.status == "complete"


def test_nonmonotonic_not_claimed_globally_smallest():
    trace = Trace(Event(str(i)) for i in range(4))
    # All four fail and the empty trace fails, but all intermediate candidates pass.
    r = minimize(trace, lambda e: Outcome.fail("x") if len(e) in (0, 4) else Outcome.pass_())
    assert len(r.reduced.events) == 4
    assert r.one_minimal
    assert all(w.verdict == "pass" for w in r.witnesses)


@pytest.mark.parametrize(
    "outcome", [Outcome.pass_(), Outcome.unresolved("missing"), Outcome.fail("other")]
)
def test_baseline_must_match(outcome):
    with pytest.raises(BaselineError):
        minimize(Trace([Event("a")]), lambda _: outcome, signature="target")


def test_wrong_failure_never_counts_as_success():
    trace = Trace([Event("a"), Event("b")])
    r = minimize(trace, lambda e: Outcome.fail("target" if len(e) == 2 else "different"))
    assert r.reduced == trace
    assert r.status == "unresolved" and r.confirmed and not r.one_minimal
    assert any(t.outcome.reason == "different failure signature" for t in r.trials)


def test_final_confirmation_bypasses_cache():
    calls = 0

    def oracle(events):
        nonlocal calls
        if not events:
            return Outcome.pass_()
        calls += 1
        return Outcome.fail("x") if calls == 1 else Outcome.pass_()

    r = minimize(Trace([Event("a")]), oracle)
    assert r.status == "unstable"
    assert not r.confirmed and not r.one_minimal
    assert r.trials[-1].phase == "confirm" and not r.trials[-1].cached


def test_repetition_rejects_flaky_baseline():
    outcomes = itertools.cycle([Outcome.fail("x"), Outcome.pass_()])
    with pytest.raises(BaselineError):
        minimize(Trace([Event("a")]), lambda _: next(outcomes), repeats=3)


@pytest.mark.parametrize("budget", range(1, 35))
def test_every_physical_call_counts(budget):
    calls = []
    trace = Trace(Event(str(i)) for i in range(10))

    def oracle(e):
        calls.append(e)
        return Outcome.fail("x") if any(x.id == "4" for x in e) else Outcome.pass_()

    r = minimize(trace, oracle, max_calls=budget)
    assert r.oracle_calls == len(calls) <= budget
    assert "4" in r.reduced.ids
    if r.status == "budget_exhausted":
        assert not r.one_minimal and not r.confirmed


@pytest.mark.parametrize("budget", [3, 4, 5, 6, 10, 20])
def test_budget_does_not_partially_run_repetitions(budget):
    r = minimize(
        Trace([Event("a")]),
        lambda e: Outcome.fail("x") if e else Outcome.pass_(),
        max_calls=budget,
        repeats=3,
    )
    assert r.oracle_calls % 3 == 0 and r.oracle_calls <= budget


def test_oracle_programmer_errors_propagate():
    def broken(_):
        raise RuntimeError("oracle defect")

    with pytest.raises(RuntimeError, match="oracle defect"):
        minimize(Trace([]), broken)
    with pytest.raises(TypeError, match="Outcome"):
        minimize(Trace([]), lambda _: True)


def test_payloads_detached_and_cache_run_local():
    original = {"values": [1]}
    event = Event("a", original)
    original["values"].append(2)

    def oracle(events):
        for e in events:
            payload = e.payload
            assert payload == {"values": [1]}
            payload["values"].append(3)
        return Outcome.fail("x") if events else Outcome.pass_()

    a = minimize(Trace([event]), oracle)
    b = minimize(Trace([event]), oracle)
    assert a.to_json() == b.to_json()
    assert a.cache_hits > 0


@pytest.mark.parametrize(
    "kwargs",
    [
        {"max_calls": 0},
        {"max_calls": True},
        {"repeats": 0},
        {"repeats": False},
        {"max_calls": 2, "repeats": 3},
        {"signature": ""},
        {"oracle_id": ""},
    ],
)
def test_config_validation(kwargs):
    with pytest.raises(ValueError):
        minimize(Trace([]), lambda _: Outcome.fail("x"), **kwargs)


@settings(max_examples=150, deadline=None)
@given(st.integers(1, 9), st.binary(min_size=30, max_size=30))
def test_generated_dags_and_nonmonotonic_oracles(n, bits):
    events = []
    for i in range(n):
        deps = [str(j) for j in range(i) if bits[(i + j) % len(bits)] % 5 == 0]
        events.append(Event(str(i), requires=deps, pinned=bits[i] % 11 == 0))
    trace = Trace(events)
    baseline = frozenset(trace.ids)

    def oracle(candidate):
        ids = {e.id for e in candidate}
        assert all(set(e.requires) <= ids for e in candidate)
        assert all(not e.pinned or e.id in ids for e in events)
        if frozenset(ids) == baseline or sum(bits[int(e.id)] for e in candidate) % 7 == 2:
            return Outcome.fail("target")
        return Outcome.pass_()

    r = minimize(trace, oracle, max_calls=300)
    assert oracle(r.reduced.events).signature == "target"
    assert r.one_minimal and r.confirmed
    # Independently compute each forward cascade rather than calling implementation helper.
    for event in r.reduced.events:
        deleted = {event.id}
        for e in r.reduced.events:
            if set(e.requires) & deleted:
                deleted.add(e.id)
        if any(e.pinned and e.id in deleted for e in r.reduced.events):
            continue
        candidate = tuple(e for e in r.reduced.events if e.id not in deleted)
        assert oracle(candidate).verdict == "pass"


def test_long_chain_has_no_recursion():
    trace = Trace(Event(str(i), requires=[str(i - 1)] if i else []) for i in range(1500))
    r = minimize(trace, lambda e: Outcome.fail("x") if e else Outcome.pass_(), max_calls=100)
    assert r.one_minimal and r.reduced.ids == ("0",)


def test_baseline_error_preserves_actionable_reason():
    with pytest.raises(BaselineError, match="command timed out"):
        minimize(Trace([Event("one", {})]), lambda _: Outcome.unresolved("command timed out"))
