import { useEffect, useRef } from 'react';
import type { DictPos, DictSense } from '../dict';
import { vi } from './strings';

/** Senses shown on the card. */
const MAX_SENSES = 2;

/** Headword colour by class, as the spec colours "figure out" (verb). */
const HEAD_COLOUR: Partial<Record<DictPos, string>> = {
  noun: 'text-pos-noun',
  verb: 'text-pos-verb',
  adj: 'text-pos-adjective',
  adv: 'text-pos-adverb',
  pron: 'text-pos-pronoun',
};

export type WordCardStatus = 'loading' | 'ready' | 'missing' | 'error';

export interface WordCardProps {
  /** The clicked word or matched phrase as written in the dictionary. */
  headword: string;
  status: WordCardStatus;
  lemma?: string;
  ipa?: string;
  senses: readonly DictSense[];
  /** Vietnamese meaning and where it came from. */
  vietnamese?: string;
  viFrom: 'wiktionary' | 'machine' | null;
  onClose(): void;
}

function posLabel(pos: DictPos, headword: string): string {
  return pos === 'verb' && headword.includes(' ') ? vi.phrasalVerb : vi.dictPos[pos];
}

/** Cambridge's English entry for a word (link out only; nothing is fetched). */
export function cambridgeUrl(headword: string): string {
  const slug = headword.trim().toLowerCase().replace(/\s+/g, '-');
  return `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(slug)}`;
}

/** Word details under the spoken sentence (UI spec: the "figure out" card). */
export function WordCard({
  headword,
  status,
  lemma,
  ipa,
  senses,
  vietnamese,
  viFrom,
  onClose,
}: WordCardProps) {
  const first = senses[0]?.pos;
  const shown = senses.slice(0, MAX_SENSES);
  const ref = useRef<HTMLElement>(null);
  // Keep the whole card in view inside the list (never scrolls the page).
  useEffect(() => {
    const el = ref.current;
    const list = el?.closest('ol');
    if (!el || !list) return;
    const bottom = el.offsetTop + el.offsetHeight - list.clientHeight + 8;
    if (bottom > list.scrollTop) list.scrollTo?.({ top: bottom, behavior: 'smooth' });
  }, [status, senses.length]);
  return (
    <section
      ref={ref}
      className="flex flex-col gap-2 rounded-xl border border-word-edge bg-surface px-3.5 py-3"
      aria-label={vi.wordCardLabel(headword)}
      data-testid="sl-word-card"
      data-status={status}
    >
      <div className="flex items-baseline gap-2.5">
        <span
          className={
            'text-[16px] leading-[22px] font-bold ' + ((first && HEAD_COLOUR[first]) || 'text-fg')
          }
          data-testid="sl-word-head"
        >
          {headword}
        </span>
        {ipa && (
          <span className="font-ipa text-[13px] leading-4 text-ipa" data-testid="sl-word-ipa">
            /{ipa}/
          </span>
        )}
        {first && (
          <span className="ml-auto text-[11px] leading-4 text-secondary">
            {posLabel(first, headword)}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={vi.closeWordCard}
          title={vi.closeWordCardTitle}
          className={
            'flex size-6 flex-none items-center justify-center self-center rounded-md text-secondary hover:bg-card' +
            (first ? '' : ' ml-auto')
          }
          data-testid="sl-word-close"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M4 4 L12 12 M12 4 L4 12"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {lemma && (
        <div className="-mt-1 text-[11px] leading-4 text-subtle">{vi.wordLemma(lemma)}</div>
      )}
      {vietnamese && (
        <div className="text-[13px] leading-[18px] text-fg" lang="vi" data-testid="sl-word-vi">
          {vietnamese}
        </div>
      )}
      {status === 'loading' && (
        <div className="text-[12.5px] leading-normal text-secondary">{vi.wordLoading}</div>
      )}
      {status === 'missing' && (
        <div className="text-[12.5px] leading-normal text-secondary">{vi.wordMissing}</div>
      )}
      {status === 'error' && (
        <div className="text-[12.5px] leading-normal text-secondary">{vi.wordFailed}</div>
      )}
      {shown.length > 0 && (
        <ol className="flex flex-col gap-1 text-[12.5px] leading-normal text-secondary" lang="en">
          {shown.map((s, i) => (
            <li key={i} className="flex flex-col" data-testid="sl-word-sense">
              <span>
                <b className="font-semibold">{i + 1}.</b>{' '}
                {s.pos !== first && <span className="text-subtle">({vi.dictPos[s.pos]}) </span>}
                {s.gloss}
              </span>
              {s.example && <span className="text-subtle italic">“{s.example}”</span>}
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap gap-2">
        <a
          href={cambridgeUrl(lemma ?? headword)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-[30px] items-center rounded-lg border border-chip-off px-3 text-[12px] text-link no-underline hover:underline"
          data-testid="sl-word-cambridge"
        >
          {vi.openCambridge}
        </a>
      </div>
      {status === 'ready' && (
        <div className="text-[11px] leading-4 text-subtle">{vi.wordSource(viFrom)}</div>
      )}
    </section>
  );
}
