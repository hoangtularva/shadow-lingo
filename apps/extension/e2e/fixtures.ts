import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
export const EXTENSION_PATH = join(here, '../.output/chrome-mv3');
const WATCH_HTML = readFileSync(join(here, 'fixtures/watch.html'), 'utf8');

/** json3 caption fixtures keyed by video id. */
export const CAPTIONS: Record<string, string> = {
  adVideo0001: json3([[0, 3000, 'Buy our amazing product today.']]),
  manualVideo1: json3([
    [0, 2500, 'Welcome to the show. Today we'],
    [2500, 5000, 'practice shadowing together.'],
    [6000, 9000, 'Repeat after me, please.'],
  ]),
  // Human Vietnamese captions, cut differently from the English ones.
  'manualVideo1:vi': json3([
    [0, 2400, 'Chào mừng đến với chương trình.'],
    [2400, 5000, 'Hôm nay ta cùng luyện shadowing.'],
    [6000, 9000, 'Hãy nói theo tôi nhé.'],
  ]),
  asrVideo0001: json3([
    [0, 1000, 'so'],
    [1000, 2000, 'here we go'],
    [5000, 6000, 'next part starts'],
  ]),
};

function json3(rows: [number, number, string][]): string {
  return JSON.stringify({
    events: rows.map(([t, d, text]) => ({
      tStartMs: t,
      dDurationMs: d - t,
      segs: [{ utf8: text }],
    })),
  });
}

/** The welcome page each fresh install opened, by browser context. */
export const WELCOME_URLS = new WeakMap<BrowserContext, string>();

/** The tab may appear before or after the listener would, and its URL only once it navigates. */
async function waitForWelcome(context: BrowserContext): Promise<Page> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const page = context.pages().find((p) => p.url().endsWith('/welcome.html'));
    if (page) return page;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('the welcome tab did not open after install');
}

/** Hosts the extension may contact. Everything else is a failure. */
function isAllowedUrl(url: string): boolean {
  return (
    url.startsWith('https://www.youtube.com/') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  );
}

async function routeYouTube(context: BrowserContext): Promise<void> {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    // The extension's own files (CSS, fonts) load from chrome-extension://.
    if (url.protocol === 'chrome-extension:') return route.continue();
    if (url.hostname !== 'www.youtube.com') return route.abort();
    if (url.pathname === '/watch') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: WATCH_HTML });
    }
    if (url.pathname === '/api/timedtext') {
      const v = url.searchParams.get('v') ?? '';
      const lang = url.searchParams.get('lang') ?? 'en';
      const body = CAPTIONS[lang === 'en' ? v : `${v}:${lang}`] ?? '';
      return route.fulfill({ status: 200, contentType: 'application/json', body });
    }
    return route.fulfill({ status: 404, body: '' });
  });
}

export const test = base.extend<{ context: BrowserContext; offHostRequests: string[] }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    // PW_CHROMIUM_PATH: use a preinstalled Chromium when Playwright's own build is missing.
    const executablePath = process.env.PW_CHROMIUM_PATH;
    const context = await chromium.launchPersistentContext('', {
      ...(executablePath ? { executablePath } : { channel: 'chromium' }),
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        // Shadowing recorder: a fake microphone, and permission prompts auto-accepted.
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
      viewport: { width: 1280, height: 900 },
    });
    await routeYouTube(context);
    // A fresh install opens the welcome tab: note it, then close it so tests start clean.
    const welcome = await waitForWelcome(context);
    WELCOME_URLS.set(context, welcome.url());
    await welcome.close();
    await use(context);
    await context.close();
  },
  offHostRequests: async ({ context }, use) => {
    const seen: string[] = [];
    context.on('request', (req) => {
      if (!isAllowedUrl(req.url())) seen.push(req.url());
    });
    await use(seen);
  },
});

export const expect = test.expect;

export async function openWatch(page: Page, videoId: string): Promise<void> {
  await page.goto(`https://www.youtube.com/watch?v=${videoId}`);
}

/** Sets the fixture video's time and fires the events the player would. */
export async function setVideoTime(page: Page, seconds: number): Promise<void> {
  await page.evaluate((s) => {
    const v = document.querySelector('video');
    if (!v) throw new Error('no video');
    v.currentTime = s;
    v.dispatchEvent(new Event('timeupdate'));
  }, seconds);
}

/** Plain text of each sentence (the visible rows also hold IPA). */
export function sentenceTexts(page: Page): Promise<string[]> {
  return page
    .getByTestId('sl-sentence')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.text ?? ''));
}
