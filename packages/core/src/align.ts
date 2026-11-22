import type { Translation } from './adapters';
import { sentenceHash } from './hash';
import { cleanText } from './parsers';
import type { Cue, Sentence } from './types';

/** A cue that overlaps no sentence may still belong to the nearest one within this gap. */
const MAX_GAP_MS = 1000;

function overlap(a: { start: number; end: number }, b: { start: number; end: number }): number {
  return Math.min(a.end, b.end) - Math.max(a.start, b.start);
}

function gap(a: { start: number; end: number }, b: { start: number; end: number }): number {
  return Math.max(a.start - b.end, b.start - a.end, 0);
}

/** Index of the sentence a cue belongs to: most time shared, else the nearest close one. */
function sentenceFor(cue: Cue, sentences: readonly Sentence[], from: number): number {
  let best = -1;
  let bestOverlap = 0;
  let nearest = -1;
  let nearestGap = MAX_GAP_MS;
  // Sentences are in time order: start a little before the last match and stop once past the cue.
  for (let i = Math.max(0, from - 2); i < sentences.length; i++) {
    const s = sentences[i];
    if (!s) continue;
    if (s.start > cue.end + MAX_GAP_MS) break;
    const o = overlap(cue, s);
    if (o > bestOverlap) {
      bestOverlap = o;
      best = i;
    }
    const g = gap(cue, s);
    if (g < nearestGap || (g === nearestGap && nearest === -1)) {
      nearestGap = g;
      nearest = i;
    }
  }
  return best >= 0 ? best : nearest;
}

/**
 * Lines of a human Vietnamese caption track, attached to the English sentences by time:
 * each cue goes to the sentence it shares the most time with, and a sentence's cues are
 * joined in order. Sentences without a cue get nothing (machine translation fills them).
 */
export function alignTranslation(
  sentences: readonly Sentence[],
  cues: readonly Cue[],
): Record<string, Translation> {
  const parts = new Map<number, string[]>();
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  let from = 0;
  for (const cue of sorted) {
    const text = cleanText(cue.text);
    if (!text) continue;
    const i = sentenceFor(cue, sentences, from);
    if (i < 0) continue;
    from = i;
    const list = parts.get(i) ?? [];
    list.push(text);
    parts.set(i, list);
  }
  const out: Record<string, Translation> = {};
  for (const [i, list] of [...parts.entries()].sort((a, b) => a[0] - b[0])) {
    const s = sentences[i];
    if (!s) continue;
    const hash = sentenceHash(s.text);
    // The same English sentence said twice keeps the first line.
    if (hash in out) continue;
    out[hash] = { vi: list.join(' ').replace(/\s+/g, ' ').trim(), source: 'human' };
  }
  return out;
}
