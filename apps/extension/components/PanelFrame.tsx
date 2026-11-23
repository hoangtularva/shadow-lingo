import { Panel, vi, type PanelStore } from '@shadow-lingo/core/panel';
import type {
  CaptionsAdapter,
  PlayerAdapter,
  PosAdapter,
  PronunciationAdapter,
  RecorderAdapter,
  TranslationAdapter,
  TranslationCache,
  DictionaryAdapter,
  VocabStore,
  AdsAdapter,
  StorageAdapter,
} from '@shadow-lingo/core';
import { useStore } from 'zustand';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import {
  DEFAULT_LAYOUT,
  LAYOUT_KEY,
  MAX_WIDTH,
  MIN_HEIGHT,
  MIN_WIDTH,
  clampToViewport,
  dockedHeight,
  resolveDrop,
  sanitizeLayout,
  changedFields,
  type PanelLayout,
  type Rect,
} from '@/lib/layout';
import { syncPreferences } from '@/lib/preferences';

export interface PanelFrameProps {
  store: PanelStore;
  player: PlayerAdapter;
  storage: StorageAdapter;
  /** The shadow host element in the page; its position is what moves. */
  host: HTMLElement;
  /** Current on-screen rect of the video player, used to keep the panel off it. */
  getPlayerRect(): Rect | null;
  pronunciation?: PronunciationAdapter | null;
  pos?: PosAdapter | null;
  recorder?: RecorderAdapter | null;
  captions?: CaptionsAdapter | null;
  translation?: TranslationAdapter | null;
  translationCache?: TranslationCache | null;
  dictionary?: DictionaryAdapter | null;
  vocab?: VocabStore | null;
  getVideoTitle?: () => string;
  ads?: AdsAdapter | null;
  /** Calls back when the player's size changes (theater mode, window resize). */
  onPlayerResize?(cb: () => void): () => void;
}

const DRAG_THRESHOLD_PX = 5;
const FLOAT_Z_INDEX = '2100';

type Gesture =
  | { kind: 'drag'; startX: number; startY: number; origin: Rect; moved: boolean }
  | { kind: 'resize'; startX: number; startY: number; origin: Rect; floating: boolean };

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Positions the shadow host in YouTube's DOM: fixed at `rect`, or docked when null. */
export function applyHostStyle(host: HTMLElement, rect: Rect | null): void {
  const s = host.style;
  s.display = 'block';
  s.boxSizing = 'border-box';
  if (rect) {
    s.position = 'fixed';
    s.left = `${rect.x}px`;
    s.top = `${rect.y}px`;
    s.width = `${rect.width}px`;
    s.zIndex = FLOAT_Z_INDEX;
    s.marginBottom = '0';
  } else {
    s.position = 'relative';
    s.left = '';
    s.top = '';
    s.width = '100%';
    s.zIndex = '';
    s.marginBottom = '12px';
  }
}

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

