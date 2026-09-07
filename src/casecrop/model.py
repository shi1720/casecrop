"""Portable, validated data structures. No code is loaded from trace files."""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

MAX_EVENTS = 10_000
MAX_BYTES = 8_000_000
Verdict = Literal["fail", "pass", "unresolved"]


def canonical(value: Any) -> str:
    """Validate JSON without lossy key/type coercion, then encode canonically."""

    def check(item: Any, depth: int = 0) -> None:
        if depth > 64:
            raise ValueError("JSON nesting exceeds 64 levels")
        if item is None or type(item) in (str, bool, int):
            return
        if type(item) is float and math.isfinite(item):
            return
        if type(item) is list:
            for child in item:
                check(child, depth + 1)
            return
        if type(item) is dict and all(type(key) is str for key in item):
            for child in item.values():
                check(child, depth + 1)
            return
        raise ValueError("Payloads must contain finite JSON values with string object keys")

    check(value)
    encoded = json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
    if len(encoded) > MAX_BYTES:
        raise ValueError("JSON exceeds 8 MB")
    return encoded


def _text(value: Any, name: str, limit: int = 200) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError(f"{name} must be a nonempty string of at most {limit} characters")
    return value


@dataclass(frozen=True, init=False)
class Event:
    """An immutable event with a detached JSON payload and earlier prerequisites."""

    id: str
    _payload_json: str
    requires: tuple[str, ...]
    pinned: bool
    cost: int

    def __init__(
        self,
        id: str,
        payload: Any = None,
        *,
        requires: Iterable[str] = (),
        pinned: bool = False,
        cost: int = 1,
    ) -> None:
        _text(id, "event id")
        if isinstance(requires, str):
            raise ValueError("requires must be a sequence of event IDs, not a string")
        deps = tuple(requires)
        for dep in deps:
            _text(dep, "dependency id")
        if len(set(deps)) != len(deps):
            raise ValueError("duplicate dependency")
        if type(pinned) is not bool:
            raise ValueError("pinned must be a boolean")
        if type(cost) is not int or cost < 1:
            raise ValueError("cost must be a positive integer")
        object.__setattr__(self, "id", id)
        object.__setattr__(self, "_payload_json", canonical(payload))
        object.__setattr__(self, "requires", deps)
        object.__setattr__(self, "pinned", pinned)
        object.__setattr__(self, "cost", cost)

    @property
    def payload(self) -> Any:
        """A new value on every access: an oracle cannot mutate the source trace."""
        return json.loads(self._payload_json)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "payload": self.payload,
            "requires": list(self.requires),
            "pinned": self.pinned,
            "cost": self.cost,
        }

    @classmethod
    def from_dict(cls, value: Any) -> Event:
        if not isinstance(value, dict) or "id" not in value:
            raise ValueError("each event must be an object with an id")
        if set(value) - {"id", "payload", "requires", "pinned", "cost"}:
            raise ValueError("unknown event fields")
        if not isinstance(value.get("requires", []), list):
            raise ValueError("requires must be an array")
        return cls(
            value["id"],
            value.get("payload"),
            requires=value.get("requires", []),
            pinned=value.get("pinned", False),
            cost=value.get("cost", 1),
        )


@dataclass(frozen=True, init=False)
class Trace:
    events: tuple[Event, ...]

    def __init__(self, events: Iterable[Event]) -> None:
        items = tuple(events)
        if len(items) > MAX_EVENTS:
            raise ValueError(f"trace exceeds {MAX_EVENTS} events")
        seen: set[str] = set()
        for event in items:
            if not isinstance(event, Event):
                raise TypeError("trace entries must be Event objects")
            if event.id in seen:
                raise ValueError(f"duplicate event id: {event.id}")
            if not set(event.requires) <= seen:
                raise ValueError(f"{event.id}: prerequisites must exist before the event")
            seen.add(event.id)
        object.__setattr__(self, "events", items)
        canonical(self.to_dict())

    @property
    def ids(self) -> tuple[str, ...]:
        return tuple(event.id for event in self.events)

    @property
    def cost(self) -> int:
        return sum(event.cost for event in self.events)

    @property
    def digest(self) -> str:
        return hashlib.sha256(canonical(self.to_dict()).encode()).hexdigest()

    def to_dict(self) -> dict[str, Any]:
        return {"schema_version": 1, "events": [e.to_dict() for e in self.events]}

    def to_json(self) -> str:
        return canonical(self.to_dict())

    @classmethod
    def from_dict(cls, value: Any) -> Trace:
        if not isinstance(value, dict) or set(value) != {"schema_version", "events"}:
            raise ValueError("trace requires exactly schema_version and events")
        if type(value["schema_version"]) is not int or value["schema_version"] != 1:
            raise ValueError("unsupported trace schema_version")
        if not isinstance(value["events"], list):
            raise ValueError("events must be an array")
        return cls(Event.from_dict(event) for event in value["events"])

    @classmethod
    def from_json(cls, value: str) -> Trace:
        if len(value.encode("utf-8")) > MAX_BYTES:
            raise ValueError("trace exceeds 8 MB")

        def unique(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
            result: dict[str, Any] = {}
            for key, item in pairs:
                if key in result:
                    raise ValueError(f"duplicate JSON key: {key}")
                result[key] = item
            return result

        return cls.from_dict(json.loads(value, object_pairs_hook=unique))

    @classmethod
    def load(cls, path: str | Path) -> Trace:
        with Path(path).open("rb") as stream:
            data = stream.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError("trace exceeds 8 MB")
        return cls.from_json(data.decode("utf-8"))

    def save(self, path: str | Path) -> None:
        Path(path).write_text(self.to_json(), encoding="utf-8")


@dataclass(frozen=True)
class Outcome:
    verdict: Verdict
    signature: str = ""
    reason: str = ""

    def __post_init__(self) -> None:
        if self.verdict not in ("fail", "pass", "unresolved"):
            raise ValueError("verdict must be fail, pass, or unresolved")
        if not isinstance(self.signature, str) or len(self.signature) > 200:
            raise ValueError("signature must be a string of at most 200 characters")
        if not isinstance(self.reason, str) or len(self.reason) > 2000:
            raise ValueError("reason must be a string of at most 2000 characters")
        if self.verdict == "fail":
            _text(self.signature, "failure signature")
        elif self.signature:
            raise ValueError("only fail outcomes have a signature")

    @classmethod
    def fail(cls, signature: str) -> Outcome:
        return cls("fail", signature)

    @classmethod
    def pass_(cls) -> Outcome:
        return cls("pass")

    @classmethod
    def unresolved(cls, reason: str = "") -> Outcome:
        return cls("unresolved", reason=reason)

    def to_dict(self) -> dict[str, str]:
        return {"verdict": self.verdict, "signature": self.signature, "reason": self.reason}
