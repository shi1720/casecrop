# Validation and review

Release candidate: v0.1.0, 2026-09-07. These are reproducible checks and observed results, not certification of every environment or production deployment history.

## Python

The local Python 3.12.14 suite passes **164 tests**, with **96% statement coverage** over `src/casecrop`. Coverage is measured with coverage.py; CI enforces at least 95%. The repository CI matrix targets Python 3.10, 3.11, 3.12, 3.13, and 3.14. Check the GitHub Actions run for the current matrix status rather than inferring support solely from this document.

Coverage includes:

- Unique IDs, chronology, missing/self/forward dependencies, pins, empty traces, and a long nonrecursive chain.
- Generated DAGs and nonmonotonic predicates, with independently computed closure-deletion invariants.
- Exact physical-call budgets, complete repetition groups, baseline validation, unrelated signatures, unresolved outcomes, and final-replay flakiness.
- Detached payloads, finite JSON, strict schema, duplicate keys, size/depth limits, and large-array round trips.
- Command output protocol, bad exit status, malformed/nested JSON, output bounds including seeked files, wall-time termination, and literal argv handling.
- Three actual broken/fixed systems across several noise sizes.
- Executable CLI exports, artifact conflict protection, and a separate command-oracle integration.
- Raw browser JSON fidelity, unsafe-integer rejection, compact exports, and unresolved corrected controls.

The external cart regression also passes. The package builds as a source distribution and a typed pure-Python wheel. Ruff and strict mypy pass.

## Browser engine and UI

`scripts/test-engine.mjs` loads the pinned Pyodide package and exact Python bundle, then compares each complete report to the native Python output. All three example reports match field for field. Budget exhaustion and invalid-input paths also execute in WebAssembly.

There are **14 browser cases**: seven workflows on desktop Chromium and a mobile Chromium viewport. They cover actual Python execution, both export paths used by the UI, event inspection, experiment navigation, corrected controls, alternate systems, budget exhaustion, invalid-input recovery, raw duplicate JSON keys, cancellation/retry, keyboard controls, docs navigation, and horizontal overflow. Automated axe checks find no tested WCAG A/AA violations on the lab and documentation pages. This is automated coverage, not a complete manual accessibility audit. Mobile Chromium viewport testing does not claim native Safari coverage.

Real WebMCP validation in the in-app browser confirmed both registered tools, a valid reduction updating the visible lab and readback, and rejection of invalid case/noise input. Browsers without this optional API retain all normal UI functionality.

The production website build succeeds. `npm audit` reports zero known vulnerabilities for the installed dependency graph at validation time. Generated component sources are excluded from project-specific lint, but remain typechecked and exercised in browser accessibility tests.

## Independent review and iterations

Two independent agents reviewed the implementation; a follow-up product review assessed documentation and the lab. They reported and we fixed:

1. Cubic audit bookkeeping from repeated tuple membership; replaced by a candidate-ID set.
2. Compact-vs-pretty JSON size mismatch; canonical trace serialization now round-trips.
3. Duplicate command JSON keys and decoder recursion errors; malformed protocol is unresolved.
4. Falsy browser traces silently becoming demos; supplied traces now undergo explicit validation.
5. Stale generated regression files on output reuse; CLI refuses existing artifact names.
6. JavaScript input normalization changing numeric types or dropping duplicate keys; raw JSON now reaches Python unchanged. Unsafe browser integers are explicitly rejected.
7. Pretty browser trace exports exceeding loader bounds; compact Python serialization is exported directly.
8. Unresolved corrected controls receiving success styling; verification text and styling now follow the actual outcome.
9. Output-file seeking bypassing position-based limits; command bounds use actual file sizes.
10. Failed tool-driven case changes leaving mismatched metadata; case selection commits only after success.

11. A cold-start CI run exposed a dangling tab-to-panel ARIA reference; explicit relationships at the call site and a keyboard regression now cover all three panels. Expanded axe checks also corrected contrast in the reference diff and keyboard access to scrolling content.

Reviewers additionally checked 2,000 random DAG/pin/nonmonotonic-outcome combinations in independent scratch scripts. Those supplementary experiments are reported as reviewer observations, not a substitute for the committed property tests.

## Performance evidence

A reviewer used the same machine and Python 3.9.6 to isolate an audit overhead regression in a supported-style irreducible workload. Python 3.9 is not a supported package target; the review imported source directly only to compare the algorithm under identical conditions.

| Events | Before the audit fix | After | Physical calls |
|---:|---:|---:|---:|
| 100 | 0.168 s | 0.0114 s | 205 |
| 200 | 1.259 s | 0.0423 s | 410 |
| 400 | 9.914 s | 0.1671 s | 820 |
| 800 | not measured | 0.6472 s | 1,640 |

The 400-event bookkeeping case improved about 59×. This is a before/after comparison of an implementation defect, **not** a benchmark against other reduction tools. A fresh supported-Python run is committed in [benchmark-results.json](benchmark-results.json), including platform and Python version. Run `python scripts/benchmark.py` to reproduce the workload; timing will vary.

## Remaining scope limits

This release does not promise global minimum size, prove causality, infer dependencies, sandbox replay code, statistically validate flaky oracles, support distributed capture, or offer async/parallel reduction. A callback can still hang; a process can escape ordinary group cleanup. Large reports can consume substantial memory. See SECURITY.md and the API reference for those boundaries.
