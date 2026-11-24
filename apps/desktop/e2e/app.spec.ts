import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

const VIDEO = 'dQw4w9WgXcQ';

/** json3 captions the fake player "loads", like the real one does after it starts. */
const CAPTIONS = JSON.stringify({
  events: [
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'Welcome to the show.' }] },
    { tStartMs: 2000, dDurationMs: 2000, segs: [{ utf8: 'Repeat after me, please.' }] },
  ],
});

/**
 * Stands in for the YouTube embed: answers our postMessage client, plays an ad first
 * (the player's own "ad-showing" class), then fetches its captions.
 */
const EMBED = `<!doctype html><html><body>
<div id="movie_player" class="html5-video-player ad-showing"></div>
<script>
  const send = (m) => parent.postMessage(JSON.stringify(m), '*');
  addEventListener('message', (e) => {
    const d = JSON.parse(e.data);
    if (d.event === 'listening') {
      send({ event: 'initialDelivery', info: { currentTime: 0, playerState: 2, playbackRate: 1,
        videoData: { video_id: '${VIDEO}', title: 'A talk about shadowing', author: 'Test Channel' } } });
    }
  });
  setTimeout(() => {
    document.getElementById('movie_player').classList.remove('ad-showing');
    fetch('/api/timedtext?v=${VIDEO}&lang=en&fmt=json3&pot=SECRET');
  }, 2500);
</script></body></html>`;

const OCR_VIDEO = 'ocrVideo001';

/**
 * A player without captions whose picture has subtitles burned in: blank first (the OCR
 * engine loads), then one line every 3 s. It reports playing time like the real embed.
 */
const OCR_EMBED = `<!doctype html><html><body style="margin:0;background:#000;overflow:hidden">
<canvas id="c" style="display:block;width:100vw;height:100vh"></canvas>
<script>
  const send = (m) => parent.postMessage(JSON.stringify(m), '*');
  addEventListener('message', (e) => {
    const d = JSON.parse(e.data);
    if (d.event === 'listening') {
      send({ event: 'initialDelivery', info: { currentTime: 0, playerState: 1, playbackRate: 1,
        videoData: { video_id: '${OCR_VIDEO}', title: 'Burned-in subtitles', author: 'Test Channel' } } });
    }
  });
  const lines = ['So what do we do now?', 'I think we should figure it out together.',
    "Let's start with the easy part."];
  const c = document.getElementById('c');
  const g = c.getContext('2d');
  const t0 = performance.now();
  const draw = () => {
    const t = (performance.now() - t0) / 1000;
    c.width = innerWidth;
    c.height = innerHeight;
    const w = c.width, h = c.height;
    g.fillStyle = '#20304a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#6a7a9a';
    g.fillRect(w * 0.1, h * 0.1, w * 0.3, h * 0.5);
    const line = t < 4 ? '' : lines[Math.floor((t - 4) / 3)];
    if (line) {
      g.font = 'bold ' + Math.round(h * 0.075) + 'px Arial';
      g.textAlign = 'center';
      g.lineWidth = 5;
      g.strokeStyle = '#000';
      g.strokeText(line, w / 2, h * 0.88);
      g.fillStyle = '#fff';
      g.fillText(line, w / 2, h * 0.88);
    }
    requestAnimationFrame(draw);
  };
  draw();
  setInterval(() => send({ event: 'infoDelivery',
    info: { currentTime: (performance.now() - t0) / 1000, playerState: 1 } }), 250);
</script></body></html>`;

