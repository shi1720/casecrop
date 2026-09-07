import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Crop,
  GitBranch,
} from 'lucide-react';
import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Documentation — CaseCrop',
  description:
    'Install CaseCrop, write a replay oracle, understand dependency closure and minimality, and export regression cases.',
};
const quickstart = `from casecrop import Event, Outcome, Trace, minimize

trace = Trace([
    Event("setup", {"op": "create"}),
    Event("noise", {"op": "log"}),
    Event("trigger", {"op": "read"}, requires=("setup",)),
])

def replay(events):
    # Replace this teaching oracle with fresh application replay.
    ids = {event.id for event in events}
    return Outcome.fail("my-bug.v1") if "trigger" in ids else Outcome.pass_()

result = minimize(trace, replay, max_calls=200)
assert result.reduced.ids == ("setup", "trigger")
assert result.one_minimal
result.reduced.save("regression.json")
result.save("evidence.json")`;
function Code({ children }: { children: string }) {
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Overflowed code needs keyboard scrolling.
    <pre className="docs-code" tabIndex={0} aria-label="Code example">
      <code>{children}</code>
    </pre>
  );
}
export default function Docs() {
  return (
    <div className="site-shell docs-shell">
      <header className="site-header">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Crop size={23} />
          </span>
          casecrop<span className="version">v0.1</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/">
            <ArrowLeft size={14} />
            Back to the lab
          </Link>
          <a
            href="https://github.com/shi1720/casecrop"
            target="_blank"
            rel="noreferrer"
          >
            GitHub <ArrowUpRight size={14} />
          </a>
        </nav>
      </header>
      <div className="docs-layout">
        <aside className="docs-nav">
          <span className="eyebrow">DOCUMENTATION</span>
          <nav aria-label="Documentation sections">
            {[
              ['quickstart', 'Quickstart'],
              ['real-example', 'Your own application'],
              ['traces', 'Trace format'],
              ['oracle', 'The replay oracle'],
              ['guarantees', 'What the result means'],
              ['cli', 'Command-line workflow'],
              ['architecture', 'Architecture'],
              ['limits', 'Limits & prior work'],
            ].map(([id, label]) => (
              <Link key={id} href={`#${id}`}>
                {label}
              </Link>
            ))}
          </nav>
          <Link
            className="text-action"
            href="https://github.com/shi1720/casecrop/tree/main/docs"
          >
            Full API reference <ArrowUpRight size={14} />
          </Link>
        </aside>
        <article className="docs-body">
          <p className="eyebrow">A SMALLER PATH TO REPRODUCIBLE BUGS</p>
          <h1>
            Make the failure
            <br />
            <span>fit in your head.</span>
          </h1>
          <p className="docs-lead">
            CaseCrop starts with an execution that already fails. It deletes
            events, replays what remains, and keeps a smaller case only when the
            same bug survives.
          </p>
          <section id="quickstart">
            <h2>01 / Up and running</h2>
            <p>
              Python 3.10 or newer. No runtime dependencies, model, account, or
              API key. The beta release is installed from tagged source; it is
              not published on PyPI.
            </p>
            <Code>{`pip install "casecrop @ git+https://github.com/shi1720/casecrop.git@v0.1.0"
casecrop demo --case cache --require-minimal`}</Code>
            <p>
              The smallest API example below uses a teaching oracle. The bundled
              lab and cart integration replay actual state transitions against
              buggy and corrected implementations.
            </p>
            <Code>{quickstart}</Code>
          </section>
          <section id="real-example">
            <h2>02 / Connect your application</h2>
            <p>
              Your application owns replay. Start from a clean in-memory object,
              test database, container, or disposable fixture on every call. Map
              application operations to events and declare the setup each
              operation needs.
            </p>
            <Code>{`git clone https://github.com/shi1720/casecrop.git
cd casecrop
python -m pip install -e '.[test]'
python examples/cart_workflow.py
python -m pytest examples/test_cart_regression.py

casecrop reduce examples/cart_trace.json \\
  --output cart-incident --require-minimal \\
  --oracle python examples/cart_oracle.py '{trace}'`}</Code>
            <p>
              The cart example converts an application log into events. Two
              coupons produce a negative total. CaseCrop removes unrelated
              views, preserves the item prerequisite, and leaves a three-event
              regression. The corrected cart caps its total at zero.
            </p>
            <a
              className="docs-link"
              href="https://github.com/shi1720/casecrop/tree/main/examples"
            >
              Read the complete integration <ArrowRight size={15} />
            </a>
          </section>
          <section id="traces">
            <h2>03 / Describe a trace</h2>
            <p>
              A trace is an ordered list of uniquely named events. Payloads are
              finite JSON values. Access returns a detached copy so accidental
              mutation inside an oracle cannot change the next experiment.
            </p>
            <Code>{`{
  "schema_version": 1,
  "events": [
    {"id": "create", "payload": {"op": "create"}},
    {"id": "read", "payload": {"op": "read"},
     "requires": ["create"], "pinned": false, "cost": 1}
  ]
}`}</Code>
            <div className="docs-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>id</code>
                    </td>
                    <td>Unique nonempty event ID, up to 200 characters.</td>
                  </tr>
                  <tr>
                    <td>
                      <code>payload</code>
                    </td>
                    <td>
                      Application-owned JSON. It is data, never dynamically
                      imported code.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>requires</code>
                    </td>
                    <td>
                      IDs of earlier prerequisites. Missing or forward
                      dependencies are rejected.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>pinned</code>
                    </td>
                    <td>
                      Protect the event and, transitively, its prerequisites.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>cost</code>
                    </td>
                    <td>
                      Positive integer metadata. The reducer optimizes
                      deletions, not weighted cost.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              When a prerequisite is deleted, its dependents are deleted too.
              Every candidate keeps the original order. Dependencies are
              declared by you; CaseCrop does not infer them from arbitrary I/O.
            </p>
          </section>
          <section id="oracle">
            <h2>04 / Return evidence, not guesses</h2>
            <Code>{`Outcome.fail("cache.cross_tenant")  # The target behavior occurred.
Outcome.pass_()                     # Valid execution; target is absent.
Outcome.unresolved("fixture down")  # Cannot reach a trustworthy verdict.`}</Code>
            <p>
              The original trace must consistently fail. CaseCrop learns its
              signature, or you can require one with <code>signature=</code>. An
              unrelated failure signature is unresolved. Unexpected Python
              exceptions propagate; an accidental crash never becomes success.
            </p>
            <p>
              <code>repeats=3</code> requires all three observations to agree.
              Mixed verdicts or failure signatures are unresolved. Stable
              results are cached within the run; unresolved results are retried.
              The last retained case gets a fresh replay that bypasses the
              cache. These checks can detect some flakiness, but cannot prove
              determinism.
            </p>
          </section>
          <section id="guarantees">
            <h2>05 / Read the result honestly</h2>
            <div className="docs-callout">
              <GitBranch size={21} />
              <p>
                With a deterministic oracle and a complete audit, no permitted
                single-event deletion, together with its dependent events,
                retains the target failure.
              </p>
            </div>
            <p>
              This is <strong>closure 1-minimality</strong>. It is relative to
              your pins, prerequisites, and oracle. It is not a globally
              shortest trace, proof of causality, or verification of the oracle
              itself. Nonmonotonic bugs may have smaller cases that this local
              search cannot reach.
            </p>
            <div className="docs-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>What happened</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>complete</code>
                    </td>
                    <td>
                      The final replay and every permitted deletion check
                      passed.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>budget_exhausted</code>
                    </td>
                    <td>
                      A smaller known failing candidate may exist; verification
                      is incomplete.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>unresolved</code>
                    </td>
                    <td>
                      Final reproduction succeeded, but some deletion trials
                      could not be classified.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>unstable</code>
                    </td>
                    <td>
                      The fresh final replay did not reproduce the target.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              <code>max_calls</code> counts physical oracle invocations,
              including baseline, repeats, audit, and confirmation. Cache hits
              use no calls. <code>one_minimal</code> stays false if the budget
              runs out. Check it before using an artifact as a fully audited
              result.
            </p>
          </section>
          <section id="cli">
            <h2>06 / Any language. One JSON protocol.</h2>
            <p>
              The command adapter runs an explicit argument vector. Put a{' '}
              <code>{'{trace}'}</code> placeholder wherever your program expects
              the candidate file. Your process writes a single outcome object to
              stdout and exits zero.
            </p>
            <Code>{`{"verdict":"fail","signature":"cart.negative_total"}
{"verdict":"pass"}
{"verdict":"unresolved","reason":"fixture unavailable"}`}</Code>
            <p>
              Place all CaseCrop options before <code>--oracle</code>;
              everything after it belongs to your program. A timeout, nonzero
              exit, invalid JSON, or excess output is unresolved. The CLI never
              interprets shell operators.
            </p>
            <Code>{`casecrop reduce incident.json \\
  --output reduced-incident \\
  --signature cart.negative_total \\
  --timeout 5 --max-calls 200 --require-minimal \\
  --oracle python my_replay.py '{trace}'`}</Code>
            <p>
              Output contains <code>reduced.json</code> and{' '}
              <code>report.json</code>. Demo output also includes an executable{' '}
              <code>test_regression.py</code>. Existing output artifacts are
              protected from overwrite. Exit 0 means the operation completed;
              with <code>--require-minimal</code>, incomplete verification exits
              1. Invalid input or setup errors exit 2.
            </p>
          </section>
          <section id="architecture">
            <h2>07 / A small, inspectable boundary</h2>
            <div className="architecture-flow">
              <span>
                Recorded events
                <br />
                <small>IDs + payloads + prerequisites</small>
              </span>
              <ArrowRight />
              <span>
                Reducer
                <br />
                <small>Delete → replay → compare</small>
              </span>
              <ArrowRight />
              <span>
                Regression case
                <br />
                <small>Trace + evidence + audit</small>
              </span>
            </div>
            <p>
              The Python package contains the model, reduction engine, command
              adapter, and CLI. Your replay function owns the system under test.
              The React lab executes those same source files in a Pyodide Web
              Worker and displays the resulting report. There is no model judge
              or second reducer in TypeScript.
            </p>
            <a
              className="docs-link"
              href="https://github.com/shi1720/casecrop/blob/main/docs/architecture.md"
            >
              Full architecture and decisions <ArrowUpRight size={14} />
            </a>
          </section>
          <section id="limits">
            <h2>08 / Scope and prior work</h2>
            <p>
              Use isolated replay fixtures. The Python callback is trusted code,
              and the command adapter is not a sandbox. It inherits your
              environment and permissions. A synchronous callback cannot be
              preempted by the call budget. POSIX commands have process-group
              timeout cleanup; Windows cleanup covers the direct process only.
            </p>
            <p>
              Traces can contain sensitive payloads. There is no automatic
              redaction: sanitize before capture or sharing. The lab keeps input
              in the browser and runs only its three bundled replay systems. Use
              Python or the CLI for your own oracle. Browser inputs are limited
              to 200 events and 256 KB; the library accepts up to 10,000 events
              and 8 MB of canonical JSON.
            </p>
            <p>
              CaseCrop builds on{' '}
              <a href="https://www.st.cs.uni-saarland.de/papers/tse2002/">
                delta debugging by Zeller and Hildebrandt
              </a>{' '}
              and{' '}
              <a href="https://web.cs.ucla.edu/~palsberg/paper/fse19.pdf">
                dependency graph reduction
              </a>
              . <a href="https://github.com/renatahodovan/picire">Picire</a> is
              a mature alternative with parallel reduction.{' '}
              <a href="https://hypothesis.readthedocs.io/">Hypothesis</a>{' '}
              generates and shrinks structured examples. CaseCrop focuses on
              existing event histories, explicit replay contracts, and auditable
              regression artifacts.
            </p>
          </section>
          <Link className="docs-link" href="/">
            Try another case in the lab <ArrowRight size={16} />
          </Link>
        </article>
      </div>
    </div>
  );
}
