import type { Cue } from '../types';
import { cleanText } from './text-utils';

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** True when the value looks like a YouTube json3 caption document. */
export function isJson3(value: unknown): value is { events: unknown[] } {
  return isRecord(value) && Array.isArray(value.events);
}

/**
 * Parses YouTube's json3 caption format. Auto-generated tracks split words into segments
 * with offsets; each such segment becomes its own cue so the merger can split precisely.
 */
export function parseJson3(input: unknown): Cue[] {
  const doc: unknown = typeof input === 'string' ? JSON.parse(input) : input;
  if (!isJson3(doc)) throw new Error('Not a json3 caption document');

  const cues: Cue[] = [];
  for (const ev of doc.events) {
    if (!isRecord(ev) || !Array.isArray(ev.segs)) continue;
    const start = num(ev.tStartMs, NaN);
    if (Number.isNaN(start)) continue;
    const end = start + Math.max(0, num(ev.dDurationMs, 0));
    const segs = ev.segs.filter(isRecord);

    const hasOffsets = segs.length > 1 && segs.some((s) => typeof s.tOffsetMs === 'number');
    if (!hasOffsets) {
      const text = cleanText(segs.map((s) => str(s.utf8)).join(''));
      if (text) cues.push({ start, end, text });
      continue;
    }
    segs.forEach((seg, i) => {
      const text = cleanText(str(seg.utf8));
      if (!text) return;
      const segStart = start + num(seg.tOffsetMs, 0);
      const next = segs[i + 1];
      const segEnd = next ? start + num(next.tOffsetMs, end - start) : end;
      cues.push({ start: segStart, end: Math.max(segStart, segEnd), text });
    });
  }
  return cues.sort((a, b) => a.start - b.start);
}
