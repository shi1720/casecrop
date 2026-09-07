"""Deterministic workload; measured runtime is machine-dependent, not a speed guarantee."""

import json
import platform
import time

from casecrop import Event, Outcome, Trace, minimize

rows = []
for size in (100, 200, 400, 800):
    trace = Trace(Event(str(i)) for i in range(size))

    def oracle(events, expected=size):
        return Outcome.fail("irreducible") if len(events) == expected else Outcome.pass_()

    start = time.perf_counter()
    result = minimize(trace, oracle, max_calls=5 * size)
    elapsed = time.perf_counter() - start
    assert result.one_minimal and len(result.reduced.events) == size
    rows.append({"events": size, "seconds": round(elapsed, 6), "oracle_calls": result.oracle_calls})
print(
    json.dumps(
        {"python": platform.python_version(), "platform": platform.platform(), "results": rows},
        indent=2,
    )
)
