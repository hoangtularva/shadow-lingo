export interface Timed {
  start: number;
  end: number;
}

/**
 * Returns the index of the sentence to highlight at `timeMs`: the last sentence that has
 * started. A sentence stays active through the gap until the next one starts, so the
 * highlight does not flicker. Returns -1 before the first sentence.
 */
export function findActiveIndex(items: readonly Timed[], timeMs: number): number {
  let lo = 0;
  let hi = items.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const item = items[mid];
    if (!item) break;
    if (item.start <= timeMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Progress (0..1) of `timeMs` inside an item, clamped. */
export function progressWithin(item: Timed, timeMs: number): number {
  const span = item.end - item.start;
  if (span <= 0) return timeMs >= item.start ? 1 : 0;
  return Math.min(1, Math.max(0, (timeMs - item.start) / span));
}
