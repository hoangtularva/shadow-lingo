import type { Cue } from '../types';
import { cleanText, parseTimestamp } from './text-utils';

export interface ParsedText {
  cues: Cue[];
  /** False when no timestamps were found; cue times are then just their order. */
  timed: boolean;
}

const LEADING_TIME = /^\s*\[?(\d{1,2}(?::\d{2}){1,2}(?:[.,]\d{1,3})?)\]?\s*[-–—:]?\s*(.*)$/;

/**
 * Parses a transcript pasted by the user. Supports the copied "Show transcript" layout
 * (timestamp line, then text line), "0:05 text" lines, and plain text without timestamps.
 */
export function parsePastedText(input: string): ParsedText {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const timedCues: { start: number; parts: string[] }[] = [];
  const looseParts: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const m = LEADING_TIME.exec(line);
    const time = m ? parseTimestamp(m[1] ?? '') : NaN;
    if (m && !Number.isNaN(time)) {
      timedCues.push({ start: time, parts: m[2] ? [m[2]] : [] });
      continue;
    }
    const current = timedCues[timedCues.length - 1];
    if (current) current.parts.push(line);
    else looseParts.push(line);
  }

  if (timedCues.length === 0) {
    const cues = looseParts
      .map((l) => cleanText(l))
      .filter(Boolean)
      .map((text, i) => ({ start: i, end: i, text }));
    return { cues, timed: false };
  }

  const sorted = timedCues
    .map((c) => ({ start: c.start, text: cleanText(c.parts.join(' ')) }))
    .filter((c) => c.text)
    .sort((a, b) => a.start - b.start);
  const cues = sorted.map((c, i) => {
    const next = sorted[i + 1];
    // Last cue has no known end; assume a few seconds.
    const end = next ? Math.max(c.start, next.start) : c.start + 4000;
    return { start: c.start, end, text: c.text };
  });
  return { cues, timed: true };
}
