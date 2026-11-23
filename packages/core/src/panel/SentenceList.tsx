import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { canUse } from '../features';
import { annotateSentence, type AnnotatedWord, type Pronunciations } from '../ipa';
import { formatTimestamp } from '../parsers/text-utils';
import type { Translation, TranslatorState } from '../adapters';
import { sentenceHash } from '../hash';
import type { Sentence } from '../types';
import { VietnameseLine } from './VietnameseLine';
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
  /** Word classes by sentence text; pick homograph readings (record, present). */
  posTags?: Readonly<Record<string, readonly (PartOfSpeech | null)[]>>;
  /** Colour the spoken sentence by word class. */
  showPos?: boolean;
  /** "Tiếng Anh" chip; English stays when a sentence has no Vietnamese yet. */
  showEnglish?: boolean;
  /** Vietnamese lines by sentence hash; undefined = Vietnamese is off. */
  translations?: Readonly<Record<string, Translation>>;
  translator?: TranslatorState;
  translatorProgress?: number | null;
  onDownloadTranslator?: () => void;
  /** Saves an edited Vietnamese line for a sentence text. */
  onEditTranslation?: (text: string, vi: string) => void;
  /** Replays of the spoken sentence ("lặp lần N"). */
  repeats?: number;
  /** Faded while an ad plays. */
  dimmed?: boolean;
  /** Clicking a word of the spoken sentence looks it up (word card). */
  onWordClick?: (sentenceId: string, words: readonly string[], index: number) => void;
  /** Words of the spoken sentence covered by the open word card. */
  selectedWords?: ReadonlySet<number>;
  /** The open word card, shown under the spoken sentence; gets its annotated words. */
  wordCard?: (sentenceId: string, words: readonly AnnotatedWord[] | null) => ReactNode;
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
  showPos = false,
  showEnglish = true,
  translations,
  translator = 'unsupported',
  translatorProgress = null,
  onDownloadTranslator,
  onEditTranslation,
  onWordClick,
  dimmed = false,
  repeats = 0,
  selectedWords,
  wordCard,
}: SentenceListProps) {
  const hashes = useMemo(() => sentences.map((s) => sentenceHash(s.text)), [sentences]);
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
    return annotateSentence(s.text, (k) => pronunciations[k], posTags?.[s.text]);
  }, [annotate, pronunciations, sentences, current, posTags]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || current < 0 || !autoScroll || !canUse('autoScroll')) return;
    if (Date.now() - manualScrollAt.current < MANUAL_SCROLL_PAUSE_MS) return;
    const item = list.children[current];
    if (!(item instanceof HTMLElement)) return;
    // Scroll only the list, never the page. Measured from the list itself: offsetTop counts
    // from whatever positioned ancestor there is (the whole phone screen in the apps).
    const offset = item.getBoundingClientRect().top - list.getBoundingClientRect().top;
    // A third of the way down, or higher when the card would not fit below that (phones).
    const lead = Math.max(
      8,
      Math.min(list.clientHeight / 3, list.clientHeight - item.offsetHeight - 8),
    );
    const top = list.scrollTop + offset - lead;
    list.scrollTo?.({ top: Math.max(0, top), behavior: 'smooth' });
  }, [current, autoScroll]);

  const markManual = () => {
    manualScrollAt.current = Date.now();
  };

  return (
    <ol
      ref={listRef}
      className={
        'flex min-h-12 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3.5 transition-opacity duration-200 ' +
        (dimmed ? 'opacity-55' : '')
      }
      aria-label={vi.listLabel}
      onWheel={markManual}
      onTouchMove={markManual}
      data-testid="sl-list"
    >
      {sentences.map((s, i) => {
        const active = i === current;
        const viLine = translations?.[hashes[i] ?? ''];
        const english = showEnglish || !viLine;
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
          const header = (
            <span className="flex items-center gap-2 text-[11px] leading-4 text-secondary">
              {timed && (
                <>
                  <span className="tabular-nums">{time}</span>
                  <span className="text-subtle">·</span>
                </>
              )}
              <span data-testid="sl-speaking">
                {vi.speaking}
                {repeats > 0 ? ` · ${vi.repeatCount(repeats)}` : ''}
              </span>
            </span>
          );
          const wordLine =
            english && words ? (
              <WordLine
                words={words}
                showIpa={showIpa}
                showLinking={showLinking}
                showWarnings={warningsOn}
                pos={showPos ? posTags?.[s.text] : undefined}
                onWordClick={
                  onWordClick
                    ? (k) =>
                        onWordClick(
                          s.id,
                          words.map((w) => w.text),
                          k,
                        )
                    : undefined
                }
                selected={selectedWords}
              />
            ) : english ? (
              <span className="text-[16px] leading-[22px] font-semibold text-fg">{s.text}</span>
            ) : null;
          // Clickable words cannot sit inside the sentence button: only the header seeks then.
          const lookup = !!onWordClick && !!words && english;
          const card = wordCard?.(s.id, words);
          return [
            <li
              key={s.id}
              className="flex flex-col gap-2 rounded-xl border border-accent bg-card p-3"
              {...(lookup
                ? {
                    'data-testid': 'sl-sentence',
                    'data-text': s.text,
                    'data-active': 'true',
                    'aria-current': 'true' as const,
                  }
                : {})}
            >
              {lookup ? (
                <>
                  <button
                    {...common}
                    data-testid="sl-sentence-seek"
                    data-text={undefined}
                    data-active={undefined}
                    aria-current={undefined}
                    className="text-left"
                  >
                    {header}
                  </button>
                  {wordLine}
                </>
              ) : (
                <button {...common} className="flex flex-col gap-2 text-left">
                  {header}
                  {wordLine}
                </button>
              )}
              {translations !== undefined && (
                <VietnameseLine
                  // A new spoken sentence closes an open edit box.
                  key={s.id}
                  translation={viLine}
                  translator={translator}
                  progress={translatorProgress}
                  onDownload={() => onDownloadTranslator?.()}
                  onEdit={onEditTranslation ? (v) => onEditTranslation(s.text, v) : undefined}
                />
              )}
              {words && english && warningsOn && <PronunciationTip words={words} />}
            </li>,
            card ? <li key={`${s.id}:word`}>{card}</li> : null,
          ];
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
              {english && <span className="text-[15px] leading-[22px] text-muted">{s.text}</span>}
              {viLine && (
                <span
                  className="text-[13px] leading-[18px] text-subtle"
                  lang="vi"
                  data-testid="sl-vi"
                >
                  {viLine.vi}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
