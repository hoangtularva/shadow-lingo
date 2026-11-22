/** Panel placement, persisted in chrome.storage.local. */
export interface PanelLayout {
  /** "docked" = inside YouTube's right column; "floating" = fixed position chosen by dragging. */
  mode: 'docked' | 'floating';
  collapsed: boolean;
  /** Shadowing section folded to its steps row. */
  shadowingCollapsed: boolean;
  /** Docked height in px. */
  height: number;
  /** Floating rect in viewport px. */
  x: number;
  y: number;
  width: number;
  floatHeight: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const LAYOUT_KEY = 'panelLayout';
export const MIN_HEIGHT = 240;
export const MIN_WIDTH = 320;
export const MAX_WIDTH = 720;
export const DEFAULT_WIDTH = 470;

export const DEFAULT_LAYOUT: PanelLayout = {
  mode: 'docked',
  collapsed: false,
  shadowingCollapsed: false,
  height: 560,
  x: 24,
  y: 80,
  width: DEFAULT_WIDTH,
  floatHeight: 560,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), Math.max(min, max));
}

function finite(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Turns whatever was stored (possibly from an older version) into a valid layout. */
export function sanitizeLayout(raw: unknown): PanelLayout {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_LAYOUT };
  const r = raw as Record<string, unknown>;
  return {
    mode: r.mode === 'floating' ? 'floating' : 'docked',
    collapsed: r.collapsed === true,
    shadowingCollapsed: r.shadowingCollapsed === true,
    height: clamp(finite(r.height, DEFAULT_LAYOUT.height), MIN_HEIGHT, 4000),
    x: finite(r.x, DEFAULT_LAYOUT.x),
    y: finite(r.y, DEFAULT_LAYOUT.y),
    width: clamp(finite(r.width, DEFAULT_LAYOUT.width), MIN_WIDTH, MAX_WIDTH),
    floatHeight: clamp(finite(r.floatHeight, DEFAULT_LAYOUT.floatHeight), MIN_HEIGHT, 4000),
  };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Keeps a floating rect fully inside the viewport. */
export function clampToViewport(rect: Rect, viewport: { width: number; height: number }): Rect {
  const width = clamp(rect.width, MIN_WIDTH, Math.min(MAX_WIDTH, viewport.width));
  const height = clamp(rect.height, MIN_HEIGHT, viewport.height);
  return {
    width,
    height,
    x: clamp(rect.x, 0, viewport.width - width),
    y: clamp(rect.y, 0, viewport.height - height),
  };
}

/**
 * Decides where a dragged panel ends up. The panel must never cover the player, so a drop
 * that overlaps it snaps back to the docked position.
 */
export function resolveDrop(
  rect: Rect,
  player: Rect | null,
  viewport: { width: number; height: number },
): { mode: 'docked' } | { mode: 'floating'; rect: Rect } {
  const clamped = clampToViewport(rect, viewport);
  if (player && overlaps(clamped, player)) return { mode: 'docked' };
  return { mode: 'floating', rect: clamped };
}

/** Max docked height: what fits in the viewport below the panel's top edge. */
export function maxDockedHeight(top: number, viewportHeight: number): number {
  return Math.max(MIN_HEIGHT, viewportHeight - Math.max(0, top) - 16);
}
