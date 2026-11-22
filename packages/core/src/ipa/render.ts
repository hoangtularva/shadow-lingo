import { basePhone, isVowelPhone, phoneToIpa, stressOf, type Phone } from './arpabet';

/** One printable piece of a word's IPA. `index` points into the word's phones. */
export type IpaPart =
  | { kind: 'stress'; text: 'ˈ' | 'ˌ' }
  | { kind: 'phone'; text: string; index: number; elided?: boolean };

/** Consonant clusters that can start an English syllable (maximal onset principle). */
const ONSETS = new Set([
  // two consonants
  'P L',
  'P R',
  'B L',
  'B R',
  'K L',
  'K R',
  'G L',
  'G R',
  'F L',
  'F R',
  'T R',
  'D R',
  'TH R',
  'SH R',
  'T W',
  'D W',
  'K W',
  'G W',
  'S W',
  'TH W',
  'S P',
  'S T',
  'S K',
  'S M',
  'S N',
  'S L',
  'S F',
  'P Y',
  'B Y',
  'F Y',
  'V Y',
  'K Y',
  'G Y',
  'M Y',
  'HH Y',
  // three consonants
  'S P L',
  'S P R',
  'S T R',
  'S K R',
  'S K W',
  'S K L',
  'S P Y',
  'S K Y',
]);

function isLegalOnset(cluster: readonly Phone[]): boolean {
  if (cluster.length === 0) return true;
  if (cluster.length === 1) return basePhone(cluster[0] as Phone) !== 'NG';
  return ONSETS.has(cluster.map(basePhone).join(' '));
}

/** Index where the syllable of the vowel at `v` starts, given the previous vowel. */
function onsetStart(phones: readonly Phone[], prevVowel: number, v: number): number {
  for (let start = prevVowel + 1; start < v; start++) {
    if (isLegalOnset(phones.slice(start, v))) return start;
  }
  return v;
}

export interface RenderOptions {
  /** Mark the last phone as elided (shown in brackets), e.g. "nex(t) day". */
  elideLast?: boolean;
}

/**
 * Renders phones as IPA parts with stress marks before stressed syllables.
 * One-syllable words get no stress mark, as in learner dictionaries.
 */
export function renderIpa(phones: readonly Phone[], options: RenderOptions = {}): IpaPart[] {
  const vowels: number[] = [];
  phones.forEach((p, i) => {
    if (isVowelPhone(p)) vowels.push(i);
  });
  const marks = new Map<number, 'ˈ' | 'ˌ'>();
  if (vowels.length > 1) {
    vowels.forEach((v, k) => {
      const s = stressOf(phones[v] as Phone);
      if (s !== 1 && s !== 2) return;
      const start = k === 0 ? 0 : onsetStart(phones, vowels[k - 1] as number, v);
      marks.set(start, s === 1 ? 'ˈ' : 'ˌ');
    });
  }
  const parts: IpaPart[] = [];
  phones.forEach((p, i) => {
    const mark = marks.get(i);
    if (mark) parts.push({ kind: 'stress', text: mark });
    const elided = options.elideLast === true && i === phones.length - 1;
    parts.push(
      elided
        ? { kind: 'phone', text: phoneToIpa(p), index: i, elided: true }
        : { kind: 'phone', text: phoneToIpa(p), index: i },
    );
  });
  return parts;
}

/** Plain IPA string; elided phones appear in brackets. */
export function ipaString(parts: readonly IpaPart[]): string {
  return parts.map((p) => (p.kind === 'phone' && p.elided ? `(${p.text})` : p.text)).join('');
}

/** Convenience: phones → IPA string. */
export function toIpa(phones: readonly Phone[], options: RenderOptions = {}): string {
  return ipaString(renderIpa(phones, options));
}
