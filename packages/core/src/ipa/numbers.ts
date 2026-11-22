import { parseArpabet, type Phone } from './arpabet';

/** CMU-style pronunciations of the words numbers are read with. */
const WORDS: Record<string, string> = {
  zero: 'Z IH1 R OW0',
  oh: 'OW1',
  one: 'W AH1 N',
  two: 'T UW1',
  three: 'TH R IY1',
  four: 'F AO1 R',
  five: 'F AY1 V',
  six: 'S IH1 K S',
  seven: 'S EH1 V AH0 N',
  eight: 'EY1 T',
  nine: 'N AY1 N',
  ten: 'T EH1 N',
  eleven: 'IH0 L EH1 V AH0 N',
  twelve: 'T W EH1 L V',
  thirteen: 'TH ER0 T IY1 N',
  fourteen: 'F AO0 R T IY1 N',
  fifteen: 'F IH0 F T IY1 N',
  sixteen: 'S IH0 K S T IY1 N',
  seventeen: 'S EH2 V AH0 N T IY1 N',
  eighteen: 'EY0 T IY1 N',
  nineteen: 'N AY0 N T IY1 N',
  twenty: 'T W EH1 N T IY0',
  thirty: 'TH ER1 T IY0',
  forty: 'F AO1 R T IY0',
  fifty: 'F IH1 F T IY0',
  sixty: 'S IH1 K S T IY0',
  seventy: 'S EH1 V AH0 N T IY0',
  eighty: 'EY1 T IY0',
  ninety: 'N AY1 N T IY0',
  hundred: 'HH AH1 N D R AH0 D',
  thousand: 'TH AW1 Z AH0 N D',
  million: 'M IH1 L Y AH0 N',
  billion: 'B IH1 L Y AH0 N',
  point: 'P OY1 N T',
};

/** Ordinals that are not just "+th". */
const ORDINALS: Record<string, string> = {
  one: 'F ER1 S T',
  two: 'S EH1 K AH0 N D',
  three: 'TH ER1 D',
  five: 'F IH1 F TH',
  eight: 'EY1 T TH',
  nine: 'N AY1 N TH',
  twelve: 'T W EH1 L F TH',
};

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
] as const;
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES: [number, string][] = [
  [1e9, 'billion'],
  [1e6, 'million'],
  [1e3, 'thousand'],
];

function below100(n: number): string[] {
  if (n < 20) return [ONES[n] ?? 'zero'];
  const tens = TENS[Math.floor(n / 10)] ?? '';
  return n % 10 === 0 ? [tens] : [tens, ONES[n % 10] ?? 'zero'];
}

function below1000(n: number): string[] {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const out = h > 0 ? [ONES[h] ?? 'zero', 'hundred'] : [];
  return rest > 0 || h === 0 ? [...out, ...below100(rest)] : out;
}

/** American cardinal: 2026 → two thousand twenty-six (no "and"). */
export function cardinalWords(n: number): string[] {
  if (n === 0) return ['zero'];
  const out: string[] = [];
  let rest = n;
  for (const [size, name] of SCALES) {
    if (rest >= size) {
      out.push(...below1000(Math.floor(rest / size)), name);
      rest %= size;
    }
  }
  if (rest > 0) out.push(...below1000(rest));
  return out;
}

/** How a 4-digit number is read as a year: 1995 → nineteen ninety-five, 2005 → two thousand five. */
export function yearWords(n: number): string[] {
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  if (n >= 2000 && n < 2010) return cardinalWords(n);
  if (lo === 0) return [...below100(hi), 'hundred'];
  return [...below100(hi), ...(lo < 10 ? ['oh', ONES[lo] ?? 'zero'] : below100(lo))];
}

function ordinalPhones(word: string): string {
  const special = ORDINALS[word];
  if (special) return special;
  const base = WORDS[word] ?? '';
  // twenty → twentieth: final /i/ + /əθ/.
  if (word.endsWith('ty')) return `${base} AH0 TH`;
  return `${base} TH`;
}

const MAX_DIGITS = 12;

/**
 * Phones for a number token as it is usually read aloud: "2026", "1.5", "3rd", "90s".
 * Returns null for anything else.
 */
export function numberPhones(token: string): Phone[] | null {
  const t = token.replace(/,/g, '');
  let words: string[] | null = null;
  let ordinal = false;
  let plural = false;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{1,12})(st|nd|rd|th)$/i.exec(t))) {
    words = cardinalWords(Number(m[1]));
    ordinal = true;
  } else if ((m = /^(\d{2,4})'?s$/i.exec(t))) {
    // "90s", "1990s": decades.
    const n = Number(m[1]);
    words = m[1]?.length === 4 ? yearWords(n) : cardinalWords(n);
    plural = true;
  } else if ((m = /^(\d{1,12})\.(\d{1,6})$/.exec(t))) {
    const decimals = [...(m[2] ?? '')].map((d) => ONES[Number(d)] ?? 'zero');
    words = [...cardinalWords(Number(m[1])), 'point', ...decimals];
  } else if (/^\d{1,12}$/.test(t)) {
    const n = Number(t);
    // 4 digits from 1100 to 2099 read like years (also fine for quantities: fifteen hundred).
    const isYear = t.length === 4 && n >= 1100 && n < 2100;
    words = isYear ? yearWords(n) : cardinalWords(n);
  }
  if (!words || words.length === 0 || t.replace(/\D/g, '').length > MAX_DIGITS) return null;
  const last = words.length - 1;
  const parts = words.map((w, i) => {
    if (i === last && ordinal) return ordinalPhones(w);
    // nineties, nineteen-hundreds: + /z/.
    if (i === last && plural) return `${WORDS[w] ?? ''} Z`;
    return WORDS[w] ?? '';
  });
  return parseArpabet(parts.join(' '));
}
