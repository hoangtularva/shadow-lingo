// Films the README demo clips: run with `pnpm demos` from the repository root (see
// scripts/make-readme-demos.mjs), not with the e2e tests. The video is a drawn scene and the
// sentences are written for the demo: no real video or caption is shown.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPTIONS, expect, openWatch, test } from '../fixtures';
import type { Page } from '@playwright/test';

const OUT =
  process.env.DEMO_OUT ?? join(dirname(fileURLToPath(import.meta.url)), '../../demo-frames');

const LINES: [number, number, string][] = [
  [0, 3000, 'So what do we do now?'],
  [3000, 6500, 'I think we should figure it out together.'],
  [6500, 9500, "Let's start with the easy part."],
  [9500, 13000, 'Take a deep breath and try it again.'],
];
const json3 = (rows: [number, number, string][]) =>
  JSON.stringify({
    events: rows.map(([t, d, text]) => ({
      tStartMs: t,
      dDurationMs: d - t,
      segs: [{ utf8: text }],
    })),
  });
CAPTIONS.demoVideo01 = json3(LINES);

const CLIP = { x: 12, y: 12, width: 1108, height: 784 };

/** Our own moving scene in the player (no real video), optionally with burned-in lines. */
async function stage(page: Page, title: string, text: string, burned: boolean, light: boolean) {
  await page.evaluate(
    ({ title, text, burned, lines, light }) => {
      if (light) document.documentElement.removeAttribute('dark');
      const css = document.createElement('style');
      css.textContent = `
        body { background: ${light ? '#f4f5f7' : '#0f1115'} !important; }
        .ytp-subtitles-button, #related { display: none !important; }
        #movie_player { border-radius: 14px; overflow: hidden; }
        #demo-card { margin-top: 28px; width: 640px; font-family: 'Segoe UI', system-ui, sans-serif; color: ${light ? '#0f1115' : '#e7e9ee'}; }
        #demo-card .tag { display: inline-block; font-size: 13px; font-weight: 700; color: #15171c; background: #f5b544; border-radius: 999px; padding: 4px 12px; }
        #demo-card h2 { font-size: 30px; line-height: 1.25; margin: 16px 0 10px; font-weight: 700; }
        #demo-card p { font-size: 17px; line-height: 1.55; margin: 0; color: ${light ? '#4b5563' : '#c7cbd3'}; }`;
      document.head.append(css);
      const card = document.createElement('div');
      card.id = 'demo-card';
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'ShadowLingo';
      const h = document.createElement('h2');
      h.textContent = title;
      const p = document.createElement('p');
      p.textContent = text;
      card.append(tag, h, p);
      document.getElementById('primary')?.append(card);

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const g = canvas.getContext('2d');
      if (!g) return;
      const t0 = performance.now();
      const draw = () => {
        const t = (performance.now() - t0) / 1000;
        const sky = g.createLinearGradient(0, 0, 0, 360);
        sky.addColorStop(0, '#2b3a67');
        sky.addColorStop(1, '#f2a65a');
        g.fillStyle = sky;
        g.fillRect(0, 0, 640, 360);
        g.fillStyle = '#ffd27a';
        g.beginPath();
        g.arc(470 - t * 4, 150 + Math.sin(t / 2) * 6, 42, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#3c4f7a';
        g.beginPath();
        g.moveTo(0, 300);
        for (let x = 0; x <= 640; x += 20) g.lineTo(x, 270 + Math.sin(x / 70 + t / 3) * 18);
        g.lineTo(640, 360);
        g.lineTo(0, 360);
        g.fill();
        g.fillStyle = '#1f2a44';
        g.beginPath();
        g.moveTo(0, 330);
        for (let x = 0; x <= 640; x += 20) g.lineTo(x, 315 + Math.sin(x / 50 - t / 2) * 10);
        g.lineTo(640, 360);
        g.lineTo(0, 360);
        g.fill();
        if (burned) {
          const ms = t * 1000 - 3000;
          const line = ms < 0 ? '' : (lines.find(([a, b]) => ms >= a && ms < b)?.[2] ?? '');
          if (line) {
            g.font = 'bold 26px Arial';
            g.textAlign = 'center';
            g.lineWidth = 5;
            g.strokeStyle = '#000';
            g.strokeText(line, 320, 318);
            g.fillStyle = '#fff';
            g.fillText(line, 320, 318);
          }
        }
        requestAnimationFrame(draw);
      };
      draw();
      const video = document.querySelector('video');
      if (!video) return;
      video.srcObject = canvas.captureStream(20);
      video.muted = true;
      void video.play();
    },
    { title, text, burned, lines: LINES, light },
  );
}

/** Screenshots the clip over and over while `actions` run; saves the frames for encoding. */
async function film(page: Page, name: string, actions: () => Promise<void>) {
  const dir = join(OUT, name);
  mkdirSync(dir, { recursive: true });
  let running = true;
  let n = 0;
  let last = Date.now();
  const loop = (async () => {
    while (running) {
      const buf = await page.screenshot({ clip: CLIP });
      const now = Date.now();
      writeFileSync(join(dir, `${String(n++).padStart(4, '0')}_${now - last}.png`), buf);
      last = now;
    }
  })();
  await actions();
  running = false;
  await loop;
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

test('demo subtitles', async ({ page }) => {
  await page.setViewportSize({ width: 1140, height: 820 });
  await openWatch(page, 'demoVideo01');
  await expect(page.getByTestId('sl-sentence')).toHaveCount(4);
  await stage(
    page,
    'Phụ đề theo câu, IPA dưới từng chữ',
    'Câu đang nói tự nổi bật, kèm phiên âm, nối âm, tô màu từ loại và lưu ý những âm người Việt hay đọc sai.',
    false,
    false,
  );
  await page.waitForTimeout(800);
  await film(page, 'subtitles', () => page.waitForTimeout(10_500));
});

test('demo word', async ({ page }) => {
  await page.setViewportSize({ width: 1140, height: 820 });
  await openWatch(page, 'demoVideo01');
  await expect(page.getByTestId('sl-sentence')).toHaveCount(4);
  await stage(
    page,
    'Bấm một từ để tra, lưu vào sổ',
    'Định nghĩa, ví dụ và cách đọc ngay cạnh video, lưu vào sổ một chạm. Nhận ra cả cụm động từ như “figure it out”.',
    false,
    true,
  );
  await page.waitForTimeout(3600);
  await page.evaluate(() => document.querySelector('video')?.pause());
  await film(page, 'word', async () => {
    await page.waitForTimeout(900);
    await page.getByTestId('sl-word').filter({ hasText: 'figure' }).first().click();
    await expect(page.getByTestId('sl-word-card')).toHaveAttribute('data-status', 'ready');
    await page.waitForTimeout(2200);
    await page.getByTestId('sl-word-save').click();
    await page.waitForTimeout(2000);
  });
});

test('demo shadowing', async ({ page }) => {
  await page.setViewportSize({ width: 1140, height: 820 });
  await openWatch(page, 'demoVideo01');
  await expect(page.getByTestId('sl-sentence')).toHaveCount(4);
  await stage(
    page,
    'Nghe, nhại theo, so sánh',
    'Ghi âm giọng bạn ngay trong khung, nghe xen kẽ với bản gốc. Bản ghi chỉ nằm trên máy, không gửi đi đâu.',
    false,
    false,
  );
  await page.waitForTimeout(3600);
  await page.evaluate(() => document.querySelector('video')?.pause());
  await page.getByTestId('sl-shadowing-toggle').click();
  await film(page, 'shadowing', async () => {
    await page.waitForTimeout(1200);
    await page.getByTestId('sl-record').click();
    await page.waitForTimeout(2600);
    await page.getByTestId('sl-panel').press('r');
    await expect(page.getByTestId('sl-compare')).toBeEnabled();
    await page.waitForTimeout(1400);
    await page.getByTestId('sl-compare').click();
    await page.waitForTimeout(2600);
  });
});

test('demo ocr', async ({ page }) => {
  await page.setViewportSize({ width: 1140, height: 820 });
  await openWatch(page, 'demoBurned1');
  await expect(page.getByTestId('sl-empty-other')).toBeVisible();
  await stage(
    page,
    'Video không có phụ đề? Đọc chữ trên hình',
    'Phụ đề in sẵn trên hình được đọc thành từng câu, ngay trên máy bạn. Tự tìm chỗ có chữ, hoặc bạn tự chọn vùng.',
    true,
    false,
  );
  await page.getByTestId('sl-empty-other').click();
  await page.getByTestId('sl-ocr-start').click();
  await page.waitForTimeout(1500);
  await film(page, 'ocr', () => page.waitForTimeout(13_000));
});

test('demo review', async ({ page, context }) => {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;
  const seeder = await context.newPage();
  await seeder.goto(`chrome-extension://${extensionId}/mic-permission.html`);
  const words: [string, string, string, string, string][] = [
    [
      'figure out',
      'tìm ra, hiểu ra',
      'verb',
      'To come to understand, or to find a solution.',
      'I think we should figure it out together.',
    ],
    [
      'breath',
      'hơi thở',
      'noun',
      'The air taken into or let out of the lungs.',
      'Take a deep breath and try it again.',
    ],
    [
      'together',
      'cùng nhau',
      'adv',
      'With each other; as a group.',
      'I think we should figure it out together.',
    ],
    [
      'easy',
      'dễ',
      'adj',
      'Needing little effort; not difficult.',
      "Let's start with the easy part.",
    ],
    [
      'start',
      'bắt đầu',
      'verb',
      'To begin; to set something going.',
      "Let's start with the easy part.",
    ],
  ];
  for (const [i, [w, v, pos, gloss, s]] of words.entries()) {
    await seeder.evaluate(
      ([word, meaning, p, g, sentence, at]) =>
        chrome.runtime.sendMessage({
          type: 'shadow-lingo:vocab-put',
          entry: {
            id: word,
            headword: word,
            vi: meaning,
            senses: [{ pos: p, gloss: g }],
            context: {
              text: sentence,
              words: [0],
              start: 3000,
              videoId: 'demoVideo01',
              title: 'Demo',
            },
            addedAt: at,
          },
        }),
      [w, v, pos, gloss, s, 1000 + i] as const,
    );
  }
  await seeder.close();
  await page.setViewportSize({ width: 1140, height: 820 });
  await openWatch(page, 'demoVideo01');
  await expect(page.getByTestId('sl-sentence')).toHaveCount(4);
  await stage(
    page,
    'Sổ từ vựng và ôn tập',
    'Từ đã lưu kèm câu gốc và mốc thời gian. Ôn bằng câu hỏi trắc nghiệm, lịch ôn tự giãn theo FSRS.',
    false,
    true,
  );
  await page.waitForTimeout(1500);
  await film(page, 'review', async () => {
    await page.waitForTimeout(800);
    await page.getByTestId('sl-tab-vocab').click();
    await page.waitForTimeout(2000);
    await page.getByTestId('sl-review-start').click();
    await page.waitForTimeout(1800);
    await page.getByTestId('sl-review-choice').filter({ hasText: 'tìm ra' }).click();
    await page.waitForTimeout(2400);
  });
});
