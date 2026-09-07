# Python API reference

```python
from casecrop import Event, Trace, Outcome, Result, BaselineError, minimize
from casecrop.command import CommandOracle
```

## Event

`Event(id, payload=None, *, requires=(), pinned=False, cost=1)`

An immutable event. `id` is a unique, nonblank string up to 200 characters. `payload` is finite JSON data with string object keys and a maximum nesting depth of 64. Each `requires` ID must refer to an earlier event in the eventual trace; duplicates are rejected. `pinned` is strictly boolean. `cost` is a positive integer, not a weighted-optimization instruction.

`event.payload` returns a new decoded copy on every access. `event.to_dict()` returns a detached JSON object. `Event.from_dict(value)` parses an event, rejecting unknown fields.

## Trace

`Trace(events)` materializes an iterable of Event objects and validates it before any oracle call. Maximum 10,000 events and 8 MB of canonical ASCII JSON, inclusive. IDs cannot repeat. Forward, self, and missing prerequisites are errors. Order is never rearranged.

- `events`: immutable tuple of Event objects.
- `ids`: tuple of IDs in execution order.
- `cost`: sum of positive event cost metadata.
- `digest`: SHA-256 of canonical versioned trace JSON.
- `to_dict()` / `from_dict(value)`: versioned JSON objects.
- `to_json()` / `from_json(text)`: canonical JSON; duplicate object keys rejected.
- `save(path)` / `load(path)`: UTF-8 files. Direct `save` overwrites an existing target; CLI artifact directories protect known output names.

Trace schema: `{ "schema_version": 1, "events": [...] }`. An empty trace is valid.

## Outcome

- `Outcome.fail(signature)`: original failure reproduced; nonblank signature up to 200 characters.
- `Outcome.pass_()`: replay is valid and the target failure is absent.
- `Outcome.unresolved(reason="")`: experiment cannot support a verdict; reason up to 2,000 characters.
- `to_dict()`: `{verdict, signature, reason}`.

Only a fail outcome may carry a signature. Failure identity is application-defined, so use stable semantic codes such as `cart.negative_total.v1`, not arbitrary exception messages or unstable stack addresses. Avoid secrets in signatures and reasons.

## minimize

```python
result = minimize(
    trace,
    oracle,                  # Callable[[tuple[Event, ...]], Outcome]
    max_calls=500,
    repeats=1,
    signature=None,
    oracle_id="unspecified",
)
```

Runs synchronously. The oracle must reset replay state on every invocation. Exceptions propagate; non-Outcome returns raise TypeError. Use a closure or `functools.partial` to pass dependencies to your oracle.

`max_calls` is a positive physical-invocation budget. It includes baseline, repeated samples, audit, and final confirmation; cache hits are free. It must allow at least `repeats` invocations for a complete baseline. A repetition group is not partially started if the remaining budget is insufficient.

`repeats` must be positive. Every sample must agree on verdict and failure signature; disagreement becomes unresolved. This detects some inconsistent behavior but is not statistical confidence.

`signature` optionally pins the target instead of learning it from baseline. `oracle_id` is caller-supplied provenance metadata up to 200 characters. No persistent cache spans oracle IDs or runs.

Raises `BaselineError` if the complete original trace does not consistently reproduce the expected failure. Baseline errors produce no Result. During search, unrelated signatures are unresolved. Stable fail/pass outcomes are cached within the run. Unresolved observations are retried. Final confirmation always bypasses the cache.

## Result

- `original`, `reduced`: Trace objects.
- `signature`: original target failure identity.
- `status`: `complete`, `budget_exhausted`, `unresolved`, or `unstable`.
- `one_minimal`: audit complete with every permitted closure deletion passing, and fresh reproduction confirmed. Assumes deterministic oracle.
- `confirmed`: final uncached replay consistently reproduced the target.
- `oracle_calls`, `cache_hits`: physical calls and candidate cache uses.
- `trials`: tuple of Trial records (`number`, `phase`, `kept`, aggregated `outcome`, raw `samples`, `cached`).
- `witnesses`: tuple of Witness records (`event`, `removed`, `verdict`, `trial`). Protected deletions have no trial; budget exhaustion may leave partial witnesses. Only claim a complete audit when `one_minimal` is true.
- `max_calls`, `repeats`, `oracle_id`: configuration.
- `to_dict()`, `to_json()`, `save(path)`: export complete evidence. Reports include payloads and are not automatically redacted.

A budget-exhausted result preserves the most recently accepted target-failing trace, but its final confirmation is incomplete. An unstable result was observed failing earlier but failed final confirmation; do not call it a verified reproducer.

## CommandOracle

`CommandOracle(argv, *, timeout=10, max_output_bytes=1_000_000, cwd=None)`

A callable suitable for `minimize`. `argv` must be a nonempty sequence of strings containing at least one `{trace}` placeholder, replaced with the temporary candidate filename. No shell is invoked. Working directory defaults to the caller's directory.

The program must exit 0 and write one JSON Outcome to stdout. Nonzero exit, malformed JSON, duplicate keys, timeout, or excess combined stdout/stderr become unresolved. An executable that cannot be started raises OSError. stderr content is not copied into reports. Wall-time and output limits are checked at approximately 10ms intervals, so output can overshoot. POSIX process-group cleanup is not a sandbox; see SECURITY.md.

## CLI

```text
casecrop demo [--case cache|counter|permission] [--noise 30]
              [--output DIR] [--max-calls 500] [--repeats 1]
              [--json] [--require-minimal]
casecrop reduce TRACE --output DIR [--signature CODE] [--oracle-id ID]
                [--timeout 10] [--max-calls 500] [--repeats 1]
                [--json] [--require-minimal] --oracle PROGRAM ARGS...
```

All reducer options must precede `--oracle`. Arguments after it are passed directly to the program. Use an explicit interpreter path when working in virtual environments.

CLI output: `reduced.json`, `report.json`, and for demo commands only, `test_regression.py`. An output directory may exist, but none of these reserved files may already exist. Files unrelated to the command are untouched. Exit codes: 0 on normal completion, 1 when `--require-minimal` is set and verification is incomplete, 2 on input/setup errors.
