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
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Crop,
  FileJson,
  FlaskConical,
  GitBranch,
  LockKeyhole,
  RotateCcw,
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
      'Two workers write from stale snapshots, losing one increment.',
    tag: 'Concurrency',
    before: 'counter = snapshot[worker] + 1',
    after: 'counter = counter + 1  # atomic in this model',
    reason:
      'A saved snapshot can be stale when a worker writes. Apply the increment atomically. This in-memory demo models a fixed interleaving; a real database needs an atomic update.',
  },
  permission: {
    title: 'Stale permission cache',
    file: 'permission_cache.py',
    description: 'A cached permission remains valid after access is revoked.',
    tag: 'Authorization',
    before: 'grants[user] = allowed',
    after: 'grants[user] = allowed\ncache.pop(user, None)',
    reason:
      'Changing the source of truth is not enough when decisions are cached. Invalidate the cached grant when permission changes.',
  },
};
const install =
  'pip install "casecrop @ git+https://github.com/shi1720/casecrop.git@v0.1.1"';
const snippet = `from casecrop import minimize\n\n# replay must reset state before each execution.\nresult = minimize(\n    trace,\n    replay,\n    max_calls=500,\n)\n\nresult.reduced.save("regression.json")\nassert result.one_minimal`;
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
  const scalar = (v: unknown) =>
    typeof v === 'string' ? v : JSON.stringify(v);
  const parts = [
    p.op ?? 'event',
    p.tenant ?? p.worker ?? p.user ?? p.metric,
    p.key,
  ]
    .filter((v) => v !== undefined)
    .map(scalar);
  if (p.value !== undefined) parts.push(`value=${scalar(p.value)}`);
  return parts.join(' · ');
}
function resultStatus(report: Report) {
  if (report.status === 'unstable')
    return 'Final replay did not reproduce the failure';
  if (report.status === 'budget_exhausted')
    return 'Replay budget reached; verification incomplete';
  if (report.status === 'unresolved')
    return 'Failure reproduced; some deletion checks are unresolved';
  return 'Failure reproduced and deletion audit complete';
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
  onSelect: (id: string, source: HTMLButtonElement) => void;
  compact?: boolean;
}) {
  return (
    <div className={`event-list ${compact ? 'compact' : ''}`}>
      {events.map((e, i) => (
        <button
          key={e.id}
          className={`event-row ${kept?.has(e.id) ? 'survives' : ''} ${selected === e.id ? 'selected' : ''}`}
          onClick={(event) => onSelect(e.id, event.currentTarget)}
          aria-label={`Inspect ${e.id}`}
          aria-pressed={selected === e.id}
        >
          <span className="event-number">{String(i + 1).padStart(2, '0')}</span>
          <span className="event-content">
            <span className="event-id">{e.id}</span>
            <span className="event-name">{eventLabel(e)}</span>
          </span>
          {e.pinned ? (
            <LockKeyhole size={13} aria-label="Pinned" />
          ) : kept?.has(e.id) ? (
            <span className="kept-dot" title="Retained" />
          ) : null}
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
  const [reportInput, setReportInput] = useState<RunInput>({
    case: 'cache',
    noise: 30,
    max_calls: 500,
    repeats: 1,
  });
  const [selected, setSelected] = useState<string | null>(null),
    [trialIndex, setTrialIndex] = useState(0);
  const [custom, setCustom] = useState(false),
    [json, setJson] = useState(''),
    [tab, setTab] = useState('trace');
  const engine = useRef<Engine | null>(null),
    active = useRef(false),
    mounted = useRef(true),
    reportRef = useRef(report);
  const c = cases[caseId],
    kept = new Set(report.reduced.events.map((e) => e.id));
  const removed = report.original.events.length - report.reduced.events.length;
  const draftInput: RunInput = {
    case: caseId,
    noise,
    max_calls: Number(budget),
    repeats: Number(repeats),
    ...(custom ? { trace_json: json } : {}),
  };
  const settingsChanged =
    JSON.stringify(draftInput) !== JSON.stringify(reportInput);
  const provenanceRef = useRef({ reportInput, hasRun, settingsChanged });
  useEffect(() => {
    reportRef.current = report;
    provenanceRef.current = { reportInput, hasRun, settingsChanged };
  }, [report, reportInput, hasRun, settingsChanged]);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const inspectedButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selected && tab === 'trace') {
      inspectorRef.current?.focus({ preventScroll: true });
      inspectorRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [selected, tab]);
  function inspectEvent(id: string, source: HTMLButtonElement) {
    inspectedButton.current = source;
    if (selected === id) {
      inspectorRef.current?.focus({ preventScroll: true });
      inspectorRef.current?.scrollIntoView({ block: 'nearest' });
    } else {
      setSelected(id);
    }
  }
  function closeInspector() {
    setSelected(null);
    inspectedButton.current?.focus();
  }
  const finalReplay = [...report.trials]
    .reverse()
    .find((t) => t.phase === 'confirm');
  const resultCase = cases[reportInput.case];
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
        // Tool completion must make readback current before React commits.
        reportRef.current = r;
        provenanceRef.current = {
          reportInput: { ...input },
          hasRun: true,
          settingsChanged: false,
        };
        setReport(r);
        setReportInput({ ...input });
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
        description:
          'Read the displayed reduction, its provenance, and whether settings have changed.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: () => {
          const r = reportRef.current;
          const provenance = provenanceRef.current;
          return {
            source: provenance.hasRun ? 'browser_run' : 'saved_example',
            case: provenance.reportInput.case,
            max_calls: provenance.reportInput.max_calls,
            repeats: provenance.reportInput.repeats,
            custom_trace: provenance.reportInput.trace_json !== undefined,
            pending_settings: provenance.settingsChanged,
            running: active.current,
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
    setReportInput({ case: id, noise: 30, max_calls: 500, repeats: 1 });
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
        Skip to the workbench
      </Link>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="CaseCrop home">
          <span className="brand-mark">
            <Crop size={23} strokeWidth={2.3} />
          </span>
          casecrop
        </Link>
        <nav aria-label="Main navigation">
          <Link className="nav-active" href="/">
            Workbench
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
            <p className="eyebrow">CaseCrop / Interactive examples</p>
            <h1>Find a smaller failing trace.</h1>
            <p className="intro-copy">
              Replay fewer events while preserving the failure and the setup it
              needs.
            </p>
          </div>
          <Link href="/docs#real-example" className="docs-link">
            Use your own application <ArrowUpRight size={15} />
          </Link>
        </section>
        <div className="workbench">
          <aside className="config-panel" aria-label="Reduction setup">
            <span className="field-label" id="case-label">
              Replay system
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
            <p className="scope-note">
              Three bundled systems. To reduce traces from your application, use
              the <Link href="/docs#real-example">Python library</Link>.
            </p>
            <div className="config-divider" />
            <div className="field-row">
              <span className="field-label" id="noise-label">
                Unrelated events
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
            <div className="config-divider" />
            <details className="run-options">
              <summary>
                Run limits{' '}
                <span>
                  {budget} replays · {repeats} per candidate
                </span>
              </summary>
              <div className="run-options-fields">
                <span className="field-label" id="budget-label">
                  Replay budget
                </span>
                <Select
                  value={budget}
                  onValueChange={(v) => v && setBudget(v)}
                  disabled={busy || !hydrated}
                  items={[
                    { value: '20', label: '20 replays' },
                    { value: '100', label: '100 replays' },
                    { value: '500', label: '500 replays' },
                    { value: '2000', label: '2,000 replays' },
                  ]}
                >
                  <SelectTrigger
                    aria-labelledby="budget-label"
                    className="budget-select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20 replays</SelectItem>
                    <SelectItem value="100">100 replays</SelectItem>
                    <SelectItem value="500">500 replays</SelectItem>
                    <SelectItem value="2000">2,000 replays</SelectItem>
                  </SelectContent>
                </Select>
                <span className="field-label repeat-label" id="repeat-label">
                  Replays per candidate
                </span>
                <Select
                  value={repeats}
                  onValueChange={(v) => v && setRepeats(v)}
                  disabled={busy || !hydrated}
                  items={[
                    { value: '1', label: '1 replay' },
                    { value: '3', label: '3 replays' },
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
                    <SelectItem value="3">3 replays</SelectItem>
                  </SelectContent>
                </Select>
                <p className="field-hint">
                  The budget includes the initial replay, repeated trials,
                  deletion audit, and final confirmation.
                </p>
              </div>
            </details>
            <Button
              className="run-button"
              onClick={start}
              disabled={busy || !hydrated}
            >
              <ArrowRight size={16} />
              {busy ? 'Running reduction…' : 'Run reduction'}
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

            <p className="privacy-note">
              <LockKeyhole size={12} />
              Runs locally in this browser.
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
              {custom ? 'Use generated trace' : 'Edit example JSON'}
              <ChevronRight size={14} />
            </button>
          </aside>
          <section className="results-panel" aria-label="Reduction results">
            <div className="result-topbar">
              <span className="file-name">
                <span className="python-dot" />
                {resultCase.file}
              </span>
              <span className="run-state" aria-live="polite">
                {busy
                  ? 'Running · previous result below'
                  : hasRun
                    ? 'Completed in this browser'
                    : 'Saved example result'}
              </span>
            </div>
            <div className="report-provenance">
              <span>
                {reportInput.trace_json !== undefined
                  ? 'Edited trace'
                  : `${reportInput.noise} unrelated events`}{' '}
                · budget {report.config.max_calls} · {report.config.repeats}{' '}
                replay{report.config.repeats === 1 ? '' : 's'} per candidate
              </span>
              <span title={report.input_digest}>
                Input {report.input_digest.slice(0, 10)}
              </span>
            </div>
            {(settingsChanged || busy) && (
              <output className="pending-notice">
                {busy
                  ? 'A new reduction is running. The results and downloads below belong to the previous run.'
                  : 'Settings changed. Run reduction to update the results. Downloads still contain the displayed result.'}
              </output>
            )}
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
                <label htmlFor="trace-json">Example trace JSON</label>
                <p>
                  Use the selected system’s operations and schema version 1.
                  Maximum 200 events and 256 KB. This editor accepts event data;
                  custom replay code runs through Python or the CLI.
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
            <dl className="result-metrics" aria-label="Reduction measurements">
              <div>
                <dt>Original</dt>
                <dd data-testid="original-count">
                  {report.original.events.length}
                  <span>events</span>
                </dd>
              </div>
              <div>
                <dt>Reduced</dt>
                <dd>
                  {report.reduced.events.length}
                  <span>events</span>
                </dd>
              </div>
              <div>
                <dt>Removed</dt>
                <dd>
                  {removed}
                  <span>events</span>
                </dd>
              </div>
              <div>
                <dt>Replayed</dt>
                <dd>
                  {report.oracle_calls}
                  <span>calls</span>
                </dd>
              </div>
            </dl>
            <div
              className={`summary-strip ${report.status === 'complete' && report.one_minimal ? 'signal-good' : 'signal-warn'}`}
            >
              <span>
                {report.status === 'complete' && report.one_minimal ? (
                  <CheckCheck size={16} />
                ) : (
                  <FlaskConical size={16} />
                )}
                {resultStatus(report)}
              </span>
            </div>
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(String(v))}
              className="result-tabs"
            >
              {/* Explicit relationships keep SSR/client IDs stable; Base UI 1.7's
                  panel registration does not use the supplied DOM id. */}
              <TabsList variant="line" className="result-tabs-list">
                <TabsTrigger
                  id="casecrop-tab-trace"
                  aria-controls={
                    tab === 'trace' ? 'casecrop-panel-trace' : undefined
                  }
                  value="trace"
                >
                  Trace comparison
                </TabsTrigger>
                <TabsTrigger
                  id="casecrop-tab-experiments"
                  aria-controls={
                    tab === 'experiments'
                      ? 'casecrop-panel-experiments'
                      : undefined
                  }
                  value="experiments"
                >
                  Replay log{' '}
                  <span className="tab-count">{report.trials.length}</span>
                </TabsTrigger>
                <TabsTrigger
                  id="casecrop-tab-fix"
                  aria-controls={
                    tab === 'fix' ? 'casecrop-panel-fix' : undefined
                  }
                  value="fix"
                >
                  Reference fix
                </TabsTrigger>
              </TabsList>
              <TabsContent
                id="casecrop-panel-trace"
                aria-labelledby="casecrop-tab-trace"
                value="trace"
              >
                <p className="inspection-hint">
                  Select an event to inspect its payload and prerequisites.
                </p>
                <div className="trace-comparison">
                  <div className="trace-column original">
                    <div className="column-label">
                      <span>
                        Original trace{' '}
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
                      onSelect={inspectEvent}
                      compact
                    />
                  </div>
                  <div className="trace-column reduced">
                    <div className="column-label">
                      <span>
                        Reduced trace{' '}
                        <span className="muted-number">
                          / {report.reduced.events.length}
                        </span>
                      </span>
                      <span className="target-pill">
                        {report.one_minimal
                          ? 'Audit complete'
                          : report.status.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <EventRows
                      events={report.reduced.events}
                      selected={selected}
                      onSelect={inspectEvent}
                    />
                    <div className="bug-survives">
                      <span className="field-label">Target failure</span>
                      <code>{report.signature}</code>
                    </div>
                    <p className="minimal-note">
                      {report.one_minimal
                        ? 'Every permitted event deletion, including its dependent events, was tested. None preserved the failure. This is closure 1-minimality; a smaller trace may exist.'
                        : report.status === 'unstable'
                          ? 'The final replay did not reproduce the target. Review the replay log before using this trace as a regression.'
                          : 'Verification is incomplete. Review the replay log before using this case as a verified regression.'}
                    </p>
                  </div>
                </div>
                {selectedEvent && (
                  <section
                    className="event-inspector"
                    ref={inspectorRef}
                    tabIndex={-1}
                    aria-label={`Event ${selectedEvent.id}`}
                  >
                    <div className="field-row">
                      <strong>{selectedEvent.id}</strong>
                      <button
                        onClick={closeInspector}
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
                    {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Long payloads require keyboard scrolling. */}
                    <pre tabIndex={0} aria-label="Event payload">
                      {JSON.stringify(selectedEvent.payload, null, 2)}
                    </pre>
                  </section>
                )}
              </TabsContent>
              <TabsContent
                id="casecrop-panel-experiments"
                aria-labelledby="casecrop-tab-experiments"
                value="experiments"
              >
                <div className="experiments">
                  <div className="field-row">
                    <h3>Replay history</h3>
                    <span className="mono">
                      {trialIndex + 1} / {report.trials.length}
                    </span>
                  </div>
                  <p>
                    Each bar is one candidate, ordered by trial number. Height
                    shows its event count. Select a bar or use Previous and Next
                    to inspect the replay.
                  </p>
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
                  <div
                    className="trial-navigation"
                    aria-label="Navigate replay trials"
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTrialIndex((i) => Math.max(0, i - 1))}
                      disabled={trialIndex === 0}
                    >
                      <ChevronLeft size={14} /> Previous trial
                    </Button>
                    <span className="mono">
                      {trialIndex + 1} of {report.trials.length}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setTrialIndex((i) =>
                          Math.min(report.trials.length - 1, i + 1),
                        )
                      }
                      disabled={trialIndex === report.trials.length - 1}
                    >
                      Next trial <ChevronRight size={14} />
                    </Button>
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
                    {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Overflowing content must support keyboard scrolling. */}
                    <section
                      className="candidate-chips"
                      aria-label="Candidate events"
                      tabIndex={0}
                    >
                      {trial.kept.map((id) => (
                        <span key={id}>{id}</span>
                      ))}
                      {!trial.kept.length && <span>empty trace</span>}
                    </section>
                    {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
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
              <TabsContent
                id="casecrop-panel-fix"
                aria-labelledby="casecrop-tab-fix"
                value="fix"
              >
                <div className="golden-fix">
                  <span className="eyebrow">
                    <ShieldCheck size={14} />
                    Reference implementation
                  </span>
                  <h3>
                    {report.fixed_outcome.verdict === 'pass'
                      ? 'The reference fix passes this trace.'
                      : report.fixed_outcome.verdict === 'fail'
                        ? 'The reference implementation still fails this trace.'
                        : 'The reference replay is unresolved.'}
                  </h3>
                  <p>{resultCase.reason}</p>
                  {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Overflowing content must support keyboard scrolling. */}
                  <section
                    className="code-diff"
                    aria-label="Reference code changes"
                    tabIndex={0}
                  >
                    <pre className="deleted">− {resultCase.before}</pre>
                    <pre className="added">+ {resultCase.after}</pre>
                  </section>
                  {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
                  <div className="control-row">
                    <span>Final replay of buggy implementation</span>
                    <span
                      className={`verdict ${finalReplay?.outcome.verdict ?? 'unresolved'}`}
                    >
                      {finalReplay
                        ? finalReplay.outcome.verdict.toUpperCase()
                        : 'NOT RUN'}
                      {finalReplay?.outcome.verdict === 'fail'
                        ? ` · ${finalReplay.outcome.signature}`
                        : ''}
                    </span>
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
                    The reference check uses the reduced trace. Final
                    confirmation of the buggy implementation is recorded
                    separately and requires remaining replay budget. A passing
                    reference result applies to this case; it does not prove the
                    fix handles every possible input.
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
                  ? `${report.cache_hits} cached observations reused`
                  : `Result: ${report.status.replaceAll('_', ' ')}`}
              </span>
              <div className="export-actions">
                <Button
                  variant="ghost"
                  onClick={() => download('reduced.json', report.reduced_json)}
                >
                  <FileJson size={14} />
                  Download trace
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    download('casecrop-report.json', report.rawReport ?? report)
                  }
                >
                  <ArrowDownToLine size={14} />
                  Download report
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
            <span className="eyebrow">Python integration</span>
            <h2>Reduce traces from your own system.</h2>
            <p>
              Implement a replay function that resets application state and
              checks for a specific failure. CaseCrop handles candidate
              deletion, prerequisite validation, and the audit report.
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
              <code>{install}</code>
              <button
                aria-label="Copy install command"
                onClick={() => copy(install)}
              >
                <Copy size={15} />
              </button>
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <Link className="brand footer-brand" href="/">
          <Crop size={19} />
          casecrop
        </Link>
        <span>Python trace reduction · MIT license</span>
        <div>
          <Link href="https://github.com/shi1720">By Shivam Gupta</Link>
          <Link href="https://github.com/shi1720/casecrop/blob/main/LICENSE">
            MIT
          </Link>
          <Link
            href="/runtime/THIRD_PARTY_LICENSES.txt"
            target="_blank"
            rel="noreferrer"
            prefetch={false}
          >
            Licenses
          </Link>
          <Link href="https://github.com/shi1720/casecrop/releases/tag/v0.1.1">
            v0.1.1 · beta
          </Link>
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
