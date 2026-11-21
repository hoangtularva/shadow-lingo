import { describe, expect, it } from 'vitest';
import { findActiveIndex, progressWithin } from '../src/sync';

const items = [
  { start: 1000, end: 2000 },
  { start: 2500, end: 4000 },
  { start: 4000, end: 6000 },
];

describe('findActiveIndex', () => {
  it('returns -1 before the first item and for empty lists', () => {
    expect(findActiveIndex(items, 0)).toBe(-1);
    expect(findActiveIndex([], 5000)).toBe(-1);
  });

  it('finds the last started item, holding through gaps', () => {
    expect(findActiveIndex(items, 1000)).toBe(0);
    expect(findActiveIndex(items, 2200)).toBe(0);
    expect(findActiveIndex(items, 2500)).toBe(1);
    expect(findActiveIndex(items, 4000)).toBe(2);
    expect(findActiveIndex(items, 999999)).toBe(2);
  });

  it('scales to long videos', () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({
      start: i * 1800,
      end: i * 1800 + 1700,
    }));
    expect(findActiveIndex(many, 1800 * 1234 + 5)).toBe(1234);
  });
});

describe('progressWithin', () => {
  it('clamps to 0..1', () => {
    expect(progressWithin({ start: 0, end: 1000 }, 500)).toBe(0.5);
    expect(progressWithin({ start: 0, end: 1000 }, -5)).toBe(0);
    expect(progressWithin({ start: 0, end: 1000 }, 5000)).toBe(1);
    expect(progressWithin({ start: 10, end: 10 }, 10)).toBe(1);
  });
});
