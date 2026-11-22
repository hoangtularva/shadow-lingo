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

/** No network: YouTube is faked in the main process (requests go through its https handler). */
async function fakeYouTube(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(
    (_electron, { embed, captions }) => {
      (
        globalThis as { __shadowLingoTestFetch?: (url: string) => Response | undefined }
      ).__shadowLingoTestFetch = (raw) => {
        const url = new URL(raw);
        if (url.origin === 'https://hoangtularva.github.io') return undefined;
        if (url.hostname === 'www.youtube.com' && url.pathname.startsWith('/embed/')) {
          return new Response(embed, { headers: { 'content-type': 'text/html' } });
        }
        if (url.hostname === 'www.youtube.com' && url.pathname === '/api/timedtext') {
          return new Response(captions, { headers: { 'content-type': 'application/json' } });
        }
        return new Response('', { status: 404 });
      };
    },
    { embed: EMBED, captions: CAPTIONS },
  );
}

let app: ElectronApplication;
let win: Page;

test.beforeEach(async () => {
  app = await _electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..'),
    env: { ...process.env, SHADOWLINGO_USER_DATA: mkdtempSync(join(tmpdir(), 'sl-desk-')) },
  });
  await fakeYouTube(app);
  win = await app.firstWindow();
  // The app page loads after the window opens.
  await win.waitForURL('https://hoangtularva.github.io/shadow-lingo/app/');
  await win.getByTestId('desk-url').waitFor();
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
  // No machine translator in the app: the note says so (not the Chrome one).
  await expect(win.getByTestId('sl-vi-toggle')).toHaveAttribute(
    'title',
    /Bản app chưa có dịch máy/,
  );
  await expect(win.getByTestId('sl-sentence').first()).toHaveAttribute(
    'data-text',
    'Welcome to the show.',
  );
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
  app = await _electron.launch({
    args: ['.', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    cwd: join(__dirname, '..'),
    env: { ...process.env, SHADOWLINGO_USER_DATA: mkdtempSync(join(tmpdir(), 'sl-desk-')) },
  });
  await fakeYouTube(app);
  win = await app.firstWindow();
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
