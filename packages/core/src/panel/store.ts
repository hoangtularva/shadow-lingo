import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Pronunciations } from '../ipa';
import type { PartOfSpeech } from '../pos';
import { findActiveIndex } from '../sync';
import type { Translation, TranslationSource, TranslatorState } from '../adapters';
import type { OcrPlacement, OcrRegion } from '../ocr';
import type { CaptionTrack, Cue } from '../types';
import type { VocabEntry } from '../vocab';

export type PanelTab = 'captions' | 'vocab';

const RANK: Record<TranslationSource, number> = { machine: 0, human: 1, edited: 2 };

export type Theme = 'dark' | 'light';

/** "waiting" = on a video, no captions yet; "ready" = a track is shown. */
export type PanelStatus = 'idle' | 'waiting' | 'ready';

export interface OcrState {
  active: boolean;
  /** Where subtitles are read ("Tự tìm" by default). */
  placement: OcrPlacement;
  /** The learner's own region ("Chọn vùng"). */
  region: OcrRegion;
  /** Where "Tự tìm" found the subtitles, once it has. */
  found: OcrRegion | null;
  /** The "Chọn vùng" editor is open. */
  editing: boolean;
}

/** Where "Chọn vùng" starts: the usual subtitle band. */
export const DEFAULT_OCR_REGION: OcrRegion = { from: 0.72, to: 0.97 };

export interface PanelState {
  videoId: string | null;
  track: CaptionTrack | null;
  status: PanelStatus;
  activeIndex: number;
  timeMs: number;
  collapsed: boolean;
  autoScroll: boolean;
  /** Theme shown: the page's one, or the learner's choice. */
  theme: Theme;
  /** Theme of the page (YouTube) or the system. */
  autoTheme: Theme;
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
  /** Light / dark button choice. */
  themeMode: ThemeMode;
  /** Vietnamese lines of the current video, by sentence hash. */
  translations: Readonly<Record<string, Translation>>;
  /** "Phụ đề" or "Sổ từ vựng" tab. */
  tab: PanelTab;
  /** A review session is open in the notebook tab; done / total for the header. */
  review: { done: number; total: number } | null;
  /** The learner's notebook, newest first; null until loaded. */
  vocab: readonly VocabEntry[] | null;
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
  /** "Đọc chữ trên hình": reading burned-in subtitles, and where they sit. */
  ocr: OcrState;

  setVideo(videoId: string | null): void;
  setTrack(track: CaptionTrack | null): void;
  setTime(ms: number): void;
  setCollapsed(collapsed: boolean): void;
  setAutoScroll(on: boolean): void;
  /** The page's (or system's) theme; the panel shows it unless the learner forced one. */
  setTheme(theme: Theme): void;
  setThemeMode(mode: ThemeMode): void;
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
  setTab(tab: PanelTab): void;
  setVocab(entries: readonly VocabEntry[]): void;
  setReview(review: { done: number; total: number } | null): void;
  setTranslator(state: TranslatorState, progress?: number | null): void;
  /** Applies saved preferences (e.g. loaded from storage). */
  setPreferences(prefs: Partial<PanelPreferences>): void;
  addPosTags(found: Readonly<Record<string, readonly (PartOfSpeech | null)[]>>): void;
  setHidden(hidden: boolean): void;
  setShadowingCollapsed(collapsed: boolean): void;
  /** Drops the track and opens paste / file. */
  chooseOtherSource(): void;
  setOcr(ocr: Partial<OcrState>): void;
}

export type PanelStore = StoreApi<PanelState>;

/** Display toggles the learner sets once; hosts persist them per device. */
/** "auto" follows the page (YouTube) or the system (apps). */
export type ThemeMode = 'auto' | 'light' | 'dark';

export function isThemeMode(v: unknown): v is ThemeMode {
  return v === 'auto' || v === 'light' || v === 'dark';
}

export function resolveTheme(mode: ThemeMode, auto: Theme): Theme {
  return mode === 'auto' ? auto : mode;
}

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
  /** Light / dark button: follow the page, or force one. */
  themeMode: ThemeMode;
}

export const DEFAULT_PREFERENCES: PanelPreferences = {
  showIpa: true,
  showLinking: true,
  showPos: true,
  autoPause: false,
  showEnglish: true,
  showVietnamese: true,
  themeMode: 'auto',
};

/** Turns whatever was stored (possibly by an older version) into valid preferences. */
export function sanitizePreferences(raw: unknown): PanelPreferences {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const pick = (k: Exclude<keyof PanelPreferences, 'themeMode'>) =>
    typeof r[k] === 'boolean' ? r[k] : DEFAULT_PREFERENCES[k];
  return {
    showIpa: pick('showIpa'),
    showLinking: pick('showLinking'),
    showPos: pick('showPos'),
    autoPause: pick('autoPause'),
    showEnglish: pick('showEnglish'),
    showVietnamese: pick('showVietnamese'),
    themeMode: isThemeMode(r.themeMode) ? r.themeMode : DEFAULT_PREFERENCES.themeMode,
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
    themeMode: s.themeMode,
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
    autoTheme: initial.theme ?? 'dark',
    notice: null,
    pronunciations: {},
    showIpa: initial.showIpa ?? true,
    showLinking: true,
    showPos: true,
    autoPause: false,
    showEnglish: true,
    showVietnamese: true,
    themeMode: 'auto',
    translations: {},
    humanCues: null,
    tab: 'captions',
    vocab: null,
    review: null,
    translator: 'unsupported',
    translatorProgress: null,
    posTags: {},
    hidden: false,
    shadowingCollapsed: true,
    otherSourcesOpen: false,
    ocr: {
      active: false,
      placement: 'auto',
      region: DEFAULT_OCR_REGION,
      found: null,
      editing: false,
    },

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
        ocr: { ...get().ocr, active: false, found: null, editing: false },
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
    setTheme(autoTheme) {
      set({ autoTheme, theme: resolveTheme(get().themeMode, autoTheme) });
    },
    setThemeMode(themeMode) {
      set({ themeMode, theme: resolveTheme(themeMode, get().autoTheme) });
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
    setTab(tab) {
      set({ tab });
    },
    setVocab(vocab) {
      set({ vocab });
    },
    setReview(review) {
      set({ review });
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
      if (prefs.themeMode) set({ theme: resolveTheme(prefs.themeMode, get().autoTheme) });
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
      set({ otherSourcesOpen: true, ocr: { ...get().ocr, active: false, editing: false } });
    },
    setOcr(ocr) {
      set({ ocr: { ...get().ocr, ...ocr }, ...(ocr.active ? { otherSourcesOpen: false } : {}) });
    },
  }));
}
