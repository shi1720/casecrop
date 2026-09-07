import json
from dataclasses import FrozenInstanceError

import pytest

from casecrop import Event, Outcome, Trace
from casecrop.model import canonical


@pytest.mark.parametrize(
    "items",
    [
        [Event("a"), Event("a")],
        [Event("a", requires=["a"])],
        [Event("a", requires=["b"]), Event("b")],
        [Event("a", requires=["missing"])],
    ],
)
def test_invalid_graph(items):
    with pytest.raises(ValueError):
        Trace(items)


@pytest.mark.parametrize(
    "payload", [float("nan"), float("inf"), {1: "coerced"}, {"bad": (1, 2)}, {1}, object()]
)
def test_no_lossy_json(payload):
    with pytest.raises(ValueError):
        Event("a", payload)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"id": ""},
        {"id": " "},
        {"id": "x" * 201},
        {"id": "a", "requires": "abc"},
        {"id": "a", "requires": ["b", "b"]},
        {"id": "a", "pinned": 1},
        {"id": "a", "cost": True},
        {"id": "a", "cost": 0},
    ],
)
def test_event_validation(kwargs):
    with pytest.raises(ValueError):
        Event(**kwargs)


def test_roundtrip_is_byte_stable_and_large_arrays_work(tmp_path):
    t = Trace([Event("big", [0] * 800_000)])
    path = tmp_path / "trace.json"
    t.save(path)
    loaded = Trace.load(path)
    assert loaded == t
    assert loaded.digest == t.digest
    assert len(path.read_bytes()) < 8_000_000


def test_depth_and_size_limits():
    value = None
    for _ in range(66):
        value = [value]
    with pytest.raises(ValueError, match="nesting"):
        Event("a", value)
    with pytest.raises(ValueError, match="8 MB"):
        canonical("x" * 8_000_001)
    with pytest.raises(ValueError, match="8 MB"):
        Trace.from_json("x" * 8_000_001)
    with pytest.raises(ValueError, match="10000"):
        Trace(Event(str(i)) for i in range(10_001))


@pytest.mark.parametrize(
    "value",
    [
        None,
        [],
        {},
        {"schema_version": True, "events": []},
        {"schema_version": 2, "events": []},
        {"schema_version": 1, "events": {}},
        {"schema_version": 1, "events": [{"id": "a", "unknown": 1}]},
        {"schema_version": 1, "events": [{"id": "a", "requires": "b"}]},
    ],
)
def test_strict_schema(value):
    with pytest.raises(ValueError):
        Trace.from_dict(value)


def test_duplicate_keys_rejected():
    with pytest.raises(ValueError, match="duplicate JSON key"):
        Trace.from_json('{"schema_version":1,"schema_version":1,"events":[]}')


def test_frozen_and_detached():
    event = Event("a", {"hello": ["world"]})
    with pytest.raises(FrozenInstanceError):
        event.id = "b"
    event.payload["hello"].clear()
    assert event.payload == {"hello": ["world"]}
    detached = event.to_dict()
    detached["payload"]["hello"].clear()
    assert event.payload == {"hello": ["world"]}
    assert json.loads(Trace([event]).to_json()) == Trace([event]).to_dict()


@pytest.mark.parametrize(
    "args",
    [("bad",), ("fail", ""), ("pass", "x"), ("unresolved", "x"), ("fail", 1), ("pass", "", 1)],
)
def test_outcome_validation(args):
    with pytest.raises(ValueError):
        Outcome(*args)
