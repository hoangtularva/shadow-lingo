import { basePhone, isVowelPhone, parseArpabet, type Phone } from './arpabet';
import { normalizeWord, type Pronunciations } from './dictionary';
import { ipaString, renderIpa, type IpaPart } from './render';
import { warningsFor, type PronunciationWarning } from './warnings';

/** A run of the sentence: a word (with IPA) or the text between words. */
export interface Token {
  /** Text as written, without surrounding punctuation for words. */
  text: string;
  isWord: boolean;
}

export type LinkKind = 'consonant' | 'j' | 'w';

export interface AnnotatedWord {
  /** Exact text as written, e.g. "don't". */
  text: string;
  /** Punctuation / spaces after the word, up to the next word. */
  after: string;
  /** Punctuation before the first word (only on index 0). */
  before: string;
  /** Lookup key (normalized). */
  key: string;
  phones: Phone[] | null;
  parts: IpaPart[];
  /** IPA string with stress marks; null when the word is not in the dictionary. */
  ipa: string | null;
  /** A function word read in its weak form, e.g. "to" → /tə/. */
  weak: boolean;
  /** How this word links to the next one in connected speech. */
  linkNext: LinkKind | null;
  /** The last phone (t/d) drops before the next consonant, e.g. "nex(t) day". */
  elided: boolean;
  warnings: PronunciationWarning[];
}

/** Word = letters/digits with inner apostrophes, hyphens or dots ("don't", "U.S."). */
const WORD_RE = /[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu;

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(WORD_RE)) {
    const i = m.index;
    if (i > last) out.push({ text: text.slice(last, i), isWord: false });
    out.push({ text: m[0], isWord: true });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), isWord: false });
  return out;
}

