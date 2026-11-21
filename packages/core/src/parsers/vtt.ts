import type { Cue } from '../types';
import { parseTimedBlocks } from './srt';

export function isVtt(input: string): boolean {
  return /^\uFEFF?WEBVTT/.test(input);
}

/**
 * Parses WebVTT. NOTE/STYLE/REGION blocks have no timing line and are skipped.
 * Auto-generated VTT repeats the previous line in "rolling" cues; those repeats are removed.
 */
export function parseVtt(input: string): Cue[] {
  const cues = parseTimedBlocks(input.replace(/^\uFEFF/, ''));
  const out: Cue[] = [];
  for (const cue of cues) {
    const prev = out[out.length - 1];
    if (prev && cue.text === prev.text) {
      prev.end = Math.max(prev.end, cue.end);
      continue;
    }
    if (prev && cue.text.startsWith(prev.text + ' ')) {
      out.push({ ...cue, text: cue.text.slice(prev.text.length + 1) });
      continue;
    }
    out.push({ ...cue });
  }
  return out;
}
