'use client';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  Code2,
  Copy,
  Crop,
  FileJson,
  FlaskConical,
  GitBranch,
  LockKeyhole,
  RotateCcw,
  Scissors,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Engine, type RunInput } from '@/lib/engine';
import type { CaseId, Event, Report } from '@/lib/types';
import examples from '@/lib/examples.json';

const cases = {
  cache: {
    title: 'Cross-tenant cache leak',
    file: 'tenant_cache.py',
    description:
      'A cache key forgets the tenant. One customer gets another customer’s invoice.',
    tag: 'Data isolation',
    before: 'cache_key = resource_id',
    after: 'cache_key = (tenant_id, resource_id)',
    reason:
      'The cache is shared, but resource IDs are only unique within a tenant. Include both identities in the key.',
  },
  counter: {
    title: 'Lost update in a counter',
    file: 'shared_counter.py',
    description:
      'Two workers read zero. Both write one. An increment quietly disappears.',
    tag: 'Concurrency',
    before: 'counter = snapshot[worker] + 1',
    after: 'counter = counter + 1  # atomic in this model',
    reason:
      'A saved snapshot can be stale when a worker writes. Apply the increment atomically. This in-memory demo models a fixed interleaving; a real database needs an atomic update.',
  },
  permission: {
    title: 'Stale permission cache',
    file: 'permission_cache.py',
    description:
      'Access is revoked. A cached allow decision keeps opening the door.',
    tag: 'Authorization',
    before: 'grants[user] = allowed',
    after: 'grants[user] = allowed\ncache.pop(user, None)',
    reason:
      'Changing the source of truth is not enough when decisions are cached. Invalidate the cached grant when permission changes.',
  },
};
const install =
  'pip install "casecrop @ git+https://github.com/shi1720/casecrop.git@v0.1.0"';
