import { basePhone, decodePronunciation, type Phone } from './arpabet';

/** All pronunciations of a word, most common first. */
export type Pronunciations = Phone[][];

/** Word → encoded pronunciations ("|"-separated), decoded on lookup to save memory. */
export interface PronunciationDict {
  readonly size: number;
  lookup(word: string): Pronunciations | null;
}

/** Lowercases, unifies apostrophes and strips surrounding punctuation (keeps ' and .). */
export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/^[^a-z0-9']+/, '')
    .replace(/[^a-z0-9'.]+$/, '');
}

/** Spellings to try, most specific first: "u.s." keeps its dots, "end." does not. */
function candidates(w: string): string[] {
  // Abbreviations are stored with a final dot ("u.s."); try that spelling first.
  const abbr = /[a-z]\.[a-z]$/.test(w) ? [`${w}.`] : [];
  const out = [...abbr, w, w.replace(/\.+$/, ''), w.replace(/^'+|'+$/g, '').replace(/\.+$/, '')];
  return [...new Set(out)].filter(Boolean);
}

/** Parses the generated data file (see scripts/build-cmudict.mjs). */
export function parseCmuDict(text: string): PronunciationDict {
  const map = new Map<string, string>();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const tab = line.indexOf('\t');
    if (tab <= 0) continue;
    map.set(line.slice(0, tab), line.slice(tab + 1));
  }
  return dictFromEncoded(map);
}

function dictFromEncoded(map: ReadonlyMap<string, string>): PronunciationDict {
  const decode = (key: string): Pronunciations | null => {
    const enc = map.get(key);
    return enc ? enc.split('|').map(decodePronunciation) : null;
  };
  return {
    size: map.size,
    lookup(word) {
      const tries = candidates(normalizeWord(word));
      for (const w of tries) {
        const hit = decode(w);
        if (hit) return hit;
      }
      // Possessive / "is" contraction not in the dictionary: base + /s z ɪz/.
      const m = /^(.+)'s$/.exec(tries.at(-1) ?? '');
      const base = m?.[1] ? decode(m[1]) : null;
      return base ? base.map(addSuffixS) : null;
    },
  };
}

/** Builds a dictionary from plain ARPAbet entries (tests, small tables). */
export function dictFromPhones(entries: Record<string, Pronunciations>): PronunciationDict {
  const map = new Map(Object.entries(entries));
  return {
    size: map.size,
    lookup(word) {
      for (const w of candidates(normalizeWord(word))) {
        const hit = map.get(w);
        if (hit) return hit;
      }
      return null;
    },
  };
}

const SIBILANTS = new Set(['S', 'Z', 'SH', 'ZH', 'CH', 'JH']);
const VOICELESS = new Set(['P', 'T', 'K', 'F', 'TH']);

/** Adds the English -s ending with the right allomorph. */
export function addSuffixS(phones: readonly Phone[]): Phone[] {
  const last = phones.at(-1);
  if (!last) return [...phones];
  const b = basePhone(last);
  if (SIBILANTS.has(b)) return [...phones, 'IH0', 'Z'];
  if (VOICELESS.has(b)) return [...phones, 'S'];
  return [...phones, 'Z'];
}
