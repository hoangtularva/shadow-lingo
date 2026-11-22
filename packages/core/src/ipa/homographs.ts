import { parseArpabet, type Phone } from './arpabet';
import type { PartOfSpeech } from '../pos';

/**
 * Words spelled the same but read differently by word class (record: noun /ˈrekɚd/,
 * verb /rɪˈkɔːrd/). CMU Dict lists both without saying which is which, so the panel
 * picks one from the part-of-speech tag, else the most common reading.
 */
interface Homograph {
  /** Noun reading (also used for adjectives when there is no `adjective`). */
  noun?: string;
  verb?: string;
  /** Adjective / adverb reading (also used for nouns when there is no `noun`). */
  adjective?: string;
  /** Reading used without a tag. */
  fallback: 'noun' | 'verb' | 'adjective';
}

/** Stress shift: noun/adjective on the first syllable, verb on the second. */
function shift(noun: string, verb: string, fallback: Homograph['fallback'] = 'noun'): Homograph {
  return { noun, verb, fallback };
}

/** -ate words: adjective/noun /-ət/, verb /-eɪt/. */
function ate(stem: string, fallback: Homograph['fallback']): Homograph {
  return { adjective: `${stem} AH0 T`, verb: `${stem} EY2 T`, fallback };
}

const HOMOGRAPHS: Record<string, Homograph> = {
  live: { verb: 'L IH1 V', adjective: 'L AY1 V', fallback: 'verb' },
  lives: { noun: 'L AY1 V Z', verb: 'L IH1 V Z', fallback: 'noun' },
  record: shift('R EH1 K ER0 D', 'R IH0 K AO1 R D'),
  records: shift('R EH1 K ER0 D Z', 'R IH0 K AO1 R D Z'),
  present: shift('P R EH1 Z AH0 N T', 'P R IY0 Z EH1 N T'),
  object: shift('AA1 B JH EH0 K T', 'AH0 B JH EH1 K T'),
  project: shift('P R AA1 JH EH0 K T', 'P R AH0 JH EH1 K T'),
  permit: shift('P ER1 M IH2 T', 'P ER0 M IH1 T'),
  produce: shift('P R OW1 D UW0 S', 'P R AH0 D UW1 S', 'verb'),
  conduct: shift('K AA1 N D AH0 K T', 'K AH0 N D AH1 K T'),
  contract: shift('K AA1 N T R AE2 K T', 'K AH0 N T R AE1 K T'),
  increase: shift('IH1 N K R IY2 S', 'IH0 N K R IY1 S', 'verb'),
  decrease: shift('D IY1 K R IY2 S', 'D IH0 K R IY1 S', 'verb'),
  export: shift('EH1 K S P AO0 R T', 'IH0 K S P AO1 R T'),
  import: shift('IH1 M P AO2 R T', 'IH0 M P AO1 R T'),
  insult: shift('IH1 N S AH2 L T', 'IH0 N S AH1 L T'),
  progress: shift('P R AA1 G R EH2 S', 'P R AH0 G R EH1 S'),
  protest: shift('P R OW1 T EH2 S T', 'P R AH0 T EH1 S T'),
  rebel: shift('R EH1 B AH0 L', 'R IH0 B EH1 L'),
  subject: shift('S AH1 B JH IH0 K T', 'S AH0 B JH EH1 K T'),
  suspect: shift('S AH1 S P EH2 K T', 'S AH0 S P EH1 K T'),
  conflict: shift('K AA1 N F L IH0 K T', 'K AH0 N F L IH1 K T'),
  contest: shift('K AA1 N T EH0 S T', 'K AH0 N T EH1 S T'),
  convert: shift('K AA1 N V ER0 T', 'K AH0 N V ER1 T', 'verb'),
  desert: shift('D EH1 Z ER0 T', 'D IH0 Z ER1 T'),
  refuse: shift('R EH1 F Y UW2 S', 'R IH0 F Y UW1 Z', 'verb'),
  combat: shift('K AA1 M B AE0 T', 'K AH0 M B AE1 T'),
  survey: shift('S ER1 V EY2', 'S ER0 V EY1'),
  transfer: shift('T R AE1 N S F ER0', 'T R AE0 N S F ER1'),
  extract: shift('EH1 K S T R AE2 K T', 'IH0 K S T R AE1 K T'),
  compound: shift('K AA1 M P AW0 N D', 'K AH0 M P AW1 N D'),
  address: shift('AE1 D R EH2 S', 'AH0 D R EH1 S'),
  content: { noun: 'K AA1 N T EH0 N T', adjective: 'K AH0 N T EH1 N T', fallback: 'noun' },
  minute: { noun: 'M IH1 N AH0 T', adjective: 'M AY0 N UW1 T', fallback: 'noun' },
  perfect: { adjective: 'P ER1 F IH0 K T', verb: 'P ER0 F EH1 K T', fallback: 'adjective' },
  wind: { noun: 'W IH1 N D', verb: 'W AY1 N D', fallback: 'noun' },
  wound: { noun: 'W UW1 N D', verb: 'W AW1 N D', fallback: 'noun' },
  close: { adjective: 'K L OW1 S', verb: 'K L OW1 Z', fallback: 'adjective' },
  use: { noun: 'Y UW1 S', verb: 'Y UW1 Z', fallback: 'verb' },
  excuse: { noun: 'IH0 K S K Y UW1 S', verb: 'IH0 K S K Y UW1 Z', fallback: 'noun' },
  house: { noun: 'HH AW1 S', verb: 'HH AW1 Z', fallback: 'noun' },
  tear: { noun: 'T IH1 R', verb: 'T EH1 R', fallback: 'noun' },
  dove: { noun: 'D AH1 V', verb: 'D OW1 V', fallback: 'noun' },
  separate: ate('S EH1 P ER0', 'adjective'),
  estimate: ate('EH1 S T AH0 M', 'noun'),
  graduate: ate('G R AE1 JH UW0', 'noun'),
  moderate: ate('M AA1 D ER0', 'adjective'),
  alternate: ate('AO1 L T ER0 N', 'adjective'),
  appropriate: ate('AH0 P R OW1 P R IY0', 'adjective'),
  associate: ate('AH0 S OW1 S IY0', 'noun'),
  // One reading is far more common; CMU Dict lists the rarer one first.
  lead: { verb: 'L IY1 D', fallback: 'verb' },
  bass: { noun: 'B EY1 S', fallback: 'noun' },
};