/** No network: YouTube is faked in the main process (requests go through its https handler). */
async function fakeYouTube(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(
    (_electron, { embed, captions, ocrEmbed, ocrVideo }) => {
      (
        globalThis as { __shadowLingoTestFetch?: (url: string) => Response | undefined }
      ).__shadowLingoTestFetch = (raw) => {
        const url = new URL(raw);
        if (url.origin === 'https://hoangtularva.github.io') return undefined;
        if (url.hostname === 'www.youtube.com' && url.pathname.startsWith(`/embed/${ocrVideo}`)) {
          return new Response(ocrEmbed, { headers: { 'content-type': 'text/html' } });
        }
        if (url.hostname === 'www.youtube.com' && url.pathname.startsWith('/embed/')) {
          return new Response(embed, { headers: { 'content-type': 'text/html' } });
        }
        if (url.hostname === 'www.youtube.com' && url.pathname === '/api/timedtext') {
          return new Response(captions, { headers: { 'content-type': 'application/json' } });
        }
        return new Response('', { status: 404 });
      };
    },
    { embed: EMBED, captions: CAPTIONS, ocrEmbed: OCR_EMBED, ocrVideo: OCR_VIDEO },
  );
}

let app: ElectronApplication;
let win: Page;

/** Starts the app with a fresh profile and waits for its page (it loads after the window). */
async function launchApp(extraArgs: string[] = []): Promise<void> {
  app = await _electron.launch({
    args: ['.', ...extraArgs],
    cwd: join(__dirname, '..'),
    env: { ...process.env, SHADOWLINGO_USER_DATA: mkdtempSync(join(tmpdir(), 'sl-desk-')) },
  });
  await fakeYouTube(app);
  win = await app.firstWindow();
  // The app page has started loading (not its full "load" event, which some slow resource can
  // hold up on a CI machine); then its link field is what the tests need.
  await win.waitForURL('https://hoangtularva.github.io/shadow-lingo/app/', {
    waitUntil: 'commit',
    timeout: 60_000,
  });
  await win.getByTestId('desk-url').waitFor({ timeout: 60_000 });
}

test.beforeEach(async () => {
  await launchApp();
});

test.afterEach(async () => {
  await app.close();
});

test('home: invalid links are explained, valid ones open the video', async () => {
  await expect(win.getByText('Dán link video YouTube để bắt đầu')).toBeVisible();
  await win.getByTestId('desk-url').fill('hello');
  await win.getByTestId('desk-open').click();
  await expect(win.getByTestId('desk-invalid')).toBeVisible();
  await win.getByTestId('desk-url').fill(`https://youtu.be/${VIDEO}?t=90`);
  await win.getByTestId('desk-open').click();
  await expect(win.getByTestId('desk-invalid')).toHaveCount(0);
  const src = await win.getByTestId('desk-embed').getAttribute('src');
  expect(src).toContain(`https://www.youtube.com/embed/${VIDEO}?`);
  expect(src).toContain('start=90');
});

test('video: title, ad note, then the captions the player loaded', async () => {
  await win.getByTestId('desk-url').fill(`https://www.youtube.com/watch?v=${VIDEO}`);
  await win.getByTestId('desk-open').click();
  await expect(win.getByText('A talk about shadowing')).toBeVisible();
  await expect(win.getByText('Test Channel')).toBeVisible();
  // The ad plays first: the note explains it, nothing is skipped.
  await expect(win.getByTestId('sl-ad-note')).toBeVisible();
  await expect(win.getByTestId('sl-ad-note')).toHaveCount(0, { timeout: 10_000 });
  await expect(win.getByTestId('sl-sentence')).toHaveCount(2, { timeout: 10_000 });
  // The bundled offline model translates every sentence, no download step.
  // Enabled once the bundled model has loaded (a few seconds on slower machines).
  await expect(win.getByTestId('sl-vi-toggle')).toBeEnabled({ timeout: 30_000 });
  await expect(win.getByTestId('sl-vi-download')).toHaveCount(0);
  const line = win.getByTestId('sl-vi').first();
  await expect(line).toHaveText(/\p{L}{2}/u, { timeout: 60_000 });
  await expect(win.getByTestId('sl-sentence').first()).toHaveAttribute(
    'data-text',
    'Welcome to the show.',
  );
});

