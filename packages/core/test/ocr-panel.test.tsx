import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi as vitestVi } from 'vitest';
import type { PlayerAdapter } from '../src/adapters';
import type { OcrAdapter, OcrPixels, OcrRegion } from '../src/ocr';
import { moveEdge } from '../src/panel/OcrStrip';
import { Panel } from '../src/panel/Panel';
import { createPanelStore } from '../src/panel/store';
import { vi } from '../src/panel/strings';
import { OCR_INTERVAL_MS } from '../src/panel/useOcr';

function playingPlayer() {
  let time = 0;
  const player: PlayerAdapter = {
    getCurrentTime: () => time,
    seekTo: (ms) => {
      time = ms;
    },
    play: () => undefined,
    pause: () => undefined,
    isPaused: () => false,
    getPlaybackRate: () => 1,
    setPlaybackRate: () => undefined,
    onTimeUpdate: () => () => undefined,
  };
  return { player, at: (ms: number) => (time = ms) };
}

/** Dark pixels with white letter strokes in rows y0..y1; `seed` shifts them (a new line). */
function frame(w: number, h: number, y0: number, y1: number, seed: number): OcrPixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const text = y >= y0 && y <= y1 && x >= w * 0.2 && x < w * 0.8 && (x + seed) % 4 < 2;
      const v = text ? 255 : 20;
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return { data, width: w, height: h };
}

/**
 * A video whose subtitles sit in the middle of the frame. Lines are scripted by time; the
 * engine "reads" the line showing when the band was grabbed.
 */
function scriptedOcr(now: () => number, script: [number, string][]) {
  const grabs: OcrRegion[] = [];
  const lineAt = (t: number) => [...script].reverse().find(([from]) => t >= from)?.[1] ?? '';
  let shown = '';
  const ocr: OcrAdapter = {
    grab(region, maxWidth) {
      grabs.push(region);
      shown = lineAt(now());
      const seed = script.findIndex(([, l]) => l === shown);
      if (region.from === 0 && region.to === 1) {
        // Whole frame, small: text rows in the middle.
        return Promise.resolve(
          shown ? frame(maxWidth, 180, 84, 96, seed) : frame(maxWidth, 180, 0, -1, 0),
        );
      }
      return Promise.resolve(shown ? frame(200, 40, 10, 30, seed) : frame(200, 40, 0, -1, 0));
    },
    recognize: () => Promise.resolve({ text: shown, confidence: shown ? 90 : 0 }),
  };
  return { ocr, grabs };
}

