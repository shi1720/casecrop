# Contributing to CaseCrop

A useful contribution includes a realistic bug, an oracle that distinguishes that bug from invalid execution, and evidence that the smaller input still reproduces it. We welcome failures in the reducer's own guarantees.

## Local setup

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[test]'
python -m pytest
python -m pytest examples/test_cart_regression.py
ruff check src tests examples scripts
mypy src/casecrop
python scripts/bundle_engine.py
npm ci
npm run typecheck
npm run lint
npm run test:engine
npm run build
npm run test:e2e
CASECROP_TEST_PRODUCTION=1 npm run test:e2e -- --grep 'executes Python|keyboard operation'
```

Use Python 3.10+ and Node 22.13+. Browser tests need Playwright Chromium (`npx playwright install chromium`). Generated engine sources and example reports are tracked; regenerate them after Python changes. CI checks that they match source. The Pyodide runtime is copied unchanged from the pinned npm package before build and is not committed.

## Engineering rules

- Never accept a different failure signature as reproduction.
- Never send dependency-invalid or pin-violating candidates to an oracle.
- Budget accounting includes every physical invocation.
- Incomplete or unresolved audits cannot claim minimality.
- Keep unknown results separate from passes.
- Unexpected oracle exceptions must not be swallowed as target bugs.
- Preserve artifact compatibility or explicitly version the schema.
- Add an independent invariant or counterexample test rather than mirroring the implementation.
- Document limitations and cite relevant prior work.

The component catalog under `components/ui` is generated third-party source and excluded from project lint, but included in typechecking and browser accessibility testing. Keep project-specific styles and behavior outside those files.

Open a focused issue or pull request. Include the failing input, expected behavior, command to reproduce, and validation performed. Avoid private traces, credentials, or claims of benchmark superiority without a reproducible comparison.