test('reads burned-in subtitles from the player picture, on the device', async () => {
  await win.getByTestId('desk-url').fill(`https://www.youtube.com/watch?v=${OCR_VIDEO}`);
  await win.getByTestId('desk-open').click();
  await win.getByTestId('sl-empty-other').click();
  await win.getByTestId('sl-ocr-start').click();
  await expect(win.getByTestId('sl-ocr')).toBeVisible();
  await expect
    .poll(
      () =>
        win
          .getByTestId('sl-sentence')
          .evaluateAll((els) => els.map((el) => el.getAttribute('data-text'))),
      { timeout: 25_000 },
    )
    .toEqual([
      'So what do we do now?',
      'I think we should figure it out together.',
      "Let's start with the easy part.",
    ]);
  // The badge names the source, or (once Vietnamese shows) says it in its tooltip.
  const badge = win.getByTestId('sl-source');
  await expect
    .poll(async () => `${await badge.textContent()} ${await badge.getAttribute('title')}`)
    .toContain('Từ chữ trên hình');
});

test('theme button: light, dark or the system theme, remembered', async () => {
  const root = win.locator('.sl-root').first();
  await win.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveClass(/(^|\s)dark(\s|$)/);
  await win.getByTestId('sl-theme').click();
  await expect(win.getByTestId('sl-theme-menu')).toContainText('Theo hệ thống');
  await win.getByTestId('sl-theme-light').click();
  await expect(root).not.toHaveClass(/(^|\s)dark(\s|$)/);
  await win.reload();
  await win.getByTestId('desk-url').waitFor();
  await expect(win.locator('.sl-root').first()).not.toHaveClass(/(^|\s)dark(\s|$)/);
  await expect(win.getByTestId('sl-theme')).toHaveAttribute('data-mode', 'light');
});

test('recent videos remember the title and channel and reopen', async () => {
  await win.getByTestId('desk-url').fill(VIDEO);
  await win.getByTestId('desk-open').click();
  await expect(win.getByText('A talk about shadowing')).toBeVisible();
  await win.getByTestId('desk-home').click();
  const recent = win.getByTestId('desk-recent');
  await expect(recent).toHaveCount(1);
  await expect(recent).toContainText('A talk about shadowing');
  await expect(recent).toContainText('Test Channel · mới mở');
  await recent.click();
  await expect(win.getByTestId('desk-embed')).toBeVisible();
});

test('shadowing: record the learner and compare, with the app’s own microphone access', async () => {
  await app.close();
  await launchApp(['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']);
  await win.getByTestId('desk-url').fill(VIDEO);
  await win.getByTestId('desk-open').click();
  await expect(win.getByTestId('sl-sentence')).toHaveCount(2, { timeout: 10_000 });
  await win.getByTestId('sl-shadowing-toggle').click();
  await win.getByTestId('sl-record').click();
  await win.waitForTimeout(1200);
  await win.getByTestId('sl-record').click();
  await expect(win.getByTestId('sl-wave-you')).not.toHaveAttribute('data-bars', '0', {
    timeout: 10_000,
  });
});

test('notebook: a word saved in another video opens that video at its sentence', async () => {
  await win.getByTestId('desk-url').fill(VIDEO);
  await win.getByTestId('desk-open').click();
  await expect(win.getByTestId('sl-sentence')).toHaveCount(2, { timeout: 10_000 });
  await win.getByTestId('sl-word').filter({ hasText: 'show' }).click();
  await win.getByTestId('sl-word-save').click();
  await expect(win.getByTestId('sl-word-save')).toHaveText(/Đã lưu/);

  await win.getByTestId('desk-url').fill('https://youtu.be/abcdefghijk');
  await win.getByTestId('desk-open').click();
  await expect(win.getByTestId('desk-embed')).toHaveAttribute('src', /embed\/abcdefghijk/);
  await win.getByTestId('sl-tab-vocab').click();
  await win.getByTestId('sl-vocab-jump').click();
  await expect(win.getByTestId('desk-embed')).toHaveAttribute('src', new RegExp(`embed/${VIDEO}`));
});
