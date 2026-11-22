import { useEffect, useMemo, useRef, useState } from 'react';
import { canUse } from '../features';
import { annotateSentence, type Pronunciations } from '../ipa';
import { formatTimestamp } from '../parsers/text-utils';
import type { Sentence } from '../types';
import { vi } from './strings';
import type { PartOfSpeech } from '../pos';
import { PronunciationTip, WordLine } from './WordLine';

export interface SentenceListProps {
  sentences: readonly Sentence[];
  activeIndex: number;
  timed: boolean;
  autoScroll: boolean;
  onSeek(ms: number): void;
  /** Word pronunciations by key; the spoken sentence shows IPA when given. */
  pronunciations?: Readonly<Record<string, Pronunciations | null>>;
  showIpa?: boolean;
  showLinking?: boolean;
  /** Word classes by sentence text; colours the spoken sentence when given. */
  posTags?: Readonly<Record<string, readonly (PartOfSpeech | null)[]>>;
}

/** Pause auto-scroll this long after the user scrolls the list by hand. */
const MANUAL_SCROLL_PAUSE_MS = 3000;

/**
 * Sentence list per the UI spec: past and upcoming sentences are small and muted; the
 * spoken one is a card with large words, IPA, linking marks and one pronunciation tip.
 */
export function SentenceList({
  sentences,
  activeIndex,
  timed,
  autoScroll,
  onSeek,
  pronunciations,
  showIpa = false,
  showLinking = true,
  posTags,
}: SentenceListProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const manualScrollAt = useRef(0);
  // Untimed transcripts have no playback position: the user picks the sentence.
  const [picked, setPicked] = useState(-1);
  const current = timed ? activeIndex : picked;
  const seekable = timed && canUse('clickToSeek');
  const annotate = pronunciations !== undefined && canUse('ipa');
  const warningsOn = annotate && canUse('pronunciationWarnings');

  const words = useMemo(() => {
    const s = sentences[current];
    if (!annotate || !pronunciations || !s) return null;
    return annotateSentence(s.text, (k) => pronunciations[k]);
  }, [annotate, pronunciations, sentences, current]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || current < 0 || !autoScroll || !canUse('autoScroll')) return;
    if (Date.now() - manualScrollAt.current < MANUAL_SCROLL_PAUSE_MS) return;
    const item = list.children[current];
    if (!(item instanceof HTMLElement)) return;
    // Scroll only the list, never the page.
    const top = item.offsetTop - list.clientHeight / 3;
    list.scrollTo?.({ top: Math.max(0, top), behavior: 'smooth' });
  }, [current, autoScroll]);

  const markManual = () => {
    manualScrollAt.current = Date.now();
  };

  return (
    <ol
      ref={listRef}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3.5"
      aria-label={vi.listLabel}
      onWheel={markManual}
      onTouchMove={markManual}
      data-testid="sl-list"
    >
      {sentences.map((s, i) => {
        const active = i === current;
        const time = formatTimestamp(s.start);
        const label = seekable ? `${vi.seekTo(time)}: ${s.text}` : s.text;
        const onClick = () => (seekable ? onSeek(s.start) : setPicked(i));
        const common = {
          type: 'button' as const,
          onClick,
          disabled: timed && !seekable,
          'aria-label': label,
          'aria-current': active ? ('true' as const) : undefined,
          'data-testid': 'sl-sentence',
          'data-text': s.text,
          'data-active': active ? 'true' : undefined,
        };

        if (active) {
          return (
            <li
              key={s.id}
              className="flex flex-col gap-2 rounded-xl border border-accent bg-card p-3"
            >
              <button {...common} className="flex flex-col gap-2 text-left">
                <span className="flex items-center gap-2 text-[11px] leading-4 text-secondary">
                  {timed && (
                    <>
                      <span className="tabular-nums">{time}</span>
                      <span className="text-subtle">·</span>
                    </>
                  )}
                  <span>{vi.speaking}</span>
                </span>
                {words ? (
                  <WordLine
                    words={words}
                    showIpa={showIpa}
                    showLinking={showLinking}
                    showWarnings={warningsOn}
                    pos={posTags?.[s.text]}
                  />
                ) : (
                  <span className="text-[18px] leading-6 font-semibold text-fg">{s.text}</span>
                )}
              </button>
              {words && warningsOn && <PronunciationTip words={words} />}
            </li>
          );
        }

        return (
          <li key={s.id}>
            <button
              {...common}
              className="flex w-full flex-col gap-1 rounded-lg px-1 text-left transition-colors duration-150 hover:bg-surface disabled:hover:bg-transparent"
            >
              {timed && (
                <span className="text-[11px] leading-4 text-subtle tabular-nums">{time}</span>
              )}
              <span className="text-[15px] leading-[22px] text-muted">{s.text}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
