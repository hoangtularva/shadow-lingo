// The README screenshot of the desktop app: run with `pnpm demos` from the repository root
// (scripts/make-readme-demos.mjs), not with the e2e tests. The video is a drawn scene and the
// sentences are written for the demo.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron, expect, test } from '@playwright/test';
import { speakerScene } from '../../../extension/e2e/demo/scene';

const OUT = process.env.DEMO_OUT ?? join(__dirname, '../../demo-frames');
mkdirSync(OUT, { recursive: true });
const VIDEO = 'demoVideo01';
const LINES: [number, number, string][] = [
  [0, 3000, 'So what do we do now?'],
  [3000, 6500, 'I think we should figure it out together.'],
  [6500, 9500, "Let's start with the easy part."],
  [9500, 13000, 'Take a deep breath and try it again.'],
];
const CAPTIONS = JSON.stringify({
  events: LINES.map(([t, e, s]) => ({
    tStartMs: t,
    dDurationMs: Number(e) - Number(t),
    segs: [{ utf8: s }],
  })),
});

/** A stand-in player: the shared drawn scene, playing, then the captions it "loads". */
const EMBED = `<!doctype html><html><body style="margin:0;background:#000;overflow:hidden">
<canvas id="c" style="display:block;width:100vw;height:100vh"></canvas>
<script>
  const send = (m) => parent.postMessage(JSON.stringify(m), '*');
  addEventListener('message', (e) => {
    const d = JSON.parse(e.data);
    if (d.event === 'listening') {
      send({ event: 'initialDelivery', info: { currentTime: 0, playerState: 1, playbackRate: 1,
        videoData: { video_id: '${VIDEO}', title: 'Shadowing practice: everyday English', author: 'ShadowLingo demo' } } });
    }
  });
  const c = document.getElementById('c');
  c.width = 1280; c.height = 720;
  (${speakerScene.toString()})(c, ${JSON.stringify(LINES)}, false);
  const t0 = performance.now();
  setInterval(() => send({ event: 'infoDelivery', info: { currentTime: (performance.now() - t0) / 1000 + 3.5, playerState: 1 } }), 250);
  setTimeout(() => fetch('/api/timedtext?v=${VIDEO}&lang=en&fmt=json3'), 500);
</script></body></html>`;

test.setTimeout(120_000);

for (const scheme of ['dark', 'light'] as const) {
  test(`desktop shot ${scheme}`, async () => {
    const app = await _electron.launch({
      args: ['.'],
      cwd: join(__dirname, '../..'),
      env: { ...process.env, SHADOWLINGO_USER_DATA: mkdtempSync(join(tmpdir(), 'sl-demo-')) },
    });
    await app.evaluate(
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
    const win = await app.firstWindow();
    await win.waitForURL('https://hoangtularva.github.io/shadow-lingo/app/');
    await win.emulateMedia({ colorScheme: scheme });
    await win.setViewportSize({ width: 1280, height: 800 });
    await win.getByTestId('desk-url').fill(`https://www.youtube.com/watch?v=${VIDEO}`);
    await win.getByTestId('desk-open').click();
    await expect(win.getByTestId('sl-sentence')).toHaveCount(4, { timeout: 15_000 });
    // Vietnamese lines from the bundled offline model.
    await expect(win.getByTestId('sl-vi').first()).toHaveText(/\p{L}{2}/u, { timeout: 60_000 });
    await win.waitForTimeout(1500);
    await win.screenshot({ path: `${OUT}/desktop-${scheme}.png` });
    await app.close();
  });
}