/** "read" is /red/ after these (have read, was read); else /riːd/. */
const READ_PAST_AFTER = new Set([
  'have',
  'has',
  'had',
  "i've",
  "you've",
  "we've",
  "they've",
  "haven't",
  "hasn't",
  "hadn't",
  'was',
  'were',
  'been',
  'being',
  'is',
  'are',
  'am',
  'be',
  'get',
  'gets',
  'got',
  'already',
  'just',
  'never',
  'ever',
]);

function senseOf(h: Homograph, pos: PartOfSpeech | null | undefined): string | undefined {
  if (pos === 'verb') return h.verb ?? h[h.fallback];
  if (pos === 'adjective' || pos === 'adverb') return h.adjective ?? h.noun ?? h[h.fallback];
  if (pos === 'noun') return h.noun ?? h.adjective ?? h[h.fallback];
  return h[h.fallback];
}

/**
 * The reading of a homograph for this word class, or null when `key` is not one.
 * `prevKey` is the previous word's key (for "have read" → /red/).
 */
export function homographPhones(
  key: string,
  pos: PartOfSpeech | null | undefined,
  prevKey?: string,
): Phone[] | null {
  if (key === 'read') {
    return parseArpabet(prevKey && READ_PAST_AFTER.has(prevKey) ? 'R EH1 D' : 'R IY1 D');
  }
  const h = HOMOGRAPHS[key];
  const sense = h ? senseOf(h, pos) : undefined;
  return sense ? parseArpabet(sense) : null;
}
