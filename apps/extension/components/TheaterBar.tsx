import { CaptionBar, type PanelStore } from '@shadow-lingo/core/panel';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useStore } from 'zustand';
import type { Rect } from '@/lib/layout';

export interface TheaterBarProps {
  store: PanelStore;
  /** The bar's shadow host, fixed over the top edge of the video. */
  host: HTMLElement;
  getPlayerRect(): Rect | null;
  /** True while the page is in theater mode. */
  isTheater(): boolean;
  /** True while the player shows an ad: the bar never covers ads. */
  isAdShowing(): boolean;
  /** Ad start/end (the time stops updating during ads). */
  onAdChange?: (listener: (showing: boolean) => void) => () => void;
  onPlayerResize?(cb: () => void): () => void;
}

const SIDE_MARGIN = 0.1;
const TOP_OFFSET_PX = 16;

/** Fixes the bar's host over the top edge of the player, or hides it when `player` is null. */
export function positionBar(host: HTMLElement, player: Rect | null): void {
  const s = host.style;
  s.boxSizing = 'border-box';
  s.position = 'fixed';
  s.zIndex = '2100';
  s.pointerEvents = 'none';
  if (!player) {
    s.display = 'none';
    return;
  }
  s.display = 'block';
  s.left = `${player.x + player.width * SIDE_MARGIN}px`;
  s.width = `${player.width * (1 - 2 * SIDE_MARGIN)}px`;
  s.top = `${player.y + TOP_OFFSET_PX}px`;
}

/**
 * In theater mode the player fills the screen and the panel ends up below it, so the
 * spoken sentence is shown as a bar over the top edge of the video (YouTube's own
 * captions sit at the bottom). Hidden for ads, outside theater mode, or when the
 * panel is closed.
 */
export function TheaterBar({
  store,
  host,
  getPlayerRect,
  isTheater,
  isAdShowing,
  onAdChange,
  onPlayerResize,
}: TheaterBarProps) {
  // Re-render on every time update so ads and layout changes are noticed quickly.
  useStore(store, (s) => s.timeMs);
  const hidden = useStore(store, (s) => s.hidden);
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener('resize', bump);
    const stop = onPlayerResize?.(bump);
    const stopAds = onAdChange?.(bump);
    return () => {
      window.removeEventListener('resize', bump);
      stop?.();
      stopAds?.();
    };
  }, [onPlayerResize, onAdChange]);

  const player = getPlayerRect();
  const visible = !hidden && player !== null && isTheater() && !isAdShowing();

  useLayoutEffect(() => {
    positionBar(host, visible ? player : null);
  });

  return visible ? <CaptionBar store={store} /> : null;
}
