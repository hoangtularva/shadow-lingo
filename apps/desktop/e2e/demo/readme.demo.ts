// The README screenshot of the desktop app: run with `pnpm demos` from the repository root
// (scripts/make-readme-demos.mjs), not with the e2e tests. The video is a drawn scene and the
// sentences are written for the demo.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron, expect, test } from '@playwright/test';

const OUT = process.env.DEMO_OUT ?? join(__dirname, '../../demo-frames');
mkdirSync(OUT, { recursive: true });
const VIDEO = 'demoVideo01';
const CAPTIONS = JSON.stringify({
  events: [
    [0, 3000, 'So what do we do now?'],
    [3000, 6500, 'I think we should figure it out together.'],
    [6500, 9500, "Let's start with the easy part."],
    [9500, 13000, 'Take a deep breath and try it again.'],
  ].map(([t, e, s]) => ({ tStartMs: t, dDurationMs: Number(e) - Number(t), segs: [{ utf8: s }] })),
});

/** A stand-in player: our own sunset scene, playing, then the captions it "loads". */
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
  const g = c.getContext('2d');
  const t0 = performance.now();
  const draw = () => {
    const t = (performance.now() - t0) / 1000;
    c.width = innerWidth; c.height = innerHeight;
    const w = c.width, h = c.height, k = w / 640;
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#2b3a67'); sky.addColorStop(1, '#f2a65a');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd27a'; g.beginPath(); g.arc((470 - t * 4) * k, (150 + Math.sin(t / 2) * 6) * k, 42 * k, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3c4f7a'; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= 640; x += 20) g.lineTo(x * k, (270 + Math.sin(x / 70 + t / 3) * 18) * k);
    g.lineTo(w, h); g.fill();
    g.fillStyle = '#1f2a44'; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= 640; x += 20) g.lineTo(x * k, (315 + Math.sin(x / 50 - t / 2) * 10) * k);
    g.lineTo(w, h); g.fill();
    requestAnimationFrame(draw);
  };
  draw();
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
