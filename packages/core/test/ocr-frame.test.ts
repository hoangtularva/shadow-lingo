import { describe, expect, it, vi } from 'vitest';
import {
  AUTO_CONFIRM_MS,
  closeWhenIdle,
  AUTO_MISS_MS,
  AutoRegion,
  binarizeBand,
  findTextRegion,
  keepSureWords,
  regionPosition,
  sameBand,
  textMask,
} from '../src/ocr';

/** A w×h RGBA picture filled with `bg`, with `fg` pixels where `ink(x, y)` is true. */
function picture(
  w: number,
  h: number,
  bg: [number, number, number],
  fg: [number, number, number],
  ink: (x: number, y: number) => boolean,
): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = ink(x, y) ? fg : bg;
      d.set([r, g, b, 255], (y * w + x) * 4);
    }
  }
  return d;
}

const letters = (x: number, y: number) => y >= 4 && y < 12 && x % 4 < 2 && x >= 10 && x < 90;

describe('textMask', () => {
  it('keeps white or yellow subtitle letters over a dark picture', () => {
    const mask = textMask(picture(100, 16, [30, 40, 60], [255, 255, 255], letters), 100, 16);
    expect(mask[4 * 100 + 12]).toBe(1);
    expect(mask[0]).toBe(0);
    const yellow = textMask(picture(100, 16, [30, 40, 60], [250, 220, 40], letters), 100, 16);
    expect(yellow[4 * 100 + 12]).toBe(1);
  });

  it('finds dark letters on a light box', () => {
    const mask = textMask(picture(100, 16, [180, 180, 180], [10, 10, 10], letters), 100, 16);
    expect(mask[4 * 100 + 12]).toBe(1);
    expect(mask[0]).toBe(0);
  });

  it('a plain picture has no text', () => {
    const mask = textMask(
      picture(100, 16, [30, 40, 60], [30, 40, 60], () => false),
      100,
      16,
    );
    expect(mask.every((v) => v === 0)).toBe(true);
  });
});

describe('binarizeBand', () => {
  it('turns the band into black text on white and spots an unchanged band', () => {
    const d = picture(100, 16, [30, 40, 60], [255, 255, 255], letters);
    const a = binarizeBand(d, 100, 16);
    expect(a.ink).toBeGreaterThan(100);
    expect([...d.slice(0, 4)]).toEqual([255, 255, 255, 255]);
    expect([...d.slice((4 * 100 + 12) * 4, (4 * 100 + 12) * 4 + 4)]).toEqual([0, 0, 0, 255]);
    const b = binarizeBand(picture(100, 16, [30, 40, 60], [255, 255, 255], letters), 100, 16);
    expect(sameBand(a.signature, b.signature, b.ink)).toBe(true);
    const other = (x: number, y: number) => y >= 4 && y < 12 && x >= 50 && x < 99;
    const c = binarizeBand(picture(100, 16, [30, 40, 60], [255, 255, 255], other), 100, 16);
    expect(sameBand(a.signature, c.signature, c.ink)).toBe(false);
    expect(sameBand(null, c.signature, c.ink)).toBe(false);
  });
});

describe('keepSureWords', () => {
  const w = (text: string, confidence = 90) => ({ text, confidence });
  it('keeps sure words line by line and drops picture details', () => {
    const reading = keepSureWords([
      [w('So'), w('what'), w('Qn', 40), w('now?')],
      [w('~', 95), w('A', 30)],
      [w('|', 20), w('think'), w('so.')],
    ]);
    expect(reading.text).toBe('So what now?\n| think so.');
    expect(reading.confidence).toBeGreaterThan(70);
  });

  it('nothing sure: no text', () => {
    expect(keepSureWords([[w('Qn', 40)]])).toEqual({ text: '', confidence: 0 });
  });
});

describe('findTextRegion and AutoRegion ("Tự tìm")', () => {
  /** A dark 320×180 frame; `paint` adds bright pixels. */
  const scene = (paint: (x: number, y: number) => boolean) =>
    ({
      data: picture(320, 180, [25, 30, 40], [255, 255, 255], paint),
      width: 320,
      height: 180,
    }) as const;
  const strokes = (y0: number, y1: number) => (x: number, y: number) =>
    y >= y0 && y <= y1 && x >= 60 && x < 260 && x % 5 < 2;

  it('finds a line of letters wherever it sits', () => {
    const bottom = findTextRegion(scene(strokes(150, 160)));
    expect(bottom && regionPosition(bottom)).toBe('bottom');
    expect(bottom?.from).toBeLessThan(150 / 180);
    expect(bottom?.to).toBeGreaterThan(161 / 180);
    const middle = findTextRegion(scene(strokes(85, 95)));
    expect(middle && regionPosition(middle)).toBe('middle');
  });

  it('a big bright shape or an empty frame is not text', () => {
    expect(findTextRegion(scene((x, y) => x > 40 && x < 140 && y > 20 && y < 90))).toBeNull();
    expect(findTextRegion(scene(() => false))).toBeNull();
  });

  it('settles on a place only after text keeps being found there for a few seconds', () => {
    const auto = new AutoRegion();
    const low = { from: 0.8, to: 0.95 };
    const high = { from: 0.05, to: 0.2 };
    // The player's title at the top for 3 s, then hidden: given up, never settled on.
    expect(auto.update(high, 0)).toEqual({ dropped: false, started: true, confirmed: false });
    expect(auto.update(high, 2000).confirmed).toBe(false);
    expect(auto.update(null, 4000).dropped).toBe(false);
    expect(auto.update(null, 2000 + AUTO_MISS_MS + 1)).toEqual({
      dropped: true,
      started: false,
      confirmed: false,
    });
    expect(auto.current).toBeNull();
    // Subtitles at the bottom, with a short gap between lines.
    expect(auto.update(low, 6000).started).toBe(true);
    expect(auto.candidate).toEqual(low);
    expect(auto.update(null, 7000).dropped).toBe(false);
    expect(auto.update(low, 8000).confirmed).toBe(false);
    expect(auto.update(low, AUTO_CONFIRM_MS + 6000).confirmed).toBe(true);
    expect(auto.current).toEqual(low);
    // Something at the top for a moment does not move it.
    expect(auto.update(high, 10_000).started).toBe(true);
    expect(auto.update(low, 12_000).dropped).toBe(true);
    expect(auto.current).toEqual(low);
  });
});

describe('closeWhenIdle', () => {
  it('closes the engine once unused for a while, never during a read', async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const use = closeWhenIdle(1000, close);
    let finish: () => void = () => undefined;
    const slow = use(() => new Promise<void>((r) => (finish = r)));
    vi.advanceTimersByTime(5000);
    expect(close).not.toHaveBeenCalled();
    finish();
    await slow;
    vi.advanceTimersByTime(900);
    await use(() => Promise.resolve());
    vi.advanceTimersByTime(900);
    expect(close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(close).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
