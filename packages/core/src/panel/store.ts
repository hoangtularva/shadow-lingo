import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Pronunciations } from '../ipa';
import type { PartOfSpeech } from '../pos';
import { findActiveIndex } from '../sync';
import type { Translation, TranslationSource, TranslatorState } from '../adapters';
import type { CaptionTrack, Cue } from '../types';

const RANK: Record<TranslationSource, number> = { machine: 0, human: 1, edited: 2 };

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
  /** Pause at the end of each sentence ("Tự dừng sau câu"). */
  autoPause: boolean;
  /** "Tiếng Anh" chip. */
  showEnglish: boolean;
  /** "Tiếng Việt" chip. */
  showVietnamese: boolean;
  /** Vietnamese lines of the current video, by sentence hash. */
  translations: Readonly<Record<string, Translation>>;
  /** Cues of the video's human Vietnamese captions, once the player loaded them. */
  humanCues: readonly Cue[] | null;
  translator: TranslatorState;
  /** Language pack download progress (0..1) while the translator state is "downloading". */
  translatorProgress: number | null;
  /** Word classes by sentence text; kept across videos. */
  posTags: Readonly<Record<string, readonly (PartOfSpeech | null)[]>>;
  /** Closed by the user; shown again on the next video. */
  hidden: boolean;
  /** Shadowing section folded to its steps row (keys S / R / C still work). */
  shadowingCollapsed: boolean;
  /** The user chose "Dùng nguồn khác": the empty state opens paste / file right away. */
  otherSourcesOpen: boolean;

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
  setAutoPause(on: boolean): void;
  setShowEnglish(on: boolean): void;
  setShowVietnamese(on: boolean): void;
  /** Adds lines; a line never replaces a better one (edited > human > machine). */
  addTranslations(found: Readonly<Record<string, Translation>>): void;
  setHumanCues(cues: readonly Cue[] | null): void;
  setTranslator(state: TranslatorState, progress?: number | null): void;
  /** Applies saved preferences (e.g. loaded from storage). */
  setPreferences(prefs: Partial<PanelPreferences>): void;
  addPosTags(found: Readonly<Record<string, readonly (PartOfSpeech | null)[]>>): void;
  setHidden(hidden: boolean): void;
  setShadowingCollapsed(collapsed: boolean): void;
  /** Drops the track and opens paste / file. */
  chooseOtherSource(): void;
}

export type PanelStore = StoreApi<PanelState>;

/** Display toggles the learner sets once; hosts persist them per device. */
export interface PanelPreferences {
  showIpa: boolean;
  showLinking: boolean;
  showPos: boolean;
  /** Pause at the end of each sentence ("Tự dừng sau câu"). */
  autoPause: boolean;
  /** "Tiếng Anh" chip: the English text of each sentence. */
  showEnglish: boolean;
  /** "Tiếng Việt" chip: the Vietnamese line under each sentence. */
  showVietnamese: boolean;
}

export const DEFAULT_PREFERENCES: PanelPreferences = {
  showIpa: true,
  showLinking: true,
  showPos: true,
  autoPause: false,
  showEnglish: true,
  showVietnamese: true,
};

/** Turns whatever was stored (possibly by an older version) into valid preferences. */
export function sanitizePreferences(raw: unknown): PanelPreferences {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const pick = (k: keyof PanelPreferences) =>
    typeof r[k] === 'boolean' ? r[k] : DEFAULT_PREFERENCES[k];
  return {
    showIpa: pick('showIpa'),
    showLinking: pick('showLinking'),
    showPos: pick('showPos'),
    autoPause: pick('autoPause'),
    showEnglish: pick('showEnglish'),
    showVietnamese: pick('showVietnamese'),
  };
}

export function preferencesOf(s: PanelPreferences): PanelPreferences {
  return {
    showIpa: s.showIpa,
    showLinking: s.showLinking,
    showPos: s.showPos,
    autoPause: s.autoPause,
    showEnglish: s.showEnglish,
    showVietnamese: s.showVietnamese,
  };
}

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
    autoPause: false,
    showEnglish: true,
    showVietnamese: true,
    translations: {},
    humanCues: null,
    translator: 'unsupported',
    translatorProgress: null,
    posTags: {},
    hidden: false,
    shadowingCollapsed: true,
    otherSourcesOpen: false,

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
        otherSourcesOpen: false,
        translations: {},
        humanCues: null,
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
    setAutoPause(autoPause) {
      set({ autoPause });
    },
    setShowEnglish(showEnglish) {
      // At least one language stays visible.
      set(
        showEnglish || get().showVietnamese
          ? { showEnglish }
          : { showEnglish, showVietnamese: true },
      );
    },
    setShowVietnamese(showVietnamese) {
      set(
        showVietnamese || get().showEnglish
          ? { showVietnamese }
          : { showVietnamese, showEnglish: true },
      );
    },
    addTranslations(found) {
      const current = get().translations;
      const next = { ...current };
      let changed = false;
      for (const [hash, t] of Object.entries(found)) {
        const old = current[hash];
        if (old && RANK[old.source] > RANK[t.source]) continue;
        next[hash] = t;
        changed = true;
      }
      if (changed) set({ translations: next });
    },
    setHumanCues(humanCues) {
      if (humanCues === get().humanCues) return;
      set({ humanCues });
    },
    setTranslator(translator, progress = null) {
      set({ translator, translatorProgress: progress });
    },
    setPreferences(prefs) {
      set(prefs);
    },
    addPosTags(found) {
      if (Object.keys(found).length === 0) return;
      set({ posTags: { ...get().posTags, ...found } });
    },
    setHidden(hidden) {
      set({ hidden });
    },
    setShadowingCollapsed(shadowingCollapsed) {
      set({ shadowingCollapsed });
    },
    chooseOtherSource() {
      get().setTrack(null);
      set({ otherSourcesOpen: true });
    },
  }));
}
