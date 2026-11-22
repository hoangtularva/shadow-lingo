import { basePhone, parseArpabet, type Phone } from './arpabet';

/** Letter names, for acronyms read letter by letter (NBA, MLS, GPT). */
const LETTERS: Record<string, string> = {
  a: 'EY1',
  b: 'B IY1',
  c: 'S IY1',
  d: 'D IY1',
  e: 'IY1',
  f: 'EH1 F',
  g: 'JH IY1',
  h: 'EY1 CH',
  i: 'AY1',
  j: 'JH EY1',
  k: 'K EY1',
  l: 'EH1 L',
  m: 'EH1 M',
  n: 'EH1 N',
  o: 'OW1',
  p: 'P IY1',
  q: 'K Y UW1',
  r: 'AA1 R',
  s: 'EH1 S',
  t: 'T IY1',
  u: 'Y UW1',
  v: 'V IY1',
  w: 'D AH1 B AH0 L Y UW0',
  x: 'EH1 K S',
  y: 'W AY1',
  z: 'Z IY1',
};

/**
 * An all-capitals word the dictionary does not know, read letter by letter with the
 * main stress on the last letter: MLS → /ˌem el ˈes/. "APIs" adds /z/.
 */
export function spellAcronym(token: string): Phone[] | null {
  const m = /^([A-Z]{2,6})(s?)$/.exec(token);
  if (!m?.[1]) return null;
  const letters = [...m[1].toLowerCase()];
  const phones: Phone[] = [];
  letters.forEach((ch, i) => {
    const p = parseArpabet(LETTERS[ch] ?? '');
    const last = i === letters.length - 1;
    phones.push(...(last ? p : p.map((x) => x.replace('1', '2') as Phone)));
  });
  if (m[2]) phones.push('Z');
  return phones;
}

const SIBILANTS = new Set(['S', 'Z', 'SH', 'ZH', 'CH', 'JH']);
const VOICELESS = new Set(['P', 'T', 'K', 'F', 'TH', 'S', 'SH', 'CH']);

function lastBase(phones: readonly Phone[]): string {
  const p = phones.at(-1);
  return p ? basePhone(p) : '';
}

/** Adds the English -s ending with the right allomorph (/s/, /z/ or /ɪz/). */
export function addSuffixS(phones: readonly Phone[]): Phone[] {
  const b = lastBase(phones);
  if (SIBILANTS.has(b)) return [...phones, 'IH0', 'Z'];
  if (VOICELESS.has(b)) return [...phones, 'S'];
  return [...phones, 'Z'];
}

function plusEd(phones: readonly Phone[]): Phone[] {
  const b = lastBase(phones);
  if (b === 'T' || b === 'D') return [...phones, 'IH0', 'D'];
  if (VOICELESS.has(b)) return [...phones, 'T'];
  return [...phones, 'D'];
}

const plus =
  (tail: string) =>
  (phones: readonly Phone[]): Phone[] => [...phones, ...parseArpabet(tail)];

interface Rule {
  suffix: string;
  /** The y→i spelling of this suffix (tried, happier, easily). */
  yForm: string | null;
  /** The stem may have lost a final "e" (vibing, googled, nicer). */
  eDrop?: boolean;
  apply(phones: readonly Phone[]): Phone[];
}

/** Spellings of the stem left after removing a suffix: walk(ed), vib(e)d, stop(p)ed, tr(y)→ied. */
function stems(word: string, rule: Rule): string[] {
  const { suffix, yForm } = rule;
  const s = word.slice(0, -suffix.length);
  const out = rule.eDrop ? [s, `${s}e`] : [s];
  if (s.length >= 3 && s.at(-1) === s.at(-2)) out.push(s.slice(0, -1));
  if (yForm && word.endsWith(yForm)) out.push(`${word.slice(0, -yForm.length)}y`);
  return out;
}

const SUFFIXES: Rule[] = [
  { suffix: 'ing', yForm: null, eDrop: true, apply: plus('IH0 NG') },
  { suffix: 'ed', yForm: 'ied', eDrop: true, apply: plusEd },
  { suffix: 'es', yForm: 'ies', apply: addSuffixS },
  { suffix: 's', yForm: null, apply: addSuffixS },
  { suffix: 'er', yForm: 'ier', eDrop: true, apply: plus('ER0') },
  { suffix: 'ers', yForm: 'iers', eDrop: true, apply: plus('ER0 Z') },
  { suffix: 'est', yForm: 'iest', eDrop: true, apply: plus('IH0 S T') },
  { suffix: 'ly', yForm: 'ily', apply: plus('L IY0') },
  { suffix: 'ness', yForm: 'iness', apply: plus('N AH0 S') },
  { suffix: 'less', yForm: 'iless', apply: plus('L AH0 S') },
  { suffix: 'ful', yForm: 'iful', apply: plus('F AH0 L') },
  { suffix: 'ment', yForm: null, apply: plus('M AH0 N T') },
];

const CONTRACTIONS: Record<string, string> = { ll: 'L', re: 'ER0', ve: 'V', d: 'D', m: 'M' };

const PREFIXES: [string, string][] = [
  ['un', 'AH0 N'],
  ['re', 'R IY0'],
  ['non', 'N AA1 N'],
];

const MIN_STEM = 3;

/**
 * Pronunciation of a word missing from the dictionary, built from a word it has:
 * suffixes (vibing, googled, TikToks, easier), contractions (you'll) and un- / re-.
 * `get` returns the first pronunciation of a dictionary word, or null.
 */
export function deriveFromKnown(
  word: string,
  get: (key: string) => Phone[] | null,
  depth = 0,
): Phone[] | null {
  if (depth > 1 || word.length < MIN_STEM + 1) return null;
  const known = (k: string) =>
    k.length >= MIN_STEM
      ? (get(k) ?? (depth === 0 ? deriveFromKnown(k, get, depth + 1) : null))
      : null;

  const c = /^(.+)'(ll|re|ve|d|m)$/.exec(word);
  if (c?.[1] && c[2]) {
    const base = get(c[1]);
    if (base) return [...base, ...parseArpabet(CONTRACTIONS[c[2]] ?? '')];
  }
  for (const rule of SUFFIXES) {
    if (!word.endsWith(rule.suffix) || word.length - rule.suffix.length < MIN_STEM) continue;
    for (const stem of stems(word, rule)) {
      const base = known(stem);
      if (base) return rule.apply(base);
    }
  }
  for (const [prefix, phones] of PREFIXES) {
    if (!word.startsWith(prefix)) continue;
    const base = known(word.slice(prefix.length));
    if (base) return [...parseArpabet(phones), ...base];
  }
  return null;
}
