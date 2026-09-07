import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile, mkdir } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-hydrated=true]')).toBeVisible({
    timeout: 45_000,
  });
});

test('executes Python, inspects events, exports evidence and shows the fix', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('[data-hydrated=true]')).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByText('Saved example result')).toBeVisible();
  await page.getByRole('button', { name: 'Run reduction' }).click();
  await expect(page.getByText('Completed in this browser')).toBeVisible();
  await expect(
    page.getByText('Failure reproduced and deletion audit complete', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Inspect store-a', exact: true })
    .last()
    .click();
  await expect(page.locator('.event-inspector')).toContainText('tenant-a');
  await expect(page.locator('.event-inspector')).toBeFocused();
  await expect(page.locator('.event-inspector')).toBeInViewport();
  await page
    .getByRole('button', { name: 'Inspect store-a', exact: true })
    .first()
    .click();
  await expect(page.locator('.event-inspector')).toBeFocused();
  await expect(page.locator('.event-inspector')).toBeInViewport();
  await page.getByRole('button', { name: 'Close event inspector' }).click();
  const downloadWait = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download report', exact: true })
    .click();
  const download = await downloadWait;
  const path = await download.path();
  const report = JSON.parse(await readFile(path!, 'utf8'));
  expect(report.reduced.events).toHaveLength(6);
  expect(report.one_minimal).toBe(true);
  expect(report.fixed_outcome.verdict).toBe('pass');
  const traceWait = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download trace', exact: true })
    .click();
  const tracePath = await (await traceWait).path();
  expect(await readFile(tracePath!, 'utf8')).toBe(report.reduced_json);
  await page.getByRole('tab', { name: 'Reference fix' }).click();
  await expect(page.locator('.added')).toContainText(
    '(tenant_id, resource_id)',
  );
  await expect(page.getByText('PASS', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Replay log/ }).click();
  await page.getByRole('button', { name: /^Trial 2:/ }).click();
  await expect(page.locator('.trial-detail')).toContainText('Trial 2');
  await page.getByRole('button', { name: 'Next trial' }).click();
  await expect(page.locator('.trial-detail')).toContainText('Trial 3');
  await page.getByRole('button', { name: 'Previous trial' }).click();
  await expect(page.locator('.trial-detail')).toContainText('Trial 2');
  await page
    .getByRole('tab', { name: 'Trace comparison', exact: true })
    .click();
  await expect(page.locator('.target-pill')).toHaveText('Audit complete');
  expect(errors).toEqual([]);
  if (testInfo.project.name === 'chromium' && process.env.UPDATE_SCREENSHOTS) {
    await mkdir('docs/assets', { recursive: true });
    await page
      .getByRole('heading', { name: 'Find a smaller failing trace.' })
      .click();
    await page.screenshot({ path: 'docs/assets/lab.png', fullPage: true });
  }
});

test('other systems and exhausted budgets stay honest', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-hydrated=true]')).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole('combobox', { name: 'Replay system' }).click();
  await page.getByRole('option', { name: 'Lost update in a counter' }).click();
  await page.getByRole('button', { name: 'Run reduction' }).click();
  await expect(page.getByText('Completed in this browser')).toBeVisible();
  await expect(page.locator('.bug-survives')).toContainText(
    'counter.lost_update',
  );
  if (
    !(await page.getByRole('combobox', { name: 'Replay budget' }).isVisible())
  )
    await page.getByText('Run limits', { exact: false }).click();
  await page.getByRole('combobox', { name: 'Replay budget' }).click();
  await page.getByRole('option', { name: '20 replays' }).click();
  await page.getByRole('button', { name: 'Run reduction' }).click();
  await expect(page.locator('.target-pill')).toHaveText('budget exhausted');
  await expect(
    page.getByText('Replay budget reached; verification incomplete'),
  ).toBeVisible();
  await expect(
    page.getByText('Failure reproduced and deletion audit complete', {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Replay system' }).click();
  await page.getByRole('option', { name: 'Stale permission cache' }).click();
  if (
    !(await page.getByRole('combobox', { name: 'Replay budget' }).isVisible())
  )
    await page.getByText('Run limits', { exact: false }).click();
  await page.getByRole('combobox', { name: 'Replay budget' }).click();
  await page.getByRole('option', { name: '500 replays', exact: true }).click();
  await page.getByRole('button', { name: 'Run reduction' }).click();
  await expect(page.locator('.bug-survives')).toContainText('auth.stale_allow');
  await expect(page.getByText('Completed in this browser')).toBeVisible();
});

test('invalid custom input recovers and valid edits are actually executed', async ({
  page,
}) => {
  let engineLoads = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/engine-sources.json')) engineLoads++;
  });
  await page.goto('/');
  await expect(page.locator('[data-hydrated=true]')).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole('button', { name: 'Edit example JSON' }).click();
  await page.getByLabel('Example trace JSON').fill('{}');
  await page.getByRole('button', { name: 'Run reduction' }).click();
  await expect(page.getByRole('alert')).toContainText('schema_version');
  await page.getByRole('button', { name: 'Use generated trace' }).click();
  await page.getByRole('button', { name: 'Edit example JSON' }).click();
  const editor = page.getByLabel('Example trace JSON');
  const original = JSON.parse(await editor.inputValue());
  original.events = original.events.filter(
    (e: { payload: { op: string } }) => e.payload.op !== 'observe',
  );
  await editor.fill(JSON.stringify(original));
  await page.getByRole('button', { name: 'Run reduction' }).click();
  await expect(page.getByText('Completed in this browser')).toBeVisible();
  await expect(page.getByTestId('original-count')).toHaveText(/^6\s*events$/);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(engineLoads).toBe(1);
});

