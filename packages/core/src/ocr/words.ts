import { normalizeWord } from '../ipa/dictionary';

/** Below this share of real words, a reading is picture detail, not a subtitle. */
export const MIN_REAL_WORDS = 0.6;

const WORD = /[A-Za-z][A-Za-z'’-]*/g;
/** A one- or two-letter token standing alone (not part of "I'm" or "don't"). */
const SCRAP = /(?<![A-Za-z'’-])[A-Za-z]{1,2}(?![A-Za-z'’-])/g;

/** Dictionary keys of the words in an OCR reading. */
export function ocrWordKeys(text: string): string[] {
  return [...new Set((text.match(WORD) ?? []).map(normalizeWord).filter(Boolean))];
}

/**
 * Keeps an OCR reading only if it is mostly real words (`isWord` knows the dictionary), and
 * drops one- or two-letter scraps that are not words ("Qn"). Returns '' for picture noise.
 */
export function keepRealWords(text: string, isWord: (key: string) => boolean): string {
  const words = text.match(WORD) ?? [];
  if (words.length === 0) return '';
  const real = words.filter((w) => isWord(normalizeWord(w))).length;
  if (real / words.length < MIN_REAL_WORDS) return '';
  return text
    .replace(SCRAP, (w) => (isWord(normalizeWord(w)) ? w : ''))
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();
}