/** Character ranges of the words in a text, in the same order as `tokenize`'s words. */
export function wordSpans(text: string): { start: number; end: number }[] {
  return [...text.matchAll(WORD_RE)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
}

/** Unique dictionary keys in a text, for batching lookups. */
export function wordKeys(text: string): string[] {
  const keys = new Set<string>();
  for (const t of tokenize(text)) {
    if (!t.isWord) continue;
    const k = normalizeWord(t.text);
    if (k) keys.add(k);
    // Hyphenated words missing from the dictionary are read part by part.
    if (k.includes('-')) for (const part of k.split('-')) if (part) keys.add(part);
  }
  return [...keys];
}

interface WeakForm {
  weak: string;
  /** Form used before a vowel sound, if different. */
  beforeVowel?: string;
}

/**
 * Function words that are usually weak inside a phrase. Not applied at the end of a
 * clause ("Where are you from?"), where English keeps the strong form.
 */
const WEAK_FORMS: Record<string, WeakForm> = {
  a: { weak: 'AH0' },
  an: { weak: 'AH0 N' },
  the: { weak: 'DH AH0', beforeVowel: 'DH IY0' },
  and: { weak: 'AH0 N', beforeVowel: 'AH0 N D' },
  of: { weak: 'AH0 V' },
  to: { weak: 'T AH0', beforeVowel: 'T UW0' },
  for: { weak: 'F ER0' },
  from: { weak: 'F R AH0 M' },
  at: { weak: 'AH0 T' },
  as: { weak: 'AH0 Z' },
  but: { weak: 'B AH0 T' },
  or: { weak: 'ER0' },
  than: { weak: 'DH AH0 N' },
  them: { weak: 'DH AH0 M' },
  can: { weak: 'K AH0 N' },
  was: { weak: 'W AH0 Z' },
  were: { weak: 'W ER0' },
  are: { weak: 'ER0' },
  your: { weak: 'Y ER0' },
};

/** Ends a clause: weak forms and linking do not cross these. */
const CLAUSE_BREAK = /[.,;:!?…—–()"“”]/;

/** Vowels ending in a /j/ or /w/ glide, for vowel-to-vowel linking. */
const J_GLIDE = new Set(['IY', 'EY', 'AY', 'OY']);
const W_GLIDE = new Set(['UW', 'OW', 'AW']);
/** Consonants before which a final t/d is commonly dropped. */
const NO_ELISION_BEFORE = new Set(['HH', 'Y', 'W', 'R']);
/** A final t/d is dropped after these consonants ("las(t) night", "ol(d) man"). */
const ELISION_AFTER = new Set(['S', 'F', 'K', 'P', 'N', 'L', 'Z', 'CH', 'SH', 'TH', 'M']);

function startsWithVowel(phones: readonly Phone[] | null): boolean {
  const first = phones?.[0];
  return first !== undefined && isVowelPhone(first);
}

function firstConsonant(phones: readonly Phone[] | null): string | null {
  const first = phones?.[0];
  return first !== undefined && !isVowelPhone(first) ? basePhone(first) : null;
}

function firstPronunciation(
  key: string,
  lookup: (key: string) => Pronunciations | null | undefined,
): Phone[] | null {
  const direct = lookup(key)?.[0];
  if (direct) return reduceFinalY(direct);
  if (!key.includes('-')) return null;
  const out: Phone[] = [];
  for (const part of key.split('-')) {
    if (!part) continue;
    const p = lookup(part)?.[0];
    if (!p) return null;
    out.push(...p);
  }
  return out.length > 0 ? reduceFinalY(out) : null;
}

/**
 * CMU Dict often gives final "-y" secondary stress (company = ...N IY2). Learner
 * dictionaries treat it as unstressed /i/ when the word already has primary stress.
 */
function reduceFinalY(phones: readonly Phone[]): Phone[] {
  const out = [...phones];
  if (out.at(-1) === 'IY2' && out.some((p) => p.endsWith('1'))) out[out.length - 1] = 'IY0';
  return out;
}

/**
 * Annotates one sentence: IPA under each word, weak forms, linking, elision and
 * pronunciation warnings. `lookup` returns pronunciations by normalized key.
 */
export function annotateSentence(
  text: string,
  lookup: (key: string) => Pronunciations | null | undefined,
): AnnotatedWord[] {
  const tokens = tokenize(text);
  const words: AnnotatedWord[] = [];
  let before = '';
  for (const t of tokens) {
    if (!t.isWord) {
      const prev = words.at(-1);
      if (prev) prev.after += t.text;
      else before += t.text;
      continue;
    }
    const key = normalizeWord(t.text);
    words.push({
      text: t.text,
      after: '',
      before: words.length === 0 ? before : '',
      key,
      phones: firstPronunciation(key, lookup),
      parts: [],
      ipa: null,
      weak: false,
      linkNext: null,
      elided: false,
      warnings: [],
    });
  }

  // Weak forms first: they change the phones that linking and elision look at.
  words.forEach((w, i) => {
    const form = WEAK_FORMS[w.key];
    const next = words[i + 1];
    if (!form || !next || CLAUSE_BREAK.test(w.after)) return;
    const vowelNext = startsWithVowel(next.phones);
    w.phones = parseArpabet(vowelNext && form.beforeVowel ? form.beforeVowel : form.weak);
    w.weak = true;
  });

  words.forEach((w, i) => {
    const next = words[i + 1];
    const phones = w.phones;
    const last = phones?.at(-1);
    if (!next || !phones || !last || CLAUSE_BREAK.test(w.after)) return;
    if (startsWithVowel(next.phones)) {
      if (!isVowelPhone(last)) w.linkNext = 'consonant';
      else if (J_GLIDE.has(basePhone(last))) w.linkNext = 'j';
      else if (W_GLIDE.has(basePhone(last))) w.linkNext = 'w';
      return;
    }
    const nextC = firstConsonant(next.phones);
    const prev = phones.at(-2);
    if (
      !w.weak &&
      nextC &&
      !NO_ELISION_BEFORE.has(nextC) &&
      (basePhone(last) === 'T' || basePhone(last) === 'D') &&
      prev &&
      ELISION_AFTER.has(basePhone(prev))
    ) {
      w.elided = true;
    }
  });

  for (const w of words) {
    if (!w.phones) continue;
    w.parts = renderIpa(w.phones, { elideLast: w.elided });
    w.ipa = ipaString(w.parts);
    w.warnings = warningsFor(w.phones, { elidedLast: w.elided, weak: w.weak });
  }
  return words;
}
