import { describe, expect, it } from 'vitest';
import { binarizeBand, keepSureWords, sameBand, textMask } from '../src/ocr';

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
