"""Small stateful systems with actual defects and corrected implementations."""

from __future__ import annotations

from typing import Any

from .model import Event, Outcome, Trace
from .reducer import Result, minimize

CASES = {
    "cache": {
        "title": "The cache that forgot who you are",
        "signature": "cache.cross_tenant",
        "description": "Two tenants. One resource ID. A cache key missing its tenant.",
        "fix": "Include the tenant ID in every cache key.",
    },
    "counter": {
        "title": "Two workers. One missing update.",
        "signature": "counter.lost_update",
        "description": "Both workers read 0. Both write 1. Two increments become one.",
        "fix": "Apply an atomic increment instead of writing a stale snapshot.",
    },
    "permission": {
        "title": "The permission that wouldn't leave",
        "signature": "auth.stale_allow",
        "description": "Access was revoked. The cached permission didn't get the memo.",
        "fix": "Invalidate the permission cache when grants change.",
    },
}


def make_trace(case: str = "cache", noise: int = 30) -> Trace:
    if case not in CASES:
        raise ValueError("unknown case")
    if type(noise) is not int or not 0 <= noise <= 500:
        raise ValueError("noise must be an integer between 0 and 500")
    if case == "cache":
        important = [
            Event("tenant-a", {"op": "tenant", "tenant": "acme"}),
            Event("tenant-b", {"op": "tenant", "tenant": "nova"}),
            Event(
                "store-a",
                {"op": "put", "tenant": "acme", "key": "invoice-7", "value": "ACME PRIVATE"},
                requires=("tenant-a",),
            ),
            Event(
                "store-b",
                {"op": "put", "tenant": "nova", "key": "invoice-7", "value": "NOVA PRIVATE"},
                requires=("tenant-b",),
            ),
            Event(
                "read-a", {"op": "get", "tenant": "acme", "key": "invoice-7"}, requires=("store-a",)
            ),
            Event(
                "read-b", {"op": "get", "tenant": "nova", "key": "invoice-7"}, requires=("store-b",)
            ),
        ]
    elif case == "counter":
        important = [
            Event("init", {"op": "init", "value": 0}),
            Event("read-a", {"op": "read", "worker": "a"}, requires=("init",)),
            Event("read-b", {"op": "read", "worker": "b"}, requires=("init",)),
            Event("write-a", {"op": "increment", "worker": "a"}, requires=("read-a",)),
            Event("write-b", {"op": "increment", "worker": "b"}, requires=("read-b",)),
        ]
    else:
        important = [
            Event("grant", {"op": "grant", "user": "alex"}),
            Event("check-a", {"op": "check", "user": "alex"}, requires=("grant",)),
            Event("revoke", {"op": "revoke", "user": "alex"}, requires=("grant",)),
            Event("check-b", {"op": "check", "user": "alex"}, requires=("grant",)),
        ]
    # Independent observations interleaved with the bug's state transitions.
    events = []
    for index, event in enumerate(important):
        events.append(event)
        for j in range(index, noise, len(important)):
            events.append(
                Event(
                    f"log-{j:03}",
                    {
                        "op": "observe",
                        "metric": ["latency", "health", "tokens", "queue_depth"][j % 4],
                        "value": j * 7 + 3,
                    },
                    cost=2,
                )
            )
    return Trace(events)


