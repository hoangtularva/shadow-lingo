import type { Cue } from '../types';
import { cleanText, parseTimestamp } from './text-utils';

const TIME_LINE = /^\s*(\S+)\s*-->\s*(\S+)/;

/** Parses cue blocks shared by SRT and WebVTT: a timing line followed by text lines. */
export function parseTimedBlocks(input: string): Cue[] {
  const blocks = input.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const timeIdx = lines.findIndex((l) => TIME_LINE.test(l));
    if (timeIdx < 0) continue;
    const m = TIME_LINE.exec(lines[timeIdx] ?? '');
    if (!m) continue;
    const start = parseTimestamp(m[1] ?? '');
    const end = parseTimestamp(m[2] ?? '');
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    const text = cleanText(lines.slice(timeIdx + 1).join('\n'));
    if (text) cues.push({ start, end: Math.max(start, end), text });
  }
  return cues.sort((a, b) => a.start - b.start);
}

export function isSrt(input: string): boolean {
  return /^\uFEFF?\s*\d+\s*\r?\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/.test(input);
}

export function parseSrt(input: string): Cue[] {
  return parseTimedBlocks(input.replace(/^\uFEFF/, ''));
}
