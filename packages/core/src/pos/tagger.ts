/**
 * Part-of-speech tagging with compromise (MIT). Kept out of the main core entry so the
 * content script never bundles it: apps run it in a background worker.
 */
import nlp from 'compromise';
import { alignPos, type PartOfSpeech, type TaggedTerm } from './index';

interface CompromiseTerm {
  tags?: string[];
  offset?: { start: number; length: number };
}

interface CompromiseSentence {
  terms?: CompromiseTerm[];
}

/** Tags one sentence; the result has one entry per word of the IPA tokenizer. */
export function tagSentence(text: string): (PartOfSpeech | null)[] {
  const doc = nlp(text).json({ offset: true }) as CompromiseSentence[];
  const terms: TaggedTerm[] = [];
  for (const s of doc) {
    for (const t of s.terms ?? []) {
      if (!t.offset || t.offset.length === 0) continue;
      terms.push({
        start: t.offset.start,
        end: t.offset.start + t.offset.length,
        tags: t.tags ?? [],
      });
    }
  }
  return alignPos(text, terms);
}
