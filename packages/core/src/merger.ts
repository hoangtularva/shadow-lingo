import { sentenceHash } from './hash';
import type { Cue, Sentence } from './types';

export interface MergeOptions {
  /** Gap (ms) that ends a sentence in unpunctuated (auto-generated) captions. */
  pauseMs?: number;
  /** Hard cap on words per sentence so unpunctuated tracks stay readable. */
  maxWords?: number;
}

interface Word {
  text: string;
  start: number;
  end: number;
  /** A speaker change (">>" or a leading "- ") happens right before this word. */
  speakerBreak: boolean;
}

const ABBREVIATIONS = new Set([
  'mr.',
  'mrs.',
  'ms.',
  'dr.',
  'prof.',
  'st.',
  'jr.',
  'sr.',
  'vs.',
  'etc.',
  'e.g.',
  'i.e.',
  'no.',
  'mt.',
  'approx.',
]);

const TERMINATOR = /[.!?…]["'”’)\]]*$/;

/** Splits cues into words, spreading each cue's time span across its characters. */
function toWords(cues: Cue[]): Word[] {
  const words: Word[] = [];
  for (const cue of cues) {
    const tokens = cue.text.split(' ').filter(Boolean);
    const totalChars = tokens.reduce((n, t) => n + t.length + 1, 0) || 1;
    const span = Math.max(0, cue.end - cue.start);
    let offset = 0;
    let speakerBreak = false;
    tokens.forEach((token, i) => {
      const startFrac = offset / totalChars;
      offset += token.length + 1;
      const endFrac = offset / totalChars;
      if (token === '>>' || (token === '-' && i === 0)) {
        speakerBreak = true;
        return;
      }
      words.push({
        text: token,
        start: Math.round(cue.start + span * startFrac),
        end: Math.round(cue.start + span * endFrac),
        speakerBreak,
      });
      speakerBreak = false;
    });
  }
  return words;
}

function endsSentence(word: string, isLast: boolean): boolean {
  if (!TERMINATOR.test(word)) return false;
  const lower = word.toLowerCase().replace(/["'”’)\]]+$/, '');
  if (ABBREVIATIONS.has(lower)) return false;
  if (!isLast && /^([a-z]\.){2,}$/i.test(lower)) return false;
  return true;
}

/** True when the cues carry real punctuation (human captions or punctuated ASR). */
export function isPunctuated(cues: Cue[]): boolean {
  let words = 0;
  let marks = 0;
  for (const cue of cues) {
    for (const w of cue.text.split(' ')) {
      if (!w) continue;
      words++;
      if (TERMINATOR.test(w)) marks++;
    }
  }
  return words > 0 && marks / words >= 1 / 40;
}

/**
 * Merges caption cues into full sentences. Cues often cut sentences mid-way, so the text is
 * re-split on sentence punctuation; for unpunctuated tracks, long pauses and a word cap are used.
 */
export function mergeSentences(cues: Cue[], options: MergeOptions = {}): Sentence[] {
  const punctuated = isPunctuated(cues);
  const pauseMs = options.pauseMs ?? 1500;
  const maxWords = options.maxWords ?? (punctuated ? 60 : 22);
  const words = toWords([...cues].sort((a, b) => a.start - b.start));

  const sentences: Sentence[] = [];
  let current: Word[] = [];

  const flush = (): void => {
    const first = current[0];
    const last = current[current.length - 1];
    if (!first || !last) return;
    const text = current.map((w) => w.text).join(' ');
    const hash = sentenceHash(text);
    sentences.push({
      id: `${sentences.length}-${hash}`,
      hash,
      start: first.start,
      end: Math.max(first.start, last.end),
      text,
    });
    current = [];
  };

  words.forEach((word, i) => {
    if (word.speakerBreak) flush();
    current.push(word);
    const next = words[i + 1];
    if (!next) return;
    if (endsSentence(word.text, false)) return flush();
    if (!punctuated && next.start - word.end >= pauseMs) return flush();
    if (current.length >= maxWords) flush();
  });
  flush();
  return sentences;
}