test('keyboard operation, no overflow, and accessible lab and docs', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('[data-hydrated=true]')).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole('combobox', { name: 'Replay system' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  // Exercise relationships after hydration and after a keyboard tab change.
  for (const name of ['Trace comparison', /Replay log/, 'Reference fix']) {
    const trigger = page.getByRole('tab', { name, exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-selected', 'true');
    const panelId = await trigger.getAttribute('aria-controls');
    const tabId = await trigger.getAttribute('id');
    if (!panelId || !tabId) throw new Error('Tab must name its panel');
    await expect(page.locator(`[id="${panelId}"]`)).toBeVisible();
    await expect(page.locator(`[id="${panelId}"]`)).toHaveAttribute(
      'aria-labelledby',
      tabId,
    );
    const analysis = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      analysis.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('link', { name: 'Documentation', exact: false }).click();
  await expect(
    page.getByRole('heading', { name: /Reduce a failing execution/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Command-line replay protocol',
    }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    ).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('raw JSON keeps duplicate keys and numeric types for Python validation', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Edit example JSON' }).click();
  const editor = page.getByLabel('Example trace JSON');
  const source = await editor.inputValue();
  await editor.fill(
    source.replace(
      '"schema_version":1',
      '"schema_version":1,"schema_version":1',
    ),
  );
  await page.getByRole('button', { name: 'Run reduction' }).click();
  await expect(page.getByRole('alert')).toContainText('duplicate JSON key');
  await expect(page.getByText('Saved example result')).toBeVisible();
});

test('an unresolved golden control never shows verified success', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Edit example JSON' }).click();
  const editor = page.getByLabel('Example trace JSON');
  const source = JSON.parse(await editor.inputValue());
  source.events.push({
    id: 'bad-tail',
    payload: { op: 'not-supported' },
    pinned: true,
  });
  await editor.fill(JSON.stringify(source));
  await page.getByRole('button', { name: 'Run reduction' }).click();
  await expect(page.getByText('Completed in this browser')).toBeVisible();
  await page.getByRole('tab', { name: 'Reference fix' }).click();
  await expect(
    page.getByText('The reference replay is unresolved.'),
  ).toBeVisible();
  await expect(
    page.getByText('The reference fix passes this trace.'),
  ).toHaveCount(0);
  await expect(page.locator('.control-row .verdict.unresolved')).toHaveText(
    'UNRESOLVED',
  );
});

test('cancel terminates a loading worker and another run can start', async ({
  page,
}) => {
  await page.route('**/casecrop-worker.mjs', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue().catch(() => {});
  });
  await page.getByRole('button', { name: 'Run reduction' }).click();
  await page.getByRole('button', { name: 'Cancel run' }).click();
  await expect(page.getByRole('alert')).toContainText('Run cancelled');
  await page.unroute('**/casecrop-worker.mjs');
  await page.getByRole('button', { name: 'Run reduction' }).click();
  await expect(page.getByText('Completed in this browser')).toBeVisible();
});

test('pending settings and exports remain tied to the displayed run', async ({
  page,
}) => {
  const noise = page.getByRole('slider', { name: 'Unrelated events' });
  await noise.focus();
  await noise.press('ArrowRight');
  await expect(page.getByRole('status')).toContainText('Settings changed');
  await expect(page.getByTestId('original-count')).toHaveText(/^36\s*events$/);
  await expect(page.locator('.report-provenance')).toContainText(
    '30 unrelated events',
  );
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report' }).click();
  const file = await (await downloading).path();
  expect(
    JSON.parse(await readFile(file!, 'utf8')).original.events,
  ).toHaveLength(36);
  await page
    .getByRole('button', { name: 'Run reduction', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('previous run');
  await expect(page.getByText('Completed in this browser')).toBeVisible();
  await expect(page.getByTestId('original-count')).toHaveText(/^41\s*events$/);
  await expect(page.locator('.pending-notice')).toHaveCount(0);
  await expect(page.locator('.report-provenance')).toContainText(
    '35 unrelated events',
  );
});

test('a failed final replay is distinguished from incomplete verification', async ({
  page,
}) => {
  const reports = JSON.parse(await readFile('lib/examples.json', 'utf8'));
  const result = {
    ...reports.cache,
    trials: reports.cache.trials.map((t: { phase: string }) =>
      t.phase === 'confirm'
        ? { ...t, outcome: { verdict: 'pass', signature: '', reason: '' } }
        : t,
    ),
    status: 'unstable',
    confirmed: false,
    one_minimal: false,
  };
  await page.route('**/casecrop-worker.mjs', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `self.onmessage = ({data}) => self.postMessage({id:data.id,result:${JSON.stringify(result)}});`,
    }),
  );
  await page
    .getByRole('button', { name: 'Run reduction', exact: true })
    .click();
  await expect(
    page.getByText('Final replay did not reproduce the failure', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Failure reproduced and deletion audit complete', {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.locator('.target-pill')).toHaveText('unstable');
  await expect(page.locator('.summary-strip')).toHaveClass(/signal-warn/);
  await expect(page.locator('.minimal-note')).toContainText(
    'final replay did not reproduce',
  );
  await page.getByRole('tab', { name: 'Reference fix' }).click();
  await expect(page.locator('.control-row').first()).toContainText('PASS');
  await expect(
    page.locator('.control-row').first().locator('.verdict.fail'),
  ).toHaveCount(0);
});

test('an incomplete audit and failing reference keep their actual verdicts', async ({
  page,
}) => {
  const reports = JSON.parse(await readFile('lib/examples.json', 'utf8'));
  const result = {
    ...reports.cache,
    status: 'unresolved',
    one_minimal: false,
    fixed_outcome: {
      verdict: 'fail',
      signature: 'cache.cross_tenant',
      reason: 'Reference still leaks the cached value',
    },
  };
  await page.route('**/casecrop-worker.mjs', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `self.onmessage = ({data}) => self.postMessage({id:data.id,result:${JSON.stringify(result)}});`,
    }),
  );
  await page
    .getByRole('button', { name: 'Run reduction', exact: true })
    .click();
  await expect(page.getByText('Completed in this browser')).toBeVisible();
  await expect(page.locator('.summary-strip')).toHaveClass(/signal-warn/);
  await expect(page.locator('.summary-strip')).toContainText(
    'deletion checks are unresolved',
  );
  await page.getByRole('tab', { name: 'Reference fix' }).click();
  await expect(
    page.getByText('The reference implementation still fails this trace.'),
  ).toBeVisible();
  await expect(page.locator('.control-row').last()).toContainText('FAIL');
  await expect(
    page.getByText('The reference replay is unresolved.'),
  ).toHaveCount(0);
});

type ToolForTest = {
  name: string;
  execute: (input: unknown) => unknown;
};
declare global {
  interface Window {
    casecropTestTools: Record<string, ToolForTest>;
  }
}

test('agent tool completion guarantees immediate current readback', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.casecropTestTools = {};
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool: ToolForTest, options: { signal: AbortSignal }) {
          window.casecropTestTools[tool.name] = tool;
          options.signal.addEventListener('abort', () => {
            delete window.casecropTestTools[tool.name];
          });
        },
      },
    });
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Object.keys(window.casecropTestTools).length),
    )
    .toBe(2);
  const observed = await page.evaluate(async () => {
    const tools = window.casecropTestTools;
    const before = await tools.get_casecrop_result.execute({});
    const run = await tools.run_casecrop_example.execute({
      case: 'counter',
      noise: 0,
    });
    const after = await tools.get_casecrop_result.execute({});
    return { before, run, after };
  });
  expect(observed.before).toMatchObject({
    source: 'saved_example',
    case: 'cache',
    before: 36,
  });
  expect(observed.run).toMatchObject({ before: 5, after: 5 });
  expect(observed.after).toMatchObject({
    source: 'browser_run',
    case: 'counter',
    before: 5,
    after: 5,
    pending_settings: false,
    running: false,
    confirmed: true,
    one_minimal: true,
  });
  await expect(
    page.getByRole('combobox', { name: 'Replay system' }),
  ).toContainText('Lost update');
});

test('workbench and documentation reflow at a narrow viewport and enlarged text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(
    page.getByRole('button', { name: 'Run reduction', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addStyleTag({ content: 'html {font-size: 200% !important;}' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto('/docs');
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
