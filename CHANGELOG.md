# Changelog

## 0.1.1 — 2026-09-07

- Rebuilt the browser workbench around trace inspection, with stable event IDs, payload summaries, direct action labels, and compact documentation.
- Show the configuration that produced each report, distinguish saved results from browser runs, and flag unapplied settings. Keep downloads tied to the displayed report.
- Distinguish a failed final replay from incomplete verification, and describe reference-fix checks within their actual scope.
- Preserve Unicode in browser exports, validate normalized UTF-8 size before execution, and reject invalid Unicode with an actionable error. Exported traces can be reimported within the same browser limits.
- Reuse the Python runtime after ordinary input errors; retry initialization only when initialization itself fails. Include the replay reason in baseline errors.
- Add regression coverage for the above behaviors and CI smoke tests against the built production worker.

## 0.1.0 — 2026-09-07

Initial beta release: zero-dependency typed Python SDK; ordered dependency-valid trace reduction; pinned prerequisites; semantic failure matching; three-valued outcomes; repeated observations; physical call budgets; stable-result cache; closure deletion audit; uncached final reproduction; strict JSON traces; command oracle; CLI artifact export; executable golden controls; cart integration; Python-powered browser lab.

Independent review led to fixes for cubic audit bookkeeping, large-trace round-tripping, duplicate command JSON keys, excessive JSON nesting, falsy custom trace handling, and output artifact conflicts. API is pre-1.0; production adoption is not claimed.
