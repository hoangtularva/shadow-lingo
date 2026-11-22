import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Pronunciations } from '../ipa';
import type { PartOfSpeech } from '../pos';
import { findActiveIndex } from '../sync';
import type { CaptionTrack } from '../types';

export type Theme = 'dark' | 'light';

/** "waiting" = on a video, no captions yet; "ready" = a track is shown. */
export type PanelStatus = 'idle' | 'waiting' | 'ready';

export interface PanelState {
  videoId: string | null;
  track: CaptionTrack | null;
  status: PanelStatus;
  activeIndex: number;
  timeMs: number;
  collapsed: boolean;
  autoScroll: boolean;
  theme: Theme;
  /** Short message shown above the list (Vietnamese), e.g. a parse error. */
  notice: string | null;
  /** Pronunciations by normalized word key; null = looked up, not found. Kept across videos. */
  pronunciations: Readonly<Record<string, Pronunciations | null>>;
  showIpa: boolean;
  showLinking: boolean;
  /** Part-of-speech colours on the spoken sentence ("Từ loại" chip). */
  showPos: boolean;
  /** Word classes by sentence text; kept across videos. */
  posTags: Readonly<Record<string, readonly (PartOfSpeech | null)[]>>;
  /** Closed by the user; shown again on the next video. */
  hidden: boolean;

  setVideo(videoId: string | null): void;
  setTrack(track: CaptionTrack | null): void;
  setTime(ms: number): void;
  setCollapsed(collapsed: boolean): void;
  setAutoScroll(on: boolean): void;
  setTheme(theme: Theme): void;
  setNotice(notice: string | null): void;
  addPronunciations(found: Readonly<Record<string, Pronunciations | null>>): void;
  setShowIpa(on: boolean): void;
  setShowLinking(on: boolean): void;
  setShowPos(on: boolean): void;
  addPosTags(found: Readonly<Record<string, readonly (PartOfSpeech | null)[]>>): void;
  setHidden(hidden: boolean): void;
}

export type PanelStore = StoreApi<PanelState>;

export function createPanelStore(
  initial: Partial<Pick<PanelState, 'theme' | 'collapsed' | 'showIpa'>> = {},
) {
  return createStore<PanelState>()((set, get) => ({
    videoId: null,
    track: null,
    status: 'idle',
    activeIndex: -1,
    timeMs: 0,
    collapsed: initial.collapsed ?? false,
    autoScroll: true,
    theme: initial.theme ?? 'dark',
    notice: null,
    pronunciations: {},
    showIpa: initial.showIpa ?? true,
    showLinking: true,
    showPos: true,
    posTags: {},
    hidden: false,

    setVideo(videoId) {
      if (videoId === get().videoId) return;
      set({
        videoId,
        track: null,
        status: videoId ? 'waiting' : 'idle',
        activeIndex: -1,
        timeMs: 0,
        notice: null,
        hidden: false,
      });
    },
    setTrack(track) {
      const { timeMs } = get();
      set({
        track,
        status: track ? 'ready' : get().videoId ? 'waiting' : 'idle',
        activeIndex: track?.timed ? findActiveIndex(track.sentences, timeMs) : -1,
        notice: null,
      });
    },
    setTime(ms) {
      const { track, activeIndex } = get();
      const next = track?.timed ? findActiveIndex(track.sentences, ms) : -1;
      if (next !== activeIndex) set({ timeMs: ms, activeIndex: next });
      else set({ timeMs: ms });
    },
    setCollapsed(collapsed) {
      set({ collapsed });
    },
    setAutoScroll(autoScroll) {
      set({ autoScroll });
    },
    setTheme(theme) {
      set({ theme });
    },
    setNotice(notice) {
      set({ notice });
    },
    addPronunciations(found) {
      if (Object.keys(found).length === 0) return;
      set({ pronunciations: { ...get().pronunciations, ...found } });
    },
    setShowIpa(showIpa) {
      set({ showIpa });
    },
    setShowLinking(showLinking) {
      set({ showLinking });
    },
    setShowPos(showPos) {
      set({ showPos });
    },
    addPosTags(found) {
      if (Object.keys(found).length === 0) return;
      set({ posTags: { ...get().posTags, ...found } });
    },
    setHidden(hidden) {
      set({ hidden });
    },
  }));
}