export function PanelFrame({
  store,
  player,
  storage,
  host,
  getPlayerRect,
  pronunciation,
  pos,
  recorder,
  captions,
  translation,
  translationCache,
  dictionary,
  vocab,
  getVideoTitle,
  ads,
  onPlayerResize,
}: PanelFrameProps) {
  const [layout, setLayout] = useState<PanelLayout>(DEFAULT_LAYOUT);
  const [live, setLive] = useState<Rect | null>(null);
  const [liveDockHeight, setLiveDockHeight] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  // Changes the learner made before the saved layout arrived; they win over the saved one.
  const loaded = useRef(false);
  const early = useRef<Partial<PanelLayout>>({});

  useEffect(() => {
    let alive = true;
    void storage.get<unknown>(LAYOUT_KEY).then((raw) => {
      if (!alive) return;
      const l = { ...sanitizeLayout(raw), ...early.current };
      loaded.current = true;
      setLayout(l);
      store.getState().setCollapsed(l.collapsed);
      store.getState().setShadowingCollapsed(!l.shadowingExpanded);
      if (Object.keys(early.current).length > 0) void storage.set(LAYOUT_KEY, l);
    });
    return () => {
      alive = false;
    };
  }, [storage, store]);

  useEffect(() => syncPreferences(store, storage), [storage, store]);

  const commit = useCallback(
    (next: PanelLayout) => {
      setLayout((prev) => {
        if (!loaded.current) early.current = { ...early.current, ...changedFields(prev, next) };
        return next;
      });
      if (loaded.current) void storage.set(LAYOUT_KEY, next);
    },
    [storage],
  );

  // Re-check the floating position whenever the player or window changes size.
  const [, setResizeTick] = useState(0);
  useEffect(() => {
    const bump = () => setResizeTick((n) => n + 1);
    window.addEventListener('resize', bump);
    const stop = onPlayerResize?.(bump);
    return () => {
      window.removeEventListener('resize', bump);
      stop?.();
    };
  }, [onPlayerResize]);

  // A saved floating spot that now covers the player (e.g. theater mode) docks for now;
  // the spot is kept and used again once the player no longer covers it.
  const floatRect = clampToViewport(
    { x: layout.x, y: layout.y, width: layout.width, height: layout.floatHeight },
    viewport(),
  );
  const floatBlocked =
    layout.mode === 'floating' &&
    resolveDrop(floatRect, getPlayerRect(), viewport()).mode === 'docked';
  const floating = (layout.mode === 'floating' && !floatBlocked) || live !== null;
  const collapsed = useStore(store, (st) => st.collapsed);
  const hidden = useStore(store, (st) => st.hidden);

  // The host element lives in YouTube's DOM: position it directly.
  useLayoutEffect(() => {
    if (!floating) return applyHostStyle(host, null);
    applyHostStyle(host, live ?? floatRect);
  }, [host, floating, live, floatRect]);

  const height = live
    ? live.height
    : liveDockHeight !== null
      ? liveDockHeight
      : floating
        ? Math.min(layout.floatHeight, window.innerHeight)
        : dockedHeight(layout.height, window.innerHeight);

  // Latest values for the window listeners below, without re-binding them mid-gesture.
  const latest = useRef({ layout, commit, getPlayerRect });
  useEffect(() => {
    latest.current = { layout, commit, getPlayerRect };
  });

  useEffect(() => {
    if (!active) return;
    const onMove = (e: globalThis.PointerEvent) => {
      const g = gesture.current;
      if (!g) return;
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (g.kind === 'drag') {
        if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        g.moved = true;
        setLive({ ...g.origin, x: g.origin.x + dx, y: g.origin.y + dy });
        return;
      }
      const h = Math.max(MIN_HEIGHT, g.origin.height + dy);
      if (g.floating) {
        const w = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, g.origin.width + dx));
        setLive({ ...g.origin, width: w, height: h });
      } else {
        setLiveDockHeight(h);
      }
    };
    const onUp = (e: globalThis.PointerEvent) => {
      const g = gesture.current;
      gesture.current = null;
      setActive(false);
      setLive(null);
      setLiveDockHeight(null);
      if (!g) return;
      const { layout: l, commit: save, getPlayerRect: playerRect } = latest.current;
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (g.kind === 'drag') {
        if (!g.moved) return;
        const dropped = { ...g.origin, x: g.origin.x + dx, y: g.origin.y + dy };
        const res = resolveDrop(dropped, playerRect(), viewport());
        if (res.mode === 'docked') save({ ...l, mode: 'docked' });
        else
          save({
            ...l,
            mode: 'floating',
            x: res.rect.x,
            y: res.rect.y,
            width: res.rect.width,
            floatHeight: res.rect.height,
          });
        return;
      }
      const h = Math.max(MIN_HEIGHT, g.origin.height + dy);
      if (!g.floating) return save({ ...l, height: h });
      const w = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, g.origin.width + dx));
      const res = resolveDrop({ ...g.origin, width: w, height: h }, playerRect(), viewport());
      // A resize that would cover the player is discarded.
      if (res.mode === 'floating') {
        save({ ...l, width: res.rect.width, floatHeight: res.rect.height });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [active]);

  const begin = (e: PointerEvent<HTMLElement>, kind: Gesture['kind']) => {
    if (e.button !== 0) return;
    const origin = rectOf(host);
    if (frameRef.current) origin.height = frameRef.current.getBoundingClientRect().height;
    gesture.current =
      kind === 'drag'
        ? { kind, startX: e.clientX, startY: e.clientY, origin, moved: false }
        : { kind, startX: e.clientX, startY: e.clientY, origin, floating };
    setActive(true);
    e.preventDefault();
  };

  // Closed by the user: leave no gap in YouTube's sidebar until the next video.
  if (hidden) return null;

  return (
    <div
      ref={frameRef}
      className="relative"
      style={{ height: collapsed ? 'auto' : `${height}px` }}
      data-testid="sl-frame"
      data-mode={floating ? 'floating' : 'docked'}
    >
      <Panel
        store={store}
        player={player}
        pronunciation={pronunciation}
        pos={pos}
        recorder={recorder}
        captions={captions}
        translation={translation}
        translationCache={translationCache}
        dictionary={dictionary}
        vocab={vocab}
        getVideoTitle={getVideoTitle}
        ads={ads}
        onHeaderPointerDown={(e) => begin(e, 'drag')}
        onCollapsedChange={(c) => commit({ ...layout, collapsed: c })}
        onShadowingCollapsedChange={(c) => commit({ ...layout, shadowingExpanded: !c })}
        headerExtra={
          floating ? (
            <button
              type="button"
              className="shrink-0 rounded-md px-2 py-1 text-xs whitespace-nowrap text-muted hover:bg-surface hover:text-fg"
              onClick={() => commit({ ...layout, mode: 'docked' })}
              title={vi.dockHint}
              aria-label={vi.dockHint}
              data-testid="sl-dock"
            >
              {vi.dock}
            </button>
          ) : null
        }
      />
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={vi.resize}
          title={vi.resize}
          className={
            'absolute bottom-0 h-3 touch-none ' +
            (floating ? 'right-0 w-4 cursor-nwse-resize' : 'inset-x-4 cursor-ns-resize')
          }
          onPointerDown={(e) => begin(e, 'resize')}
          data-testid="sl-resize"
        />
      )}
    </div>
  );
}
