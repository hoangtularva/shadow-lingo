import { useCallback, useRef, useState } from 'react';
import type { TranslationAdapter, TranslatorState } from '../adapters';
import { headwordOf, type DictionaryAdapter, type WordLookup } from '../dict';
import type { WordCardStatus } from './WordCard';

export interface OpenWordCard {
  sentenceId: string;
  /** Clicked word index in the sentence. */
  index: number;
  /** Words the card covers (the clicked one until the lookup answers). */
  words: number[];
  headword: string;
  status: WordCardStatus;
  lookup?: WordLookup;
  /** Machine translation when Wiktionary has no Vietnamese for it. */
  machineVi?: string;
}

interface Options {
  dictionary: DictionaryAdapter | null | undefined;
  translation: TranslationAdapter | null | undefined;
  translator: TranslatorState;
  /** The spoken sentence's id: a new sentence hides the card (undefined: never hides). */
  spokenId: string | undefined;
}

export interface WordCardControls {
  card: OpenWordCard | null;
  open(sentenceId: string, words: readonly string[], index: number): void;
  close(): void;
}

/** The word card's state: looks the clicked word up in its sentence, then translates. */
export function useWordCard({
  dictionary,
  translation,
  translator,
  spokenId,
}: Options): WordCardControls {
  const [card, setCard] = useState<OpenWordCard | null>(null);
  const request = useRef(0);

  const close = useCallback(() => {
    request.current += 1;
    setCard(null);
  }, []);

  const open = useCallback(
    (sentenceId: string, words: readonly string[], index: number) => {
      if (!dictionary) return;
      const id = ++request.current;
      const headword = headwordOf(words[index] ?? '') || (words[index] ?? '');
      setCard({ sentenceId, index, words: [index], headword, status: 'loading' });
      const update = (patch: Partial<OpenWordCard>) => {
        if (id === request.current) setCard((c) => (c ? { ...c, ...patch } : c));
      };
      void (async () => {
        let lookup: WordLookup | null;
        try {
          lookup = await dictionary.lookup(words, index);
        } catch {
          update({ status: 'error' });
          return;
        }
        if (!lookup) update({ status: 'missing' });
        else {
          update({
            status: 'ready',
            lookup,
            words: lookup.words,
            headword: lookup.entry.headword,
          });
        }
        // Wiktionary has no Vietnamese for it: ask the on-device translator.
        if (lookup?.entry.vi.length || !translation || translator !== 'ready') return;
        const source = lookup?.entry.lemma ?? lookup?.entry.headword ?? headword;
        try {
          const vi = (await translation.translate(source)).trim();
          if (vi) update({ machineVi: vi });
        } catch {
          // The card stays useful without it.
        }
      })();
    },
    [dictionary, translation, translator],
  );

  // The card belongs to the spoken sentence: another sentence hides it.
  const visible = card && (spokenId === undefined || card.sentenceId === spokenId);
  return { card: visible ? card : null, open, close };
}
