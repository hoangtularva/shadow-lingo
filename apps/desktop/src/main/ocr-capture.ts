/**
 * "Đọc chữ trên hình" on the desktop: the app page asks for the subtitle band of its player,
 * and the main process takes that part of the window's picture (in memory only; nothing is
 * saved). The page reads the text from it on the device.
 */

/** Pictures are scaled down to this width (subtitles stay legible, the picture stays small). */
export const CAPTURE_MAX_WIDTH = 960;

/** The width the page asked for, within 32..CAPTURE_MAX_WIDTH (the most when not a number). */
export function captureWidth(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return CAPTURE_MAX_WIDTH;
  return Math.max(32, Math.min(CAPTURE_MAX_WIDTH, Math.round(v)));
}

export interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Checks a rectangle asked for by the page: finite numbers, inside the window's content
 * (`bounds`), and not tiny. Returns it rounded to whole pixels, or null.
 */
export function parseCaptureRect(
  v: unknown,
  bounds: { width: number; height: number },
): CaptureRect | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  const nums = [r.x, r.y, r.width, r.height];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const x = Math.max(0, Math.floor(r.x as number));
  const y = Math.max(0, Math.floor(r.y as number));
  const right = Math.min(bounds.width, Math.ceil((r.x as number) + (r.width as number)));
  const bottom = Math.min(bounds.height, Math.ceil((r.y as number) + (r.height as number)));
  const width = right - x;
  const height = bottom - y;
  if (width < 32 || height < 8) return null;
  return { x, y, width, height };
}
