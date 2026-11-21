import { useCallback, useEffect, type KeyboardEvent, type PointerEvent } from 'react';
import { useStore } from 'zustand';
import type { PlayerAdapter } from '../adapters';
import { buildTrack, isEnglish } from '../tracks';
import type { CaptionTrack } from '../types';
import { EmptyState } from './EmptyState';
import { Wordmark } from './Logo';
import { SentenceList } from './SentenceList';
import type { PanelStore } from './store';
import { vi } from './strings';

export interface PanelProps {
  store: PanelStore;
  player: PlayerAdapter | null;
  /** Pointer down on the header: lets the host start a drag. */
  onHeaderPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
}

function sourceLabel(track: CaptionTrack): string {
  if (track.source === 'file') return vi.sourceFile;
  if (track.source === 'paste') return vi.sourcePaste;
  return track.kind === 'asr' ? vi.sourceAsr : vi.sourceManual;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)
  );
}

export function Panel({ store, player, onHeaderPointerDown, onCollapsedChange }: PanelProps) {
  const track = useStore(store, (s) => s.track);
  const status = useStore(store, (s) => s.status);
  const activeIndex = useStore(store, (s) => s.activeIndex);
  const collapsed = useStore(store, (s) => s.collapsed);
  const autoScroll = useStore(store, (s) => s.autoScroll);
  const theme = useStore(store, (s) => s.theme);
  const notice = useStore(store, (s) => s.notice);

  useEffect(() => {
    if (!player) return;
    store.getState().setTime(player.getCurrentTime());
    return player.onTimeUpdate((ms) => store.getState().setTime(ms));
  }, [player, store]);

  const seek = useCallback(
    (ms: number) => {
      if (!player) return;
      player.seekTo(ms);
      store.getState().setTime(ms);
    },
    [player, store],
  );

  const loadText = useCallback(
    (text: string, source: 'paste' | 'file'): string | null => {
      try {
        const t = buildTrack({ videoId: store.getState().videoId ?? '', body: text, source });
        if (t.sentences.length === 0) return vi.noSentences;
        store.getState().setTrack(t);
        return null;
      } catch {
        return vi.parseFailed;
      }
    },
    [store],
  );

  const toggleCollapsed = () => {
    const next = !collapsed;
    store.getState().setCollapsed(next);
    onCollapsedChange?.(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!track?.timed || !player || isTypingTarget(e.target)) return;
    const list = track.sentences;
    const at = Math.max(0, activeIndex);
    let target: number | undefined;
    if (e.key === 'ArrowDown') target = list[Math.min(list.length - 1, at + 1)]?.start;
    else if (e.key === 'ArrowUp') target = list[Math.max(0, at - 1)]?.start;
    else if (e.key === 'r' || e.key === 'R') target = list[at]?.start;
    else if (e.key === ' ') {
      e.preventDefault();
      if (player.isPaused()) player.play();
      else player.pause();
      return;
    } else return;
    e.preventDefault();
    if (target !== undefined) seek(target);
  };

  const showOtherLanguage = track?.source === 'player' && !isEnglish(track.lang);

  return (
    <section
      className={
        'sl-root flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-bg font-sans text-fg shadow-panel ' +
        (theme === 'dark' ? 'dark' : '')
      }
      data-theme={theme}
      data-testid="sl-panel"
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <header
        className="flex shrink-0 cursor-grab items-center justify-between gap-2 border-b border-line px-4 py-2 active:cursor-grabbing"
        onPointerDown={onHeaderPointerDown}
        title={onHeaderPointerDown ? vi.dragHint : undefined}
        data-testid="sl-header"
      >
        <Wordmark />
        <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
          {track && !collapsed && (
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface hover:text-fg"
              onClick={() => store.getState().setAutoScroll(!autoScroll)}
              aria-pressed={autoScroll}
            >
              {autoScroll ? vi.autoScrollOn : vi.autoScrollOff}
            </button>
          )}
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm hover:bg-surface"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? vi.expand : vi.collapse}
            title={collapsed ? vi.expand : vi.collapse}
            data-testid="sl-collapse"
          >
            {collapsed ? '▾' : '▴'}
          </button>
        </div>
      </header>

      {!collapsed && (
        <>
          {(notice || showOtherLanguage || (track && !track.timed)) && (
            <p className="shrink-0 border-b border-line bg-surface px-4 py-2 text-xs text-muted">
              {notice ??
                (showOtherLanguage && track ? vi.otherLanguage(track.lang) : vi.untimedNote)}
            </p>
          )}
          {track ? (
            <>
              <SentenceList
                sentences={track.sentences}
                activeIndex={activeIndex}
                timed={track.timed}
                autoScroll={autoScroll}
                onSeek={seek}
              />
              <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-4 py-2 text-xs text-muted">
                <span data-testid="sl-source">
                  {sourceLabel(track)} · {vi.sentenceCount(track.sentences.length)}
                </span>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 hover:bg-surface hover:text-fg"
                  onClick={() => store.getState().setTrack(null)}
                  data-testid="sl-other-source"
                >
                  {vi.useOtherSource}
                </button>
              </footer>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <EmptyState status={status === 'idle' ? 'idle' : 'waiting'} onText={loadText} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
