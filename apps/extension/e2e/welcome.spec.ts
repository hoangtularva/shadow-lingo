import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { WELCOME_URLS, expect, test } from './fixtures';

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

interface Violation {
  id: string;
  help: string;
  nodes: { target: unknown; failureSummary?: string }[];
}

test('a fresh install opens the welcome page once', async ({ context }) => {
  const url = WELCOME_URLS.get(context);
  expect(url).toMatch(/^chrome-extension:\/\/[a-p]{32}\/welcome\.html$/);
  // The fixture closed it; nothing opens it again.
  expect(context.pages().some((p) => p.url().endsWith('/welcome.html'))).toBe(false);
});

for (const theme of ['dark', 'light'] as const) {
  test(`welcome page: steps, links and accessibility (${theme})`, async ({
    context,
    page,
    offHostRequests,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 1280, height: 1180 });
    await page.goto(WELCOME_URLS.get(context) ?? '');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Chào mừng bạn đến với ShadowLingo',
    );
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Bật phụ đề bằng nút CC' }),
    ).toBeVisible();
    await expect(page.getByTestId('sl-welcome-translator')).toBeVisible();
    await expect(page.getByTestId('sl-welcome-try')).toHaveAttribute(
      'href',
      'https://www.youtube.com/',
    );
    await expect(page.getByRole('link', { name: 'Chính sách quyền riêng tư' })).toHaveAttribute(
      'href',
      'https://github.com/hoangtularva/shadow-lingo/blob/master/PRIVACY.md',
    );
    // Bundled fonts, no web fonts.
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => document.fonts.check('700 44px "SL Be Vietnam Pro"', 'Chào')),
    ).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`welcome-${theme}.png`), fullPage: true });

    await page.evaluate(`${AXE};0`);
    const violations = await page.evaluate(async () => {
      const axe = (
        window as unknown as {
          axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: Violation[] }> };
        }
      ).axe;
      // The wordmark is the logo (amber "Lingo"): logotypes are exempt from contrast (WCAG
      // 1.4.3). Everything else, the logo's name included, is checked.
      const contrast = await axe.run(
        { exclude: [['.brand']] },
        { runOnly: { type: 'rule', values: ['color-contrast'] } },
      );
      const rest = await axe.run(document, { rules: { 'color-contrast': { enabled: false } } });
      return [...contrast.violations, ...rest.violations].map(
        (v) =>
          `${v.id}: ${v.help} — ${v.nodes
            .slice(0, 3)
            .map((n) => `${JSON.stringify(n.target)} ${n.failureSummary ?? ''}`)
            .join(' | ')}`,
      );
    });
    expect(violations).toEqual([]);
    expect(offHostRequests).toEqual([]);
  });
}
