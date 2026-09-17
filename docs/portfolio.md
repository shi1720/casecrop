# Project pitch and engineering walkthrough

**Pitch:** CaseCrop turns a noisy failed execution into a small regression case that still reproduces the same bug, without deleting required setup or confusing an unrelated crash with success.

**Audience:** engineers debugging agent tools, API workflows, stateful tests, and coding-agent evaluation environments. The value is less manual reproduction work and a smaller artifact a human or coding agent can inspect and fix.

## A two-minute demo

1. Open the [workbench](https://casecrop.web.app). The initial result is explicitly labeled as a previously executed example.
2. Pick **Cross-tenant cache leak**, then **Run reduction**. Actual Python runs locally, shrinking 36 events to 6.
3. Inspect `store-a` and its prerequisite. The reducer preserved setup instead of turning a missing tenant into a false success.
4. Open **Replay log**. Every candidate, verdict, cached result, and final deletion witness is inspectable.
5. Open **Reference fix**. The buggy shared cache fails; the key including both tenant and resource passes with the same reduced input.
6. Download the trace and report. Run `casecrop demo --output incident --require-minimal`, then `python -m pytest incident/test_regression.py`.
7. Set a tight budget and rerun. Incomplete verification is visibly reported; the tool does not manufacture a success badge.

## Relevance to the supplied software engineering role

The role describes reproducible environments, complex software defects, golden reference solutions, feature work, refactoring, and performance optimization. This repository gives concrete material for each:

- **Reproducible environments:** isolated in-memory systems, stable JSON inputs, exact failure identities, CI, and native/WebAssembly parity tests.
- **Debugging:** cache isolation, stale authorization, lost updates, and a separate negative-cart-total integration.
- **Golden solutions:** each bundled bug has a corrected implementation tested on the same reduced trace.
- **Algorithms:** dependency DAG validation, forward transitive deletion, complement search, nonmonotonic predicates, and closure minimality auditing.
- **Performance:** independent review identified cubic bookkeeping; a set-based audit removed it, with a runnable benchmark.
- **Reliability:** strict artifact parsing, detached payloads, physical-call accounting, repeated observations, uncached confirmation, subprocess cleanup, and error states.
- **Communication:** source-level contracts, architecture, explicit limits, prior-art citations, and a functioning visual inspector.

The project demonstrates Python and TypeScript depth. It does not claim implementations in every language listed in the role. The command oracle protocol can integrate programs in other languages without pretending those adapters already exist.

## Suggested application description

> Built CaseCrop, an open-source Python library that reduces recorded failing executions into dependency-valid regression cases. It combines explicit failure signatures, bounded delta debugging, replay evidence, and corrected reference controls. The repository includes a TypeScript lab running the same Python engine in WebAssembly, property tests, command-oracle integration, and a documented performance improvement from independent review.

Use this description only after personally running the examples and understanding the implementation. The project was developed with AI assistance, including independent adversarial reviews. Its value is supported by executable behavior, not claimed adoption or invented production usage.

## Relationship to the existing portfolio

The profile contains many applied-AI educational content tools and recent agent engineering projects. ToolStorm covers deterministic fault injection/replay; RepoGym and Repo Gauntlet cover coding-task environments. CaseCrop owns the next step after a failure is found: reducing the evidence into a usable regression. It complements those projects rather than duplicating their main functionality.

A third-party profile score is not an engineering quality measure. This project targets reviewer-verifiable evidence instead of optimizing a score, stars, or artificial contribution volume.
