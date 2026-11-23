import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT,
  MAX_WIDTH,
  MIN_HEIGHT,
  changedFields,
  clampToViewport,
  maxDockedHeight,
  overlaps,
  resolveDrop,
  sanitizeLayout,
} from '@/lib/layout';

const viewport = { width: 1280, height: 800 };
const player = { x: 0, y: 56, width: 860, height: 484 };

describe('sanitizeLayout', () => {
  it('falls back to defaults for junk', () => {
    expect(sanitizeLayout(undefined)).toEqual(DEFAULT_LAYOUT);
    expect(sanitizeLayout('x')).toEqual(DEFAULT_LAYOUT);
  });

  it('clamps and keeps valid values', () => {
    const l = sanitizeLayout({ mode: 'floating', collapsed: true, height: 10, width: 9999, x: 5 });
    expect(l.mode).toBe('floating');
    expect(l.collapsed).toBe(true);
    expect(l.shadowingExpanded).toBe(false);
    expect(sanitizeLayout({ shadowingExpanded: true }).shadowingExpanded).toBe(true);
    // Older versions saved "shadowingCollapsed: false" by default: it no longer opens the section.
    expect(sanitizeLayout({ shadowingCollapsed: false }).shadowingExpanded).toBe(false);
    // The old 560px default becomes "fill the window"; a height the learner chose stays.
    expect(sanitizeLayout({ height: 560 }).height).toBe(0);
    expect(sanitizeLayout({ height: 700 }).height).toBe(700);
    expect(l.height).toBe(MIN_HEIGHT);
    expect(l.width).toBe(MAX_WIDTH);
    expect(l.x).toBe(5);
    expect(sanitizeLayout({ mode: 'weird', x: Number.NaN }).mode).toBe('docked');
  });
});

describe('geometry', () => {
  it('lists only the fields a change touched', () => {
    const next = { ...DEFAULT_LAYOUT, collapsed: true, width: 500 };
    expect(changedFields(DEFAULT_LAYOUT, next)).toEqual({ collapsed: true, width: 500 });
    expect(changedFields(next, next)).toEqual({});
  });

  it('detects overlaps', () => {
    expect(
      overlaps({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }),
    ).toBe(true);
    expect(
      overlaps({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 }),
    ).toBe(false);
  });

  it('keeps floating rects inside the viewport', () => {
    expect(clampToViewport({ x: -50, y: 2000, width: 470, height: 500 }, viewport)).toEqual({
      x: 0,
      y: 300,
      width: 470,
      height: 500,
    });
  });

  it('computes the max docked height', () => {
    expect(maxDockedHeight(100, 800)).toBe(684);
    expect(maxDockedHeight(790, 800)).toBe(MIN_HEIGHT);
  });
});

describe('resolveDrop', () => {
  it('docks back when the drop would cover the player', () => {
    expect(resolveDrop({ x: 100, y: 100, width: 470, height: 500 }, player, viewport)).toEqual({
      mode: 'docked',
    });
  });

  it('floats when the drop is clear of the player', () => {
    const res = resolveDrop({ x: 900, y: 600, width: 360, height: 300 }, player, viewport);
    expect(res).toEqual({ mode: 'floating', rect: { x: 900, y: 500, width: 360, height: 300 } });
  });

  it('floats anywhere when there is no player', () => {
    expect(resolveDrop({ x: 0, y: 0, width: 400, height: 300 }, null, viewport).mode).toBe(
      'floating',
    );
  });
});