const snippet = `from casecrop import minimize\n\n# Your replay function. Your bug.\nresult = minimize(\n    trace,\n    replay,\n    max_calls=500,\n)\n\nresult.reduced.save("regression.json")\nassert result.one_minimal`;
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob(
      [typeof value === 'string' ? value : JSON.stringify(value) + '\n'],
      {
        type: 'application/json',
      },
    ),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function eventPayload(e: Event): Record<string, unknown> {
  return e.payload && typeof e.payload === 'object' && !Array.isArray(e.payload)
    ? e.payload
    : {};
}
function eventLabel(e: Event) {
  const p = eventPayload(e);
  const detail = p.tenant ?? p.worker ?? p.user ?? p.metric;
  return `${typeof p.op === 'string' ? p.op : 'event'}${detail !== undefined ? ` · ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`;
}
function EventRows({
  events,
  kept,
  selected,
  onSelect,
  compact = false,
}: {
  events: Event[];
  kept?: Set<string>;
  selected: string | null;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={`event-list ${compact ? 'compact' : ''}`}>
      {events.map((e, i) => (
        <button
          key={e.id}
          className={`event-row ${kept?.has(e.id) ? 'survives' : ''} ${selected === e.id ? 'selected' : ''}`}
          onClick={() => onSelect(e.id)}
          aria-label={`Inspect ${e.id}`}
          aria-pressed={selected === e.id}
        >
          <span className="event-number">{String(i + 1).padStart(2, '0')}</span>
          <span
            className={`event-glyph ${eventPayload(e).op === 'observe' ? 'muted-glyph' : ''}`}
          >
            {eventPayload(e).op === 'observe' ? '·' : '↳'}
          </span>
          <span className="event-name">{eventLabel(e)}</span>
          {e.pinned ? (
            <LockKeyhole size={13} />
          ) : kept?.has(e.id) ? (
            <span className="kept-dot" />
          ) : (
            <span className="event-id">{e.id}</span>
          )}
        </button>
      ))}
      {!events.length && (
        <p className="empty-message">
          The empty trace still reproduces this failure.
        </p>
      )}
    </div>
  );
}
const subscribeHydration = () => () => {};
export default function Lab() {
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const [caseId, setCaseId] = useState<CaseId>('cache');
  const [report, setReport] = useState<Report>(examples.cache as Report);
  const [noise, setNoise] = useState(30),
    [budget, setBudget] = useState('500'),
    [repeats, setRepeats] = useState('1');
  const [busy, setBusy] = useState(false),
    [hasRun, setHasRun] = useState(false),
    [error, setError] = useState(''),
    [toast, setToast] = useState('');
  const [selected, setSelected] = useState<string | null>(null),
    [trialIndex, setTrialIndex] = useState(0);
  const [custom, setCustom] = useState(false),
    [json, setJson] = useState(''),
    [tab, setTab] = useState('trace');
  const engine = useRef<Engine | null>(null),
    active = useRef(false),
    mounted = useRef(true),
    reportRef = useRef(report);
  useEffect(() => {
    reportRef.current = report;
  }, [report]);
  const c = cases[caseId],
    kept = new Set(report.reduced.events.map((e) => e.id));
  const removed = report.original.events.length - report.reduced.events.length;
  const percent = report.original.events.length
    ? Math.round((removed / report.original.events.length) * 100)
    : 0;
  const selectedEvent = report.original.events.find((e) => e.id === selected);
  const trial = report.trials[Math.min(trialIndex, report.trials.length - 1)];
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      engine.current?.cancel();
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  const run = useCallback(async (input: RunInput) => {
    if (active.current) throw new Error('A reduction is already running.');
    active.current = true;
    setBusy(true);
    setError('');
    engine.current ??= new Engine();
    try {
      const r = await engine.current.run(input);
      if (mounted.current) {
        setReport(r);
        setHasRun(true);
        setSelected(null);
        setTrialIndex(0);
        setTab('trace');
      }
      return r;
    } catch (cause) {
      if (mounted.current)
        setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    type Context = {
      registerTool: (
        tool: {
          name: string;
          description: string;
          inputSchema: object;
          annotations: object;
          execute: (input: unknown) => unknown;
        },
        options: { signal: AbortSignal },
      ) => unknown;
    };
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: 'get_casecrop_result',
        description: 'Read the current reduction summary.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: () => {
          const r = reportRef.current;
          return {
            status: r.status,
            before: r.original.events.length,
            after: r.reduced.events.length,
            signature: r.signature,
            one_minimal: r.one_minimal,
            confirmed: r.confirmed,
          };
        },
      },
      {
        name: 'run_casecrop_example',
        description:
          'Execute a bundled bug reduction in local Python and update the visible lab.',
        inputSchema: {
          type: 'object',
          properties: {
            case: { type: 'string', enum: Object.keys(cases) },
            noise: { type: 'integer', minimum: 0, maximum: 100 },
          },
          required: ['case'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input: unknown) => {
          if (!input || typeof input !== 'object')
            throw new Error('Expected an object');
          const i = input as Record<string, unknown>;
          if (
            Object.keys(i).some((k) => !['case', 'noise'].includes(k)) ||
            typeof i.case !== 'string' ||
            !Object.hasOwn(cases, i.case) ||
            (i.noise !== undefined &&
              (typeof i.noise !== 'number' ||
                !Number.isInteger(i.noise) ||
                i.noise < 0 ||
                i.noise > 100))
          )
            throw new Error('Invalid case or noise');
          if (active.current)
            throw new Error('A reduction is already running.');
          const id = i.case as CaseId,
            n = typeof i.noise === 'number' ? i.noise : 30;
          const r = await run({
            case: id,
            noise: n,
            max_calls: 500,
            repeats: 1,
          });
          setCaseId(id);
          setNoise(n);
          setBudget('500');
          setRepeats('1');
          setCustom(false);
          return {
            status: r.status,
            before: r.original.events.length,
            after: r.reduced.events.length,
            one_minimal: r.one_minimal,
          };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Optional capability. */
      }
    }
    return () => lifecycle.abort();
  }, [run]);
  async function start() {
    try {
      if (custom) {
        if (new TextEncoder().encode(json).length > 256_000)
          throw new Error(
            'Browser input is limited to 256 KB. Use Python for larger traces.',
          );
      }
      await run({
        case: caseId,
        noise,
        max_calls: Number(budget),
        repeats: Number(repeats),
        ...(custom ? { trace_json: json } : {}),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  function chooseCase(value: string | null) {
    if (!value || !Object.hasOwn(cases, value)) return;
    const id = value as CaseId;
    setCaseId(id);
    setReport(examples[id] as Report);
    setHasRun(false);
    setSelected(null);
    setTrialIndex(0);
    setError('');
    setCustom(false);
    setNoise(30);
    setTab('trace');
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast('Copied to clipboard');
    } catch {
      setError('Clipboard unavailable. Select and copy the text directly.');
    }
  }
  return (
    <div className="site-shell" data-hydrated={hydrated}>
      <Link className="skip-link" href="#lab">
        Skip to the lab
      </Link>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="CaseCrop home">
          <span className="brand-mark">
            <Crop size={23} strokeWidth={2.3} />
          </span>
          casecrop<span className="version">v0.1</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link className="nav-active" href="/">
            The lab
          </Link>
          <Link href="/docs">
            Documentation <ArrowUpRight size={14} />
          </Link>
          <Link
            href="https://github.com/shi1720/casecrop"
            aria-label="CaseCrop on GitHub"
            target="_blank"
            rel="noreferrer"
          >
            <GitBranch size={17} />
            <span>GitHub</span>
          </Link>
        </nav>
      </header>
      <main id="lab">
        <section className="intro">
          <div>
            <p className="eyebrow">
              <span className="orange-square" />
              THE FAILURE MINIMIZATION LAB
            </p>
            <h1>
              Less trace. <span>Same bug.</span>
            </h1>
            <p className="intro-copy">
              Turn a wall of events into a bug you can actually fix.
            </p>
          </div>
          <div className="intro-note">
            <GitBranch size={18} />
            <span>
              Dependency-aware reduction.
              <br />
              Real Python. Right in your browser.
            </span>
          </div>
        </section>
        <div className="workbench">
          <aside className="config-panel">
            <div className="section-heading">
              <FlaskConical size={17} />
              <h2>Set up an experiment</h2>
            </div>
            <span className="field-label" id="case-label">
              01 / PICK YOUR BUG
            </span>
            <Select
              value={caseId}
              onValueChange={chooseCase}
              disabled={busy || !hydrated}
              items={Object.entries(cases).map(([value, item]) => ({
                value,
                label: item.title,
              }))}
            >
              <SelectTrigger
                aria-labelledby="case-label"
                className="case-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(cases).map(([id, item]) => (
                  <SelectItem key={id} value={id}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="case-description">{c.description}</p>
            <span className="case-tag">{c.tag}</span>
            <Button
              className="run-button"
              onClick={start}
              disabled={busy || !hydrated}
            >
              <Scissors size={18} />
              {busy ? 'Running Python…' : 'Crop this case'}
              <ArrowRight size={17} />
            </Button>
            {busy && (
              <Button
                className="cancel-button"
                variant="ghost"
                onClick={() => engine.current?.cancel()}
              >
                <X size={14} />
                Cancel run
              </Button>
            )}

            <div className="config-divider" />
            <div className="field-row">
              <span className="field-label" id="noise-label">
                02 / ADD THE NOISE
              </span>
              <span className="mono">{noise}</span>
            </div>
            <Slider
              aria-labelledby="noise-label"
              value={[noise]}
              min={0}
              max={100}
              step={5}
              disabled={busy || custom || !hydrated}
              onValueChange={(v) => setNoise(Array.isArray(v) ? v[0] : v)}
              className="noise-slider"
            />
            <p className="field-hint">
              Unrelated observations mixed into the trace.
            </p>
            <div className="config-divider" />
            <span className="field-label" id="budget-label">
              03 / CALL BUDGET
            </span>
            <Select
              value={budget}
              onValueChange={(v) => v && setBudget(v)}
              disabled={busy || !hydrated}
              items={[
                { value: '20', label: '20 · a tight budget' },
                { value: '100', label: '100 calls' },
                { value: '500', label: '500 calls' },
                { value: '2000', label: '2,000 calls' },
              ]}
            >
              <SelectTrigger
                aria-labelledby="budget-label"
                className="budget-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20 · a tight budget</SelectItem>
                <SelectItem value="100">100 calls</SelectItem>
                <SelectItem value="500">500 calls</SelectItem>
                <SelectItem value="2000">2,000 calls</SelectItem>
              </SelectContent>
            </Select>
            <span className="field-label repeat-label" id="repeat-label">
              REPLAYS PER CANDIDATE
            </span>
            <Select
              value={repeats}
              onValueChange={(v) => v && setRepeats(v)}
              disabled={busy || !hydrated}
              items={[
                { value: '1', label: '1 replay' },
                { value: '3', label: '3 replays · consistency check' },
              ]}
            >
              <SelectTrigger
                aria-labelledby="repeat-label"
                className="budget-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 replay</SelectItem>
                <SelectItem value="3">3 replays · consistency check</SelectItem>
              </SelectContent>
            </Select>
            <p className="privacy-note">
              <LockKeyhole size={12} />
              Your trace stays in this browser.
            </p>
            <button
              className="text-action custom-toggle"
              disabled={busy || !hydrated}
              onClick={() => {
                setCustom(!custom);
                setJson(report.original_json);
              }}
            >
              {custom ? <RotateCcw size={14} /> : <FileJson size={14} />}
              {custom ? 'Use generated trace' : 'Edit the trace JSON'}
              <ChevronRight size={14} />
            </button>
            <div className="config-bottom">
              <span className="tiny-label">THE RULE</span>
              <p>
                Smaller only counts if
                <br />
                <strong>the same bug survives.</strong>
              </p>
            </div>
          </aside>
          <section className="results-panel" aria-label="Reduction results">
            <div className="result-topbar">
              <span className="file-name">
                <span className="python-dot" />
                {c.file}
              </span>
              <span className="run-state" aria-live="polite">
                {busy
                  ? 'Executing locally…'
                  : hasRun
                    ? 'Executed in your browser'
                    : 'Previously executed example'}
              </span>
            </div>
            {error && (
              <div className="error-banner" role="alert">
                <span>{error}</span>
                <button aria-label="Dismiss error" onClick={() => setError('')}>
                  <X size={16} />
                </button>
              </div>
            )}
            {custom && (
              <div className="json-editor">
                <label htmlFor="trace-json">
                  Edit events for the selected replay system
                </label>
                <p>
                  Use schema version 1 and this example’s operations. Up to 200
                  events. JSON cannot contain executable code.
                </p>
                <textarea
                  id="trace-json"
                  spellCheck={false}
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  disabled={busy || !hydrated}
                />
                <Link href="/docs#traces">
                  Trace format <ArrowUpRight size={13} />
                </Link>
              </div>
            )}
            <div className="score-row">
              <div className="score">
                <span>{report.original.events.length}</span>
                <ArrowRight className="score-arrow" />
                <strong>{report.reduced.events.length}</strong>
                <span className="score-unit">events</span>
              </div>
              <div className="reduction-metric">
                <span className="reduction-value">−{percent}%</span>
                <span>events removed.</span>
              </div>
            </div>
            <div className="summary-strip">
              <span
                className={report.confirmed ? 'signal-good' : 'signal-warn'}
              >
                <CheckCheck size={15} />
                {report.confirmed
                  ? 'Same failure confirmed'
                  : 'Final replay incomplete'}
              </span>
              <span>
                <Terminal size={14} />
                {report.oracle_calls} calls
              </span>
              <span>
                <GitBranch size={14} />
                {report.cache_hits} cache hits
              </span>
            </div>
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(String(v))}
              className="result-tabs"
            >
              <TabsList variant="line" className="result-tabs-list">
                <TabsTrigger value="trace">The trace</TabsTrigger>
                <TabsTrigger value="experiments">
                  Experiments{' '}
                  <span className="tab-count">{report.trials.length}</span>
                </TabsTrigger>
                <TabsTrigger value="fix">The golden fix</TabsTrigger>
              </TabsList>
              <TabsContent value="trace">
                <div className="trace-comparison">
                  <div className="trace-column original">
                    <div className="column-label">
                      <span>
                        BEFORE{' '}
                        <span className="muted-number">
                          / {report.original.events.length}
                        </span>
                      </span>
                      <span className="legend-key">
                        <i />
                        retained
                      </span>
                    </div>
                    <EventRows
                      events={report.original.events}
                      kept={kept}
                      selected={selected}
                      onSelect={setSelected}
                      compact
                    />
                  </div>
                  <div className="trace-column reduced">
                    <div className="column-label">
                      <span>
                        AFTER{' '}
                        <span className="muted-number">
                          / {report.reduced.events.length}
                        </span>
                      </span>
                      <span className="target-pill">
                        {report.one_minimal
                          ? '1-MINIMAL'
                          : report.status.toUpperCase().replaceAll('_', ' ')}
                      </span>
                    </div>
                    <EventRows
                      events={report.reduced.events}
                      selected={selected}
                      onSelect={setSelected}
                    />
                    <div className="bug-survives">
                      <span className="bug-icon">
                        <Check size={17} />
                      </span>
                      <div>
                        <strong>
                          {report.confirmed
                            ? 'Still beautifully broken.'
                            : 'A smaller candidate.'}
                        </strong>
                        <p>{report.signature}</p>
                      </div>
                    </div>
                    <p className="minimal-note">
                      {report.one_minimal
                        ? 'Every permitted single-event deletion was tested. None kept this failure.'
                        : 'Minimality is not verified. Increase the budget or inspect unresolved trials.'}
                    </p>
                  </div>
                </div>
                {selectedEvent && (
                  <div className="event-inspector">
                    <div className="field-row">
                      <strong>{selectedEvent.id}</strong>
                      <button
                        onClick={() => setSelected(null)}
                        aria-label="Close event inspector"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <p>
                      Requires: {selectedEvent.requires.join(', ') || 'nothing'}{' '}
                      · {kept.has(selectedEvent.id) ? 'retained' : 'removed'}
                      {selectedEvent.pinned ? ' · pinned' : ''}
                    </p>
                    <pre>{JSON.stringify(selectedEvent.payload, null, 2)}</pre>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="experiments">
                <div className="experiments">
                  <div className="field-row">
                    <h3>Every trial, accounted for.</h3>
                    <span className="mono">
                      {trialIndex + 1} / {report.trials.length}
                    </span>
                  </div>
                  <p>Select a bar to inspect the candidate and its verdict.</p>
                  <div className="trial-chart" aria-label="Reduction trials">
                    {report.trials.map((t, i) => (
                      <button
                        key={t.number}
                        aria-label={`Trial ${t.number}: ${t.kept.length} events, ${t.outcome.verdict}`}
                        aria-pressed={trialIndex === i}
                        className={`${t.outcome.verdict} ${trialIndex === i ? 'active-trial' : ''}`}
                        style={{
                          height: `${Math.max(7, (t.kept.length / Math.max(1, report.original.events.length)) * 100)}%`,
                        }}
                        onClick={() => setTrialIndex(i)}
                      />
                    ))}
                  </div>
                  <div className="chart-legend">
                    <span>
                      <i className="fail-dot" />
                      Same failure
                    </span>
                    <span>
                      <i className="pass-dot" />
                      Pass
                    </span>
                    <span>
                      <i className="unknown-dot" />
                      Unresolved
                    </span>
                  </div>
                  <div className="trial-detail">
                    <div className="field-row">
                      <strong>
                        Trial {trial.number} / {trial.phase}
                      </strong>
                      <span className={`verdict ${trial.outcome.verdict}`}>
                        {trial.outcome.verdict}
                        {trial.cached ? ' · cached' : ''}
                      </span>
                    </div>
                    <p>
                      {trial.kept.length} events · {trial.samples.length} replay
                      {trial.samples.length !== 1 ? 's' : ''}
                    </p>
                    {trial.outcome.reason && <p>{trial.outcome.reason}</p>}
                    <div className="candidate-chips">
                      {trial.kept.map((id) => (
                        <span key={id}>{id}</span>
                      ))}
                      {!trial.kept.length && <span>empty trace</span>}
                    </div>
                  </div>
                  <details className="audit-details">
                    <summary>
                      Final deletion audit · {report.witnesses.length} witnesses
                    </summary>
                    {report.witnesses.map((w) => (
                      <div key={w.event} className="audit-row">
                        <code>{w.event}</code>
                        <span>{w.verdict}</span>
                      </div>
                    ))}
                  </details>
                </div>
              </TabsContent>
              <TabsContent value="fix">
                <div className="golden-fix">
                  <span className="eyebrow">
                    <ShieldCheck size={14} />
                    {report.fixed_outcome.verdict === 'pass'
                      ? 'VERIFIED REFERENCE SOLUTION'
                      : 'REFERENCE CONTROL INCOMPLETE'}
                  </span>
                  <h3>
                    {report.fixed_outcome.verdict === 'pass'
                      ? `${c.tag}. Restored.`
                      : 'The corrected control needs attention.'}
                  </h3>
                  <p>{c.reason}</p>
                  <div className="code-diff">
                    <pre className="deleted">− {c.before}</pre>
                    <pre className="added">+ {c.after}</pre>
                  </div>
                  <div className="control-row">
                    <span>Buggy implementation</span>
                    <span className="verdict fail">{report.signature}</span>
                  </div>
                  <div className="control-row">
                    <span>Corrected implementation</span>
                    <span className={`verdict ${report.fixed_outcome.verdict}`}>
                      {report.fixed_outcome.verdict.toUpperCase()}
                    </span>
                  </div>
                  {report.fixed_outcome.reason && (
                    <p className="signal-warn">{report.fixed_outcome.reason}</p>
                  )}
                  <p className="field-hint">
                    Both controls replay the same reduced trace. These are
                    executable systems, not LLM judgements.
                  </p>
                  <Link
                    className="text-action"
                    href="https://github.com/shi1720/casecrop/blob/main/src/casecrop/examples.py"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read both implementations <ArrowUpRight size={14} />
                  </Link>
                </div>
              </TabsContent>
            </Tabs>
            <div className="result-footer">
              <span>
                <ShieldCheck size={15} />
                {report.one_minimal
                  ? 'Closure deletion audit passed'
                  : `Status: ${report.status.replaceAll('_', ' ')}`}
              </span>
              <div className="export-actions">
                <Button
                  variant="ghost"
                  onClick={() => download('reduced.json', report.reduced_json)}
                >
                  <FileJson size={14} />
                  Trace
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    download('casecrop-report.json', report.rawReport ?? report)
                  }
                >
                  <ArrowDownToLine size={14} />
                  Evidence
                </Button>
              </div>
            </div>
          </section>
        </div>
        <section
          className="developer-section"
          aria-label="Use CaseCrop in Python"
        >
          <div className="developer-copy">
            <span className="eyebrow">SMALL LIBRARY. SHORTER INCIDENTS.</span>
            <h2>
              Your replay function.
              <br />
              <span>Our delete key.</span>
            </h2>
            <p>
              Bring a recorded execution and a function that reproduces the bug.
              CaseCrop handles the experiments, prerequisites, and evidence.
            </p>
            <div className="library-facts">
              <span>
                <Check size={14} />
                Zero runtime dependencies
              </span>
              <span>
                <Check size={14} />
                Python 3.10+
              </span>
              <span>
                <Check size={14} />
                MIT licensed
              </span>
            </div>
            <Link href="/docs" className="docs-link">
              Read the quickstart <ArrowRight size={16} />
            </Link>
          </div>
          <div className="code-card">
            <div className="code-header">
              <span>
                <Code2 size={15} />
                reduce_incident.py
              </span>
              <button
                aria-label="Copy Python example"
                onClick={() => copy(snippet)}
              >
                <Copy size={15} />
              </button>
            </div>
            <pre>
              <code>{snippet}</code>
            </pre>
            <div className="install-row">
              <Terminal size={15} />
              <code>Install from the tagged GitHub release</code>
              <button
                aria-label="Copy install command"
                onClick={() => copy(install)}
              >
                <Copy size={15} />
              </button>
            </div>
          </div>
        </section>
        <section className="how-section" aria-label="How reduction works">
          <div>
            <span className="step-number">01</span>
            <h3>Keep the setup.</h3>
            <p>
              Deleting a prerequisite also deletes its dependents. Pinned setup
              stays protected.
            </p>
          </div>
          <div>
            <span className="step-number">02</span>
            <h3>Keep the failure.</h3>
            <p>
              Only the same failure signature earns a smaller trace. Different
              crashes are unresolved.
            </p>
          </div>
          <div>
            <span className="step-number">03</span>
            <h3>Keep the evidence.</h3>
            <p>
              Export the reduced input and every trial. Verify it against your
              corrected implementation.
            </p>
          </div>
        </section>
        <div className="honest-note">
          <GitBranch size={17} />
          <p>
            <strong>A smaller reproducer, not a claim of root cause.</strong>{' '}
            “1-minimal” means no permitted single deletion keeps the failure. It
            does not mean globally shortest. Results depend on a deterministic
            replay function.
          </p>
          <Link href="/docs#guarantees">
            The guarantees <ArrowUpRight size={14} />
          </Link>
        </div>
      </main>
      <footer className="site-footer">
        <Link className="brand footer-brand" href="/">
          <Crop size={19} />
          casecrop
        </Link>
        <span>Made for the bug that got away.</span>
        <div>
          <Link href="https://github.com/shi1720">By Shivam Gupta</Link>
          <Link href="https://github.com/shi1720/casecrop/blob/main/LICENSE">
            MIT
          </Link>
          <span className="beta">BETA</span>
        </div>
      </footer>
      {toast && (
        <output className="toast">
          <Check size={16} />
          {toast}
        </output>
      )}
    </div>
  );
}
