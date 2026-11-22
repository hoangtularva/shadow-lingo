import { wordSpans } from '../ipa/annotate';

/** Word classes the panel colours (UI spec legend). Other words keep the text colour. */
export type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb' | 'pronoun';

/** Legend order in the UI spec. */
export const PARTS_OF_SPEECH: readonly PartOfSpeech[] = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
];

/** One tagged term from a tagger, with its character range in the sentence. */
export interface TaggedTerm {
  start: number;
  end: number;
  tags: readonly string[];
}

/** Maps a tagger's tags (compromise names) to the class the panel colours. */
export function posFromTags(tags: readonly string[]): PartOfSpeech | null {
  const has = (t: string) => tags.includes(t);
  // Pronouns are also tagged Noun: check them first.
  if (has('Pronoun')) return 'pronoun';
  if (has('Verb')) return 'verb';
  if (has('Adjective')) return 'adjective';
  if (has('Adverb')) return 'adverb';
  if (has('Noun')) return 'noun';
  return null;
}

/**
 * Gives each word of `text` (as the IPA tokenizer splits it) the class of the tagged
 * term it overlaps most. Words no term covers get null.
 */
export function alignPos(text: string, terms: readonly TaggedTerm[]): (PartOfSpeech | null)[] {
  return wordSpans(text).map((w) => {
    let best: TaggedTerm | null = null;
    let bestOverlap = 0;
    for (const t of terms) {
      const overlap = Math.min(w.end, t.end) - Math.max(w.start, t.start);
      if (overlap > bestOverlap) {
        best = t;
        bestOverlap = overlap;
      }
    }
    return best ? posFromTags(best.tags) : null;
  });
}
