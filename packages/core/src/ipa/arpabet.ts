/**
 * ARPAbet (CMU Dict) phones and their IPA, in the General American style that
 * learner dictionaries use (e.g. /e/ for EH, length marks on tense vowels).
 */

export const VOWELS = [
  'AA',
  'AE',
  'AH',
  'AO',
  'AW',
  'AY',
  'EH',
  'ER',
  'EY',
  'IH',
  'IY',
  'OW',
  'OY',
  'UH',
  'UW',
] as const;

export const CONSONANTS = [
  'B',
  'CH',
  'D',
  'DH',
  'F',
  'G',
  'HH',
  'JH',
  'K',
  'L',
  'M',
  'N',
  'NG',
  'P',
  'R',
  'S',
  'SH',
  'T',
  'TH',
  'V',
  'W',
  'Y',
  'Z',
  'ZH',
] as const;

export type Vowel = (typeof VOWELS)[number];
export type Consonant = (typeof CONSONANTS)[number];
export type Stress = 0 | 1 | 2;

/** A phone with stress digit for vowels, e.g. "AH0", "T". */
export type Phone = `${Vowel}${Stress}` | Consonant;

/** Every phone in a fixed order. The data file stores phone i as PHONE_CODES[i]. */
export const PHONES: readonly Phone[] = [
  ...VOWELS.flatMap((v) => [`${v}0`, `${v}1`, `${v}2`] as const),
  ...CONSONANTS,
];

/** One printable ASCII char per phone, skipping "#" (comments) and "|" (separator). */
export const PHONE_CODES: readonly string[] = (() => {
  const out: string[] = [];
  for (let c = 0x21; c <= 0x7e && out.length < PHONES.length; c++) {
    if (c !== 0x23 && c !== 0x7c) out.push(String.fromCharCode(c));
  }
  return out;
})();

const PHONE_SET = new Set<string>(PHONES);
const DECODE = new Map<string, Phone>(PHONES.map((p, i) => [PHONE_CODES[i] ?? '', p]));

export function isPhone(s: string): s is Phone {
  return PHONE_SET.has(s);
}

export function isVowelPhone(p: Phone): boolean {
  return /\d$/.test(p);
}

/** Base phone without the stress digit. */
export function basePhone(p: Phone): Vowel | Consonant {
  return p.replace(/\d$/, '') as Vowel | Consonant;
}

export function stressOf(p: Phone): Stress | null {
  const d = p.at(-1);
  return d === '0' || d === '1' || d === '2' ? (Number(d) as Stress) : null;
}

/** Decodes one data-file pronunciation into phones. Unknown chars throw. */
export function decodePronunciation(encoded: string): Phone[] {
  const out: Phone[] = [];
  for (const ch of encoded) {
    const p = DECODE.get(ch);
    if (!p) throw new Error(`unknown phone code ${JSON.stringify(ch)}`);
    out.push(p);
  }
  return out;
}

export function encodePronunciation(phones: readonly Phone[]): string {
  return phones.map((p) => PHONE_CODES[PHONES.indexOf(p)] ?? '').join('');
}

/** Parses "DH AH0" style strings (tests, hand-written tables). */
export function parseArpabet(text: string): Phone[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      const up = t.toUpperCase();
      if (!isPhone(up)) throw new Error(`not an ARPAbet phone: ${t}`);
      return up;
    });
}

const CONSONANT_IPA: Record<Consonant, string> = {
  B: 'b',
  CH: 'tʃ',
  D: 'd',
  DH: 'ð',
  F: 'f',
  G: 'ɡ',
  HH: 'h',
  JH: 'dʒ',
  K: 'k',
  L: 'l',
  M: 'm',
  N: 'n',
  NG: 'ŋ',
  P: 'p',
  R: 'r',
  S: 's',
  SH: 'ʃ',
  T: 't',
  TH: 'θ',
  V: 'v',
  W: 'w',
  Y: 'j',
  Z: 'z',
  ZH: 'ʒ',
};

const VOWEL_IPA: Record<Vowel, string> = {
  AA: 'ɑː',
  AE: 'æ',
  AH: 'ʌ',
  AO: 'ɔː',
  AW: 'aʊ',
  AY: 'aɪ',
  EH: 'e',
  ER: 'ɝː',
  EY: 'eɪ',
  IH: 'ɪ',
  IY: 'iː',
  OW: 'oʊ',
  OY: 'ɔɪ',
  UH: 'ʊ',
  UW: 'uː',
};

/** Unstressed variants: schwa, r-coloured schwa, happY /i/, short /u/. */
const UNSTRESSED_IPA: Partial<Record<Vowel, string>> = {
  AH: 'ə',
  ER: 'ɚ',
  IY: 'i',
  UW: 'u',
};

export function phoneToIpa(p: Phone): string {
  const base = basePhone(p);
  if (!isVowelPhone(p)) return CONSONANT_IPA[base as Consonant];
  const v = base as Vowel;
  if (stressOf(p) === 0) return UNSTRESSED_IPA[v] ?? VOWEL_IPA[v];
  return VOWEL_IPA[v];
}
