import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { expect, openWatch, test } from './fixtures';

/** axe-core (accessibility rules: contrast, names, ARIA), loaded into the page for each check. */
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

interface Violation {
  id: string;
  help: string;
  nodes: { target: unknown; failureSummary?: string }[];
}

/** The panel's accessibility problems, as readable lines (empty when there are none). */
async function audit(page: Page): Promise<string[]> {
  await page.evaluate(`${AXE};0`);
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run(ctx: unknown, opts: unknown): Promise<{ violations: Violation[]; passes: unknown[] }>;
        };
      }
    ).axe;
    const result = await axe.run(
      { include: [{ fromShadowDom: ['shadow-lingo-panel', '.sl-root'] }] },
      {},
    );
    // Something was checked: an empty result must not come from an empty selection.
    if (result.passes.length === 0) throw new Error('nothing checked');
    return result.violations;
  });
  return violations.map(
    (v) =>
      `${v.id}: ${v.help} — ${v.nodes
        .slice(0, 3)
        .map((n) => `${JSON.stringify(n.target)} ${n.failureSummary ?? ''}`)
        .join(' | ')}`,
  );
}

for (const theme of ['dark', 'light'] as const) {
  test(`accessibility: panel, word card, shadowing and notebook (${theme})`, async ({ page }) => {
    await openWatch(page, 'manualVideo1');
    if (theme === 'light') {
      await page.evaluate(() => document.documentElement.removeAttribute('dark'));
    }
    await expect(page.getByTestId('sl-sentence')).toHaveCount(3);
    await expect(page.getByTestId('sl-panel')).toHaveAttribute('data-theme', theme);
    // Colours fade in (≤200 ms): check once they have settled.
    await page.waitForTimeout(400);
    expect(await audit(page)).toEqual([]);
    await page.getByTestId('sl-shadowing-toggle').click();
    await page.getByTestId('sl-word').filter({ hasText: 'show' }).click();
    await expect(page.getByTestId('sl-word-card')).toHaveAttribute('data-status', 'ready');
    expect(await audit(page)).toEqual([]);
    await page.getByTestId('sl-tab-vocab').click();
    expect(await audit(page)).toEqual([]);
  });
}

test('accessibility: other sources and reading text from the picture', async ({ page }) => {
  await openWatch(page, 'ocrVideo001');
  await page.getByTestId('sl-empty-other').click();
  expect(await audit(page)).toEqual([]);
  await page.getByTestId('sl-ocr-start').click();
  await page.getByTestId('sl-ocr-custom').click();
  expect(await audit(page)).toEqual([]);
});
