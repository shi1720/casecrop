# Why CaseCrop exists

An agent run or stateful regression can contain hundreds of events, but the bug may need only a few. Engineers commonly paste the entire history into an issue, spend model tokens on irrelevant context, or manually delete steps until reproduction breaks. Deletion is dangerous when steps depend on earlier setup, and a newly introduced exception can be mistaken for the original bug.

CaseCrop makes one workflow explicit: **record → replay → reduce → audit → preserve a regression**.

The contribution is a small integration boundary around recorded execution histories: declared prerequisites, semantic failure identity, pinned setup, physical call budgets, strict outcomes, and an export containing the actual experiments. It is not a new reduction algorithm or a replacement for agent orchestration frameworks.

## Prior work

- Andreas Zeller and Ralf Hildebrandt, [Simplifying and Isolating Failure-Inducing Input](https://www.st.cs.uni-saarland.de/papers/tse2002/), IEEE TSE 2002. Established delta debugging and 1-minimal failure inputs.
- Christian Gram Kalhauge and Jens Palsberg, [Binary Reduction of Dependency Graphs](https://web.cs.ucla.edu/~palsberg/paper/fse19.pdf), ESEC/FSE 2019. Direct prior art for reducing dependency-constrained inputs. CaseCrop does not claim to implement their complete algorithm.
- [Picire](https://github.com/renatahodovan/picire): mature configurable and parallel delta debugging. Prefer it for established text/line reduction and parallel search workflows.
- [Picireny](https://github.com/renatahodovan/picireny): grammar-driven hierarchical reduction. Prefer it for syntax-aware structured document or compiler input reduction.
- [Hypothesis](https://hypothesis.readthedocs.io/): generation and shrinking integrated with property testing. Prefer it when you control input generation with strategies. CaseCrop begins with an existing trace and replay callback.

These are complementary tools. We have not benchmarked CaseCrop against them and make no performance superiority claim.

## Decisions

1. **Explicit dependencies instead of inference.** Application semantics determine whether a read depends on a create, a grant, or a prior response. Guessing could remove meaningful state or preserve irrelevant context. The caller owns the graph.
2. **Failure identity instead of boolean interestingness.** `False` can mean pass, invalid fixture, or failed replay infrastructure. Three explicit outcomes keep those cases distinct.
3. **No automatic capture or live-service replay.** This release reduces test fixtures. It does not intercept arbitrary network I/O or infer causality from telemetry.
4. **Plain JSON instead of executable artifacts.** A trace carries no imports or code. An explicit local command is needed to execute an oracle.
5. **Evidence before global-optimum claims.** We expose every trial and stopping reason. An incomplete audit stays incomplete even when the reduction looks impressive.
6. **One implementation for CLI and browser.** Python sources are bundled unchanged and executed with Pyodide. The UI is a working inspector for real reports.

## Roadmap criteria

Add a capability when a real integration demonstrates the need and provides a reproducer. Good candidates include bounded campaign persistence, hierarchical event groups, controlled parallel replay, and structured adapters for existing trace formats. None is implied to exist in v0.1.
