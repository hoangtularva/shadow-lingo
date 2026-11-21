import { useEffect, useRef } from 'react';
import { canUse } from '../features';
import { formatTimestamp } from '../parsers/text-utils';
import type { Sentence } from '../types';
import { vi } from './strings';

export interface SentenceListProps {
  sentences: readonly Sentence[];
  activeIndex: number;
  timed: boolean;
  autoScroll: boolean;
  onSeek(ms: number): void;
}

/** Pause auto-scroll this long after the user scrolls the list by hand. */
const MANUAL_SCROLL_PAUSE_MS = 3000;

export function SentenceList({
  sentences,
  activeIndex,
  timed,
  autoScroll,
  onSeek,
}: SentenceListProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const manualScrollAt = useRef(0);
  const clickable = timed && canUse('clickToSeek');

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
      ref={listRef}
      className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
      aria-label={vi.listLabel}
      onWheel={markManual}
      onTouchMove={markManual}
      data-testid="sl-list"
    >
      {sentences.map((s, i) => {
        const active = i === activeIndex;
        const time = formatTimestamp(s.start);
        return (
          <li key={s.id}>
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
              <span className="text-base leading-relaxed">{s.text}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
