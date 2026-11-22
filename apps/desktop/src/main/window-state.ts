import { readFileSync, writeFileSync } from 'node:fs';

/** Window size and place, restored on the next start (kept in the app's user data folder). */
export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

export const DEFAULT_WINDOW: WindowState = { width: 1280, height: 800, maximized: false };
const MIN = { width: 1024, height: 640 };

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Reads a saved state; anything odd falls back to the default size. */
export function parseWindowState(raw: unknown): WindowState {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_WINDOW };
  const r = raw as Record<string, unknown>;
  const width = isNum(r.width)
    ? Math.max(MIN.width, Math.min(r.width, 10000))
    : DEFAULT_WINDOW.width;
  const height = isNum(r.height)
    ? Math.max(MIN.height, Math.min(r.height, 10000))
    : DEFAULT_WINDOW.height;
  return {
    width,
    height,
    maximized: r.maximized === true,
    ...(isNum(r.x) && isNum(r.y) ? { x: r.x, y: r.y } : {}),
  };
}

/** Keeps a saved position only if it is still on one of the screens. */
export function onScreen(
  state: WindowState,
  screens: readonly { x: number; y: number; width: number; height: number }[],
): WindowState {
  if (state.x === undefined || state.y === undefined) return state;
  const { x, y } = state;
  const visible = screens.some(
    (s) => x + 100 > s.x && x < s.x + s.width - 100 && y >= s.y - 10 && y < s.y + s.height - 100,
  );
  if (visible) return state;
  return { width: state.width, height: state.height, maximized: state.maximized };
}

export function loadWindowState(file: string): WindowState {
  try {
    return parseWindowState(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return { ...DEFAULT_WINDOW };
  }
}

export function saveWindowState(file: string, state: WindowState): void {
  try {
    writeFileSync(file, JSON.stringify(state));
  } catch {
    // Not critical: the next start uses the default size.
  }
}
