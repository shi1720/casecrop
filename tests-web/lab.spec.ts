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
  await expect(page.getByText('Previously executed example')).toBeVisible();
  await page.getByRole('button', { name: 'Crop this case' }).click();
  await expect(page.getByText('Executed in your browser')).toBeVisible();
  await expect(
    page.getByText('Same failure confirmed', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Inspect store-a', exact: true })
    .last()
    .click();
  await expect(page.locator('.event-inspector')).toContainText('tenant-a');
  await page.getByRole('button', { name: 'Close event inspector' }).click();
  const downloadWait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  const download = await downloadWait;
  const path = await download.path();
  const report = JSON.parse(await readFile(path!, 'utf8'));
  expect(report.reduced.events).toHaveLength(6);
  expect(report.one_minimal).toBe(true);
  expect(report.fixed_outcome.verdict).toBe('pass');
  const traceWait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Trace', exact: true }).click();
  const tracePath = await (await traceWait).path();
  expect(await readFile(tracePath!, 'utf8')).toBe(report.reduced_json);
  await page.getByRole('tab', { name: 'The golden fix' }).click();
  await expect(page.locator('.added')).toContainText(
    '(tenant_id, resource_id)',
  );
  await expect(page.getByText('PASS', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Experiments/ }).click();
  await page.getByRole('button', { name: /^Trial 2:/ }).click();
  await expect(page.locator('.trial-detail')).toContainText('Trial 2');
  await page.getByRole('tab', { name: 'The trace', exact: true }).click();
  await expect(page.locator('.target-pill')).toHaveText('1-MINIMAL');
  expect(errors).toEqual([]);
  if (testInfo.project.name === 'chromium' && process.env.UPDATE_SCREENSHOTS) {
    await mkdir('docs/assets', { recursive: true });
    await page.getByRole('heading', { name: 'Less trace. Same bug.' }).click();
    await page.screenshot({ path: 'docs/assets/lab.png', fullPage: true });
  }
});

test('other systems and exhausted budgets stay honest', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-hydrated=true]')).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole('combobox', { name: '01 / PICK YOUR BUG' }).click();
  await page.getByRole('option', { name: 'Lost update in a counter' }).click();
  await page.getByRole('button', { name: 'Crop this case' }).click();
  await expect(page.getByText('Executed in your browser')).toBeVisible();
  await expect(page.locator('.bug-survives')).toContainText(
    'counter.lost_update',
  );
  await page.getByRole('combobox', { name: '03 / CALL BUDGET' }).click();
  await page.getByRole('option', { name: '20 · a tight budget' }).click();
  await page.getByRole('button', { name: 'Crop this case' }).click();
  await expect(page.locator('.target-pill')).toHaveText('BUDGET EXHAUSTED');
  await expect(page.getByText('Final replay incomplete')).toBeVisible();
  await expect(
    page.getByText('Same failure confirmed', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('combobox', { name: '01 / PICK YOUR BUG' }).click();
  await page.getByRole('option', { name: 'Stale permission cache' }).click();
  await page.getByRole('combobox', { name: '03 / CALL BUDGET' }).click();
  await page.getByRole('option', { name: '500 calls', exact: true }).click();
  await page.getByRole('button', { name: 'Crop this case' }).click();
  await expect(page.locator('.bug-survives')).toContainText('auth.stale_allow');
  await expect(page.getByText('Executed in your browser')).toBeVisible();
});

test('invalid custom input recovers and valid edits are actually executed', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('[data-hydrated=true]')).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole('button', { name: 'Edit the trace JSON' }).click();
  await page
    .getByLabel('Edit events for the selected replay system')
    .fill('{}');
  await page.getByRole('button', { name: 'Crop this case' }).click();
  await expect(page.getByRole('alert')).toContainText('schema_version');
  await page.getByRole('button', { name: 'Use generated trace' }).click();
  await page.getByRole('button', { name: 'Edit the trace JSON' }).click();
  const editor = page.getByLabel('Edit events for the selected replay system');
  const original = JSON.parse(await editor.inputValue());
  original.events = original.events.filter(
    (e: { payload: { op: string } }) => e.payload.op !== 'observe',
  );
  await editor.fill(JSON.stringify(original));
  await page.getByRole('button', { name: 'Crop this case' }).click();
  await expect(page.getByText('Executed in your browser')).toBeVisible();
  await expect(page.locator('.score > span').first()).toHaveText('6');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('keyboard operation, no overflow, and accessible lab and docs', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('[data-hydrated=true]')).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole('combobox', { name: '01 / PICK YOUR BUG' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  // Exercise relationships after hydration and after a keyboard tab change.
  for (const name of ['The trace', /Experiments/, 'The golden fix']) {
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
    page.getByRole('heading', { name: /Make the failure/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: '06 / Any language. One JSON protocol.',
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
  await page.getByRole('button', { name: 'Edit the trace JSON' }).click();
  const editor = page.getByLabel('Edit events for the selected replay system');
  const source = await editor.inputValue();
  await editor.fill(
    source.replace(
      '"schema_version":1',
      '"schema_version":1,"schema_version":1',
    ),
  );
  await page.getByRole('button', { name: 'Crop this case' }).click();
  await expect(page.getByRole('alert')).toContainText('duplicate JSON key');
  await expect(page.getByText('Previously executed example')).toBeVisible();
});

test('an unresolved golden control never shows verified success', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Edit the trace JSON' }).click();
  const editor = page.getByLabel('Edit events for the selected replay system');
  const source = JSON.parse(await editor.inputValue());
  source.events.push({
    id: 'bad-tail',
    payload: { op: 'not-supported' },
    pinned: true,
  });
  await editor.fill(JSON.stringify(source));
  await page.getByRole('button', { name: 'Crop this case' }).click();
  await expect(page.getByText('Executed in your browser')).toBeVisible();
  await page.getByRole('tab', { name: 'The golden fix' }).click();
  await expect(page.getByText('REFERENCE CONTROL INCOMPLETE')).toBeVisible();
  await expect(page.getByText('VERIFIED REFERENCE SOLUTION')).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Crop this case' }).click();
  await page.getByRole('button', { name: 'Cancel run' }).click();
  await expect(page.getByRole('alert')).toContainText('Run cancelled');
  await page.unroute('**/casecrop-worker.mjs');
  await page.getByRole('button', { name: 'Crop this case' }).click();
  await expect(page.getByText('Executed in your browser')).toBeVisible();
});
