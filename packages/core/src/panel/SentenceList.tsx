import { useEffect, useMemo, useRef, useState } from 'react';
import { canUse } from '../features';
import { annotateSentence, type AnnotatedWord, type Pronunciations } from '../ipa';
import { formatTimestamp } from '../parsers/text-utils';
import type { Sentence } from '../types';
import { vi } from './strings';
import { PronunciationTips, WordLine } from './WordLine';

export interface SentenceListProps {
  sentences: readonly Sentence[];
  activeIndex: number;
  timed: boolean;
  autoScroll: boolean;
  onSeek(ms: number): void;
  /** Word pronunciations by key; IPA rows are shown when given and `showIpa` is on. */
  pronunciations?: Readonly<Record<string, Pronunciations | null>>;
  showIpa?: boolean;
}

/** Sentences rendered with IPA ahead of the viewport, so scrolling never shows gaps. */
const LAZY_MARGIN = '800px 0px';

/**
 * Tracks which list items have come near the viewport. Long videos have 1000+
 * sentences; building IPA rows only for seen ones keeps the page light.
 */
function useSeenItems(
  list: HTMLElement | null,
  items: readonly unknown[],
  enabled: boolean,
): ReadonlySet<number> {
  // Seen indices belong to one items array; a new track starts empty.
  const [state, setState] = useState<{ items: readonly unknown[]; seen: Set<number> }>(() => ({
    items,
    seen: new Set(),
  }));
  const noObserver = typeof IntersectionObserver === 'undefined';
  useEffect(() => {
    if (!enabled || !list || noObserver) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const add = entries
          .filter((e) => e.isIntersecting)
          .map((e) => Number((e.target as HTMLElement).dataset.index));
        if (add.length === 0) return;
        setState((prev) => {
          const base = prev.items === items ? prev.seen : new Set<number>();
          if (prev.items === items && add.every((i) => base.has(i))) return prev;
          const seen = new Set(base);
          for (const i of add) seen.add(i);
          return { items, seen };
        });
      },
      { root: list, rootMargin: LAZY_MARGIN },
    );
    for (const li of Array.from(list.children)) observer.observe(li);
    return () => observer.disconnect();
  }, [list, items, enabled, noObserver]);
  return useMemo(() => {
    if (noObserver) return new Set(items.keys());
    return state.items === items ? state.seen : new Set<number>();
  }, [noObserver, items, state]);
}

/** Pause auto-scroll this long after the user scrolls the list by hand. */
const MANUAL_SCROLL_PAUSE_MS = 3000;

export function SentenceList({
  sentences,
  activeIndex,
  timed,
  autoScroll,
  onSeek,
  pronunciations,
  showIpa = false,
}: SentenceListProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const [listEl, setListEl] = useState<HTMLOListElement | null>(null);
  const manualScrollAt = useRef(0);
  const clickable = timed && canUse('clickToSeek');
  const ipaOn = showIpa && pronunciations !== undefined && canUse('ipa');
  const warningsOn = ipaOn && canUse('pronunciationWarnings');
  const seen = useSeenItems(listEl, sentences, ipaOn);

  const annotated = useMemo(() => {
    const out = new Map<number, AnnotatedWord[]>();
    if (!ipaOn || !pronunciations) return out;
    const lookup = (k: string) => pronunciations[k];
    for (const i of seen) {
      const s = sentences[i];
      if (s) out.set(i, annotateSentence(s.text, lookup));
    }
    if (activeIndex >= 0 && !out.has(activeIndex)) {
      const s = sentences[activeIndex];
      if (s) out.set(activeIndex, annotateSentence(s.text, lookup));
    }
    return out;
  }, [ipaOn, pronunciations, seen, sentences, activeIndex]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || activeIndex < 0 || !autoScroll || !canUse('autoScroll')) return;
    if (Date.now() - manualScrollAt.current < MANUAL_SCROLL_PAUSE_MS) return;
    const item = list.children[activeIndex];
    if (!(item instanceof HTMLElement)) return;
    // Scroll only the list, never the page.
    const top = item.offsetTop - list.clientHeight / 3;
    list.scrollTo?.({ top: Math.max(0, top), behavior: 'smooth' });
  }, [activeIndex, autoScroll]);

  const markManual = () => {
    manualScrollAt.current = Date.now();
  };

  return (
    <ol
      ref={(el) => {
        listRef.current = el;
        setListEl(el);
      }}
      className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
      aria-label={vi.listLabel}
      onWheel={markManual}
      onTouchMove={markManual}
      data-testid="sl-list"
    >
      {sentences.map((s, i) => {
        const active = i === activeIndex;
        const time = formatTimestamp(s.start);
        const words = annotated.get(i);
        return (
          <li key={s.id} data-index={i}>
            <button
              type="button"
              disabled={!clickable}
              aria-current={active ? 'true' : undefined}
              aria-label={clickable ? `${vi.seekTo(time)}: ${s.text}` : undefined}
              onClick={() => onSeek(s.start)}
              className={
                'flex w-full gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-150 ' +
                (active ? 'bg-active text-fg' : 'text-fg hover:bg-surface') +
                (clickable ? ' cursor-pointer' : ' cursor-default')
              }
              data-testid="sl-sentence"
              data-text={s.text}
              data-active={active ? 'true' : undefined}
            >
              {timed && (
                <span
                  className={
                    'min-w-10 shrink-0 pt-1 text-xs tabular-nums ' +
                    (active ? 'text-accent' : 'text-muted')
                  }
                >
                  {time}
                </span>
              )}
              {words ? (
                <WordLine words={words} showWarnings={warningsOn && active} />
              ) : (
                <span className="text-base leading-relaxed">{s.text}</span>
              )}
            </button>
            {active && words && warningsOn && <PronunciationTips words={words} />}
          </li>
        );
      })}
    </ol>
  );
}