async function play(from: number, to: number, set: (t: number) => void) {
  for (let t = from; t <= to; t += OCR_INTERVAL_MS) {
    set(t);
    await act(async () => {
      vitestVi.advanceTimersByTime(OCR_INTERVAL_MS);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }
}

describe('Đọc chữ trên hình', () => {
  beforeEach(() => {
    vitestVi.useFakeTimers();
    // jsdom has no canvas: enough of one for the band reader.
    vitestVi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: () => undefined,
          fillRect: () => undefined,
        }) as unknown as CanvasRenderingContext2D,
    );
    vitestVi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,AAAA');
  });
  afterEach(() => {
    vitestVi.useRealTimers();
    vitestVi.restoreAllMocks();
  });

  it('finds where the subtitles sit, reads as the video plays, stops on demand', async () => {
    const store = createPanelStore({ theme: 'dark' });
    store.getState().setVideo('abc');
    const { player, at } = playingPlayer();
    let now = 0;
    const { ocr, grabs } = scriptedOcr(
      () => now,
      [
        [0, 'So what do we do now?'],
        [2000, 'I think we should figure it out together.'],
        [4000, 'Take a deep breath and try it again.'],
        [6000, ''],
      ],
    );
    render(<Panel store={store} player={player} ocr={ocr} />);
    fireEvent.click(screen.getByTestId('sl-empty-other'));
    fireEvent.click(screen.getByTestId('sl-ocr-start'));
    expect(screen.getByTestId('sl-ocr-waiting').textContent).toBe(vi.ocrWaiting);
    expect(screen.getByTestId('sl-ocr-auto').getAttribute('aria-pressed')).toBe('true');
    await play(0, 7000, (t) => {
      now = t;
      at(t);
    });
    // Settled on the middle once text kept showing there; lines read meanwhile are kept.
    expect(screen.getByTestId('sl-ocr-count').textContent).toBe(vi.ocrReadingAt('middle', 3));
    expect(screen.getAllByTestId('sl-sentence').map((s) => s.dataset.text)).toEqual([
      'So what do we do now?',
      'I think we should figure it out together.',
      'Take a deep breath and try it again.',
    ]);
    expect(screen.getByTestId('sl-source').textContent).toBe(vi.sourceOcr);
    // The band read is around the middle of the frame.
    const band = grabs.filter((r) => r.to - r.from < 1).at(-1);
    expect(band && (band.from + band.to) / 2).toBeCloseTo(0.5, 1);

    fireEvent.click(screen.getByTestId('sl-ocr-top'));
    await play(7500, 7500, () => undefined);
    expect(grabs.at(-1)).toEqual({ from: 0.03, to: 0.28 });
    expect(screen.getByTestId('sl-ocr-count').textContent).toBe(vi.ocrReadingAt('top', 3));
    fireEvent.click(screen.getByTestId('sl-ocr-stop'));
    expect(screen.queryByTestId('sl-ocr')).toBeNull();
    // What was read stays.
    expect(screen.getAllByTestId('sl-sentence')).toHaveLength(3);
  });

  it('"Chọn vùng": drag the band in a sketch of the frame, then read only there', async () => {
    const store = createPanelStore({ theme: 'dark' });
    store.getState().setVideo('abc');
    const { player } = playingPlayer();
    const { ocr, grabs } = scriptedOcr(() => 0, [[0, 'Hello there everyone.']]);
    render(<Panel store={store} player={player} ocr={ocr} />);
    fireEvent.click(screen.getByTestId('sl-empty-other'));
    fireEvent.click(screen.getByTestId('sl-ocr-start'));
    fireEvent.click(screen.getByTestId('sl-ocr-custom'));
    expect(screen.getByTestId('sl-ocr-custom').getAttribute('aria-expanded')).toBe('true');
    const top = screen.getByTestId('sl-ocr-edge-top');
    for (let i = 0; i < 5; i++) fireEvent.keyDown(top, { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByTestId('sl-ocr-edge-bottom'), { key: 'ArrowUp', shiftKey: true });
    // Screen readers hear each edge as a slider with its position.
    expect(top.getAttribute('role')).toBe('slider');
    expect(top.getAttribute('aria-valuenow')).toBe('67');
    fireEvent.click(screen.getByTestId('sl-ocr-region-done'));
    expect(screen.queryByTestId('sl-ocr-region')).toBeNull();
    // Opened from "Tự tìm" before it found anything: starts at the usual band.
    const region = store.getState().ocr.region;
    expect(region.from).toBeCloseTo(0.67);
    expect(region.to).toBeCloseTo(0.92);
    expect(store.getState().ocr.placement).toBe('custom');
    await play(0, 1000, () => undefined);
    expect(grabs.at(-1)).toEqual(region);
    expect(screen.getByTestId('sl-ocr-count').textContent).toBe(vi.ocrReadingCustom(0));

    // Cancel keeps what was chosen.
    fireEvent.click(screen.getByTestId('sl-ocr-custom'));
    fireEvent.keyDown(screen.getByTestId('sl-ocr-edge-top'), { key: 'ArrowDown' });
    fireEvent.click(screen.getByTestId('sl-ocr-region-cancel'));
    expect(store.getState().ocr.region).toEqual(region);
  });

  it('lines read while "Tự tìm" was still unsure are kept when another place is chosen', async () => {
    const store = createPanelStore({ theme: 'dark' });
    store.getState().setVideo('abc');
    const { player, at } = playingPlayer();
    let now = 0;
    const { ocr } = scriptedOcr(
      () => now,
      [
        [0, 'So what do we do now?'],
        [1500, ''],
      ],
    );
    render(<Panel store={store} player={player} ocr={ocr} />);
    fireEvent.click(screen.getByTestId('sl-empty-other'));
    fireEvent.click(screen.getByTestId('sl-ocr-start'));
    await play(0, 1000, (t) => {
      now = t;
      at(t);
    });
    // Still a candidate (not settled), and the learner picks "Dưới".
    expect(store.getState().ocr.found).toBeNull();
    fireEvent.click(screen.getByTestId('sl-ocr-bottom'));
    await play(1500, 6000, (t) => {
      now = t;
      at(t);
    });
    expect(screen.getAllByTestId('sl-sentence').map((s) => s.dataset.text)).toEqual([
      'So what do we do now?',
    ]);
  });

  it('edges keep the region inside the frame and at least a few lines tall', () => {
    expect(moveEdge({ from: 0.7, to: 0.9 }, 'from', 0.88).from).toBeCloseTo(0.84);
    expect(moveEdge({ from: 0.7, to: 0.9 }, 'to', 1.4)).toEqual({ from: 0.7, to: 1 });
    expect(moveEdge({ from: 0.1, to: 0.9 }, 'from', -0.2)).toEqual({ from: 0, to: 0.9 });
  });

  it('a protected video says so and stops', async () => {
    const store = createPanelStore({ theme: 'dark' });
    store.getState().setVideo('abc');
    const { player } = playingPlayer();
    const ocr: OcrAdapter = {
      grab: () => Promise.resolve('blocked'),
      recognize: () => Promise.resolve(null),
    };
    render(<Panel store={store} player={player} ocr={ocr} />);
    fireEvent.click(screen.getByTestId('sl-empty-other'));
    fireEvent.click(screen.getByTestId('sl-ocr-start'));
    await play(0, 0, () => undefined);
    expect(store.getState().ocr.active).toBe(false);
    expect(store.getState().notice).toBe(vi.ocrBlocked);
  });

  it('no OCR option without a platform reader', () => {
    const store = createPanelStore({ theme: 'dark' });
    store.getState().setVideo('abc');
    render(<Panel store={store} player={playingPlayer().player} />);
    fireEvent.click(screen.getByTestId('sl-empty-other'));
    expect(screen.queryByTestId('sl-ocr-start')).toBeNull();
  });
});