def replay(case: str, events: tuple[Event, ...], *, fixed: bool = False) -> Outcome:
    """Fresh state per invocation. The selected implementation performs every operation."""
    if case not in CASES:
        raise ValueError("unknown case")
    tenants: set[str] = set()
    storage: dict[tuple[str, str], Any] = {}
    cache: dict[Any, Any] = {}
    counter: int | None = None
    increments = 0
    initial = 0
    reads: dict[str, int] = {}
    grants: dict[str, bool] = {}
    for event in events:
        payload = event.payload
        if not isinstance(payload, dict) or not isinstance(payload.get("op"), str):
            return Outcome.unresolved("event payload needs an op")
        op = payload["op"]
        if op == "observe":
            continue
        try:
            if case == "cache":
                tenant = payload["tenant"]
                if not isinstance(tenant, str):
                    return Outcome.unresolved("tenant must be a string")
                if op == "tenant":
                    tenants.add(tenant)
                    continue
                if tenant not in tenants:
                    return Outcome.unresolved("tenant missing")
                key = payload["key"]
                if not isinstance(key, str):
                    return Outcome.unresolved("key must be a string")
                identity = (tenant, key)
                cache_key = identity if fixed else key
                if op == "put":
                    storage[identity] = payload["value"]
                    cache.pop(cache_key, None)
                elif op == "get":
                    if identity not in storage:
                        return Outcome.unresolved("resource missing")
                    if cache_key not in cache:
                        cache[cache_key] = storage[identity]
                    if cache[cache_key] != storage[identity]:
                        return Outcome.fail("cache.cross_tenant")
                else:
                    return Outcome.unresolved("unknown cache operation")
            elif case == "counter":
                if op == "init":
                    if type(payload["value"]) is not int:
                        return Outcome.unresolved("initial value must be an integer")
                    initial = counter = payload["value"]
                    increments = 0
                    reads.clear()
                elif op in ("read", "increment"):
                    worker = payload["worker"]
                    if not isinstance(worker, str) or counter is None:
                        return Outcome.unresolved("worker or counter missing")
                    if op == "read":
                        reads[worker] = counter
                    else:
                        if worker not in reads:
                            return Outcome.unresolved("worker snapshot missing")
                        counter = counter + 1 if fixed else reads[worker] + 1
                        increments += 1
                        if counter != initial + increments:
                            return Outcome.fail("counter.lost_update")
                else:
                    return Outcome.unresolved("unknown counter operation")
            else:
                user = payload["user"]
                if not isinstance(user, str):
                    return Outcome.unresolved("user must be a string")
                if op in ("grant", "revoke"):
                    grants[user] = op == "grant"
                    if fixed:
                        cache.pop(user, None)
                elif op == "check":
                    if user not in grants:
                        return Outcome.unresolved("user missing")
                    if user not in cache:
                        cache[user] = grants[user]
                    if cache[user] and not grants[user]:
                        return Outcome.fail("auth.stale_allow")
                else:
                    return Outcome.unresolved("unknown permission operation")
        except KeyError:
            return Outcome.unresolved("operation is missing a required field")
    return Outcome.pass_()


def demo(
    case: str = "cache",
    *,
    noise: int = 30,
    max_calls: int = 500,
    repeats: int = 1,
    trace: Trace | None = None,
) -> Result:
    return minimize(
        trace if trace is not None else make_trace(case, noise),
        lambda events: replay(case, events),
        max_calls=max_calls,
        repeats=repeats,
        signature=CASES[case]["signature"],
        oracle_id=f"casecrop.{case}.buggy-v1",
    )


def browser_run(request_json: str) -> str:
    """Bounded bridge used by the real Python Web Worker, never a TypeScript reimplementation."""
    import json

    request = json.loads(request_json)
    if not isinstance(request, dict):
        raise ValueError("browser request must be an object")
    case = request.get("case", "cache")
    budget = request.get("max_calls", 500)
    repeats = request.get("repeats", 1)
    if type(budget) is not int or not 1 <= budget <= 2000:
        raise ValueError("call budget must be between 1 and 2000")
    if type(repeats) is not int or not 1 <= repeats <= 3:
        raise ValueError("repeats must be between 1 and 3")
    trace = Trace.from_dict(request["trace"]) if "trace" in request else None
    if "trace_json" in request:
        raw = request["trace_json"]
        if not isinstance(raw, str) or len(raw.encode("utf-8")) > 256_000:
            raise ValueError("browser trace JSON must be a string of at most 256 KB")
        trace = Trace.from_json(raw)

    def browser_numbers(value: Any) -> None:
        if type(value) is int and abs(value) > 9_007_199_254_740_991:
            raise ValueError(
                "browser integers must be within the JavaScript safe range; use Python"
            )
        if isinstance(value, dict):
            for item in value.values():
                browser_numbers(item)
        elif isinstance(value, list):
            for item in value:
                browser_numbers(item)

    if trace is not None:
        browser_numbers(trace.to_dict())
    if trace is not None and len(trace.events) > 200:
        raise ValueError("browser traces are limited to 200 events; use Python for larger traces")
    result = demo(
        case, noise=request.get("noise", 30), max_calls=budget, repeats=repeats, trace=trace
    )
    value = result.to_dict()
    value["fixed_outcome"] = replay(case, result.reduced.events, fixed=True).to_dict()
    value["reduced_json"] = result.reduced.to_json()
    value["original_json"] = result.original.to_json()
    return json.dumps(value)
