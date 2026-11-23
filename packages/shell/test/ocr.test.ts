import { describe, expect, it } from 'vitest';
import { bandRect, videoArea } from '../src/ocr';

describe('OCR band on the page', () => {
  it('finds the 16:9 video inside a wider or taller player box', () => {
    expect(videoArea({ x: 0, y: 0, width: 1600, height: 450 })).toEqual({
      x: 400,
      y: 0,
      width: 800,
      height: 450,
    });
    expect(videoArea({ x: 10, y: 20, width: 640, height: 600 })).toEqual({
      x: 10,
      y: 20 + (600 - 360) / 2,
      width: 640,
      height: 360,
    });
  });

  it('bottom and top bands of the video', () => {
    const box = { x: 100, y: 50, width: 640, height: 360 };
    const bottom = bandRect(box, 'bottom');
    expect(bottom.x).toBe(100);
    expect(bottom.width).toBe(640);
    expect(bottom.y).toBeCloseTo(50 + 360 * 0.72);
    expect(bottom.height).toBeCloseTo(360 * 0.25);
    expect(bandRect(box, 'top').y).toBeCloseTo(50 + 360 * 0.03);
  });
});
