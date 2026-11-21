import { CAPTIONS, expect, openWatch, setVideoTime, test } from './fixtures';

test('shows captured captions beside the player, ignoring ad captions', async ({
  page,
  offHostRequests,
}) => {
  await openWatch(page, 'manualVideo1');
  const panel = page.getByTestId('sl-panel');
  await expect(panel).toBeVisible();

  const sentences = page.getByTestId('sl-sentence');
  await expect(sentences).toHaveText([
    /Welcome to the show\./,
    /Today we practice shadowing together\./,
    /Repeat after me, please\./,
  ]);
  await expect(page.getByText('Buy our amazing product')).toHaveCount(0);
  await expect(page.getByTestId('sl-source')).toContainText('Phụ đề gốc');

  // Mounted first inside #secondary, and never over the player.
  const host = page.locator('#secondary-inner > shadow-lingo-panel');
  await expect(host).toHaveCount(1);
  expect(
    await page
      .locator('#secondary-inner > *')
      .first()
      .evaluate((el) => el.tagName),
  ).toBe('SHADOW-LINGO-PANEL');
  const playerBox = await page.locator('#movie_player').boundingBox();
  const panelBox = await panel.boundingBox();
  if (!playerBox || !panelBox) throw new Error('missing boxes');
  expect(panelBox.x).toBeGreaterThanOrEqual(playerBox.x + playerBox.width);

  // Bundled font is used and loaded from the extension.
  const family = await panel.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toContain('SL Be Vietnam Pro');

  expect(offHostRequests).toEqual([]);
});

test('click to seek and highlight follows the video time', async ({ page }) => {
  await openWatch(page, 'manualVideo1');
  const sentences = page.getByTestId('sl-sentence');
  await expect(sentences).toHaveCount(3);

  await sentences.nth(2).click();
  const time = await page.evaluate(() => document.querySelector('video')?.currentTime);
  expect(time).toBeCloseTo(6, 1);
  await expect(sentences.nth(2)).toHaveAttribute('data-active', 'true');

  await setVideoTime(page, 0.5);
  await expect(sentences.nth(0)).toHaveAttribute('data-active', 'true');
  await expect(sentences.nth(2)).not.toHaveAttribute('data-active', 'true');
});

test('switches captions on SPA navigation', async ({ page }) => {
  await openWatch(page, 'manualVideo1');
  await expect(page.getByTestId('sl-sentence')).toHaveCount(3);

  await page.evaluate(() => {
    const w = window as unknown as {
      fixture: { navigate(v: string): void; loadCaptions(v: string, asr: boolean): void };
    };
    w.fixture.navigate('asrVideo0001');
    w.fixture.loadCaptions('asrVideo0001', true);
  });
  await expect(page.getByTestId('sl-sentence')).toHaveText([/so here we go/, /next part starts/]);
  await expect(page.getByTestId('sl-source')).toContainText('Phụ đề tự động');
  expect(CAPTIONS.asrVideo0001).toBeTruthy();
});

test('no captions: paste a transcript or open a subtitle file', async ({ page }) => {
  await openWatch(page, 'noCaptions01');
  await expect(page.getByTestId('sl-empty')).toBeVisible();

  await page.getByTestId('sl-paste').fill('0:00\nFirst line here.\n0:04\nSecond line here.');
  await page.getByTestId('sl-paste-submit').click();
  await expect(page.getByTestId('sl-sentence')).toHaveText([
    /First line here\./,
    /Second line here\./,
  ]);
  await expect(page.getByTestId('sl-source')).toContainText('bản chép');

  await page.getByTestId('sl-other-source').click();
  await page.getByTestId('sl-file').setInputFiles({
    name: 'talk.srt',
    mimeType: 'application/x-subrip',
    buffer: Buffer.from('1\n00:00:01,000 --> 00:00:03,000\nFrom a file.\n'),
  });
  await expect(page.getByTestId('sl-sentence')).toHaveText([/From a file\./]);
  await expect(page.getByTestId('sl-source')).toContainText('tệp');
});

test('follows the page theme', async ({ page }) => {
  await openWatch(page, 'noCaptions01');
  const panel = page.getByTestId('sl-panel');
  await expect(panel).toHaveAttribute('data-theme', 'dark');
  await page.evaluate(() => document.documentElement.removeAttribute('dark'));
  await expect(panel).toHaveAttribute('data-theme', 'light');
  await expect(panel).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('collapse state persists across reloads', async ({ page }) => {
  await openWatch(page, 'manualVideo1');
  await expect(page.getByTestId('sl-sentence')).toHaveCount(3);
  await page.getByTestId('sl-collapse').click();
  await expect(page.getByTestId('sl-sentence')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('sl-panel')).toBeVisible();
  await expect(page.getByTestId('sl-collapse')).toHaveAttribute('aria-expanded', 'false');
  await page.getByTestId('sl-collapse').click();
  await expect(page.getByTestId('sl-sentence')).toHaveCount(3);
});

test('dragging over the player docks the panel back', async ({ page }) => {
  await openWatch(page, 'manualVideo1');
  const header = page.getByTestId('sl-header');
  await expect(header).toBeVisible();
  const box = await header.boundingBox();
  if (!box) throw new Error('no header');

  // Drag further right, clear of the player: floats.
  await page.mouse.move(box.x + 40, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 60, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('sl-frame')).toHaveAttribute('data-mode', 'floating');

  // Drag onto the player: snaps back to docked.
  const floatBox = await header.boundingBox();
  const player = await page.locator('#movie_player').boundingBox();
  if (!floatBox || !player) throw new Error('missing boxes');
  await page.mouse.move(floatBox.x + 40, floatBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(player.x + 50, player.y + 50, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('sl-frame')).toHaveAttribute('data-mode', 'docked');
});
