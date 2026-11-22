import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { useStore } from 'zustand';
import type {
  AdsAdapter,
  CaptionsAdapter,
  PlayerAdapter,
  PosAdapter,
  PronunciationAdapter,
  RecorderAdapter,
  TranslationAdapter,
  TranslationCache,
} from '../adapters';
import { canUse } from '../features';
import { headwordOf, type DictionaryAdapter } from '../dict';
import {
  canQuiz,
  dayKey,
  reviewQueue,
  entriesToRestore,
  parseBackup,
  scheduleAnswer,
  sortVocab,
  videoLink,
  vocabToBackup,
  type ReviewLog,
  VOCAB_LIMITS,
  type VocabEntry,
  type VocabStore,
} from '../vocab';
import { Review } from './Review';
import { AdNote } from './AdNote';
import { Notebook } from './Notebook';
import { wordKeys, type AnnotatedWord } from '../ipa';
import { buildTrack, isEnglish } from '../tracks';
import type { CaptionTrack } from '../types';
import { EmptyState } from './EmptyState';
import { Wordmark } from './Logo';
import { SentenceList } from './SentenceList';
import { ShadowingSection, useShadowing } from './Shadowing';
import { useTranslation } from './useTranslation';
import { useWordCard, type OpenWordCard } from './useWordCard';
import { WordCard } from './WordCard';
import { sentenceHash } from '../hash';
import { PosLegend } from './WordLine';
import type { PanelStore } from './store';
import { vi } from './strings';

export interface PanelProps {
  store: PanelStore;
  player: PlayerAdapter | null;
  /** Pointer down on the header: lets the host start a drag. */
  onHeaderPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** The shadowing section was folded or unfolded by the user. */
  onShadowingCollapsedChange?: (collapsed: boolean) => void;
  /** Extra header controls supplied by the host (e.g. "dock back"). */
  headerExtra?: ReactNode;
  /** Collapse and close buttons (the extension's floating panel); the desktop app has none. */
  windowControls?: boolean;
  /** Why machine translation is off on this host (default: the Chrome version note). */
  translatorUnsupportedNote?: string;
  /** Source of IPA pronunciations; without it no IPA is shown. */
  pronunciation?: PronunciationAdapter | null;
  /** Part-of-speech tagger; without it words keep the text colour. */
  pos?: PosAdapter | null;
  /** Microphone recorder for shadowing; without it only replay and speed are shown. */
  recorder?: RecorderAdapter | null;
  /** The player's CC switch; lets the empty state remind the learner to turn it on. */
  captions?: CaptionsAdapter | null;
  /** Whether the player shows an ad: a friendly note explains why it is not skipped. */
  ads?: AdsAdapter | null;
  /** On-device EN→VI translator; without it no Vietnamese line is shown. */
  translation?: TranslationAdapter | null;
  /** Where Vietnamese lines (machine and edited) are kept on the device. */
  translationCache?: TranslationCache | null;
  /** Bundled Wiktionary definitions; clicking a spoken word opens its card. */
  dictionary?: DictionaryAdapter | null;
  /** The learner's notebook on the device; without it there is no "Sổ từ vựng" tab. */
  vocab?: VocabStore | null;
  /** Title of the open video, saved with each word. */
  getVideoTitle?: () => string;
}

const cut = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

/** A notebook entry for the open word card, with the sentence it was met in. */
function entryFromCard(
  card: OpenWordCard,
  annotated: readonly AnnotatedWord[] | null,
  sentence: { text: string; start: number } | undefined,
  videoId: string,
  title: string,
  vietnamese: string | undefined,
  viFrom: 'wiktionary' | 'machine' | null,
): VocabEntry | null {
  const entry = card.lookup?.entry;
  if (!entry) return null;
  const headword = cut(entry.headword, VOCAB_LIMITS.headword);
  const words = annotated?.map((w) => `${w.before.trim()}${w.text}${w.after.trim()}`);
  const text = words?.join(' ') ?? sentence?.text ?? '';
  return {
    id: headword,
    headword,
    ...(entry.lemma ? { lemma: cut(entry.lemma, VOCAB_LIMITS.headword) } : {}),
    ...(cardIpa(card, annotated)
      ? { ipa: cut(cardIpa(card, annotated) ?? '', VOCAB_LIMITS.text) }
      : {}),
    ...(entry.senses[0] ? { pos: entry.senses[0].pos } : {}),
    ...(vietnamese ? { vi: cut(vietnamese, VOCAB_LIMITS.text) } : {}),
    ...(vietnamese && viFrom ? { viFrom } : {}),
    senses: entry.senses.slice(0, VOCAB_LIMITS.senses).map((s) => ({
      pos: s.pos,
      gloss: cut(s.gloss, VOCAB_LIMITS.text),
      ...(s.example ? { example: cut(s.example, VOCAB_LIMITS.text) } : {}),
    })),
    ...(text && text.length <= VOCAB_LIMITS.sentence
      ? {
          context: {
            text,
            words: card.words.filter((i) => i < VOCAB_LIMITS.words),
            start: Math.max(0, sentence?.start ?? 0),
            videoId: /^[\w-]{1,64}$/.test(videoId) ? videoId : '',
            title: cut(title, VOCAB_LIMITS.title),
          },
        }
      : {}),
    addedAt: Date.now(),
  };
}

/** IPA of the words a card covers, leaving out a pronoun inside the phrase ("figure it out"). */
function cardIpa(card: OpenWordCard, words: readonly AnnotatedWord[] | null): string | undefined {
  if (!words) return undefined;
  const parts = new Set(card.headword.split(' '));
  const lemma = card.lookup?.entry.lemma;
  const ipa = card.words
    .filter((i, k) => {
      const h = headwordOf(words[i]?.text ?? '');
      return k === 0 || parts.has(h) || h === lemma;
    })
    .map((i) => words[i]?.ipa)
    .filter((x): x is string => !!x);
  return ipa.length > 0 ? ipa.join(' ') : undefined;
}

/** Keys per lookup request, so one huge track does not block the dictionary. */
const LOOKUP_BATCH = 1500;
/** Sentences tagged ahead of the spoken one. */
const POS_LOOKAHEAD = 3;

function sourceLabel(track: CaptionTrack): string {
  if (track.source === 'file') return vi.sourceFile;
  if (track.source === 'paste') return vi.sourcePaste;
  return track.kind === 'asr' ? vi.sourceAsr : vi.sourceManual;
}

function DragDots() {
  return (
    <svg
      width="14"
      height="20"
      viewBox="0 0 14 20"
      className="shrink-0 text-subtle"
      aria-hidden="true"
    >
      {[5, 10, 15].map((y) => (
        <g key={y} fill="currentColor">
          <circle cx="4" cy={y} r="1.5" />
          <circle cx="10" cy={y} r="1.5" />
        </g>
      ))}
    </svg>
  );
}

function IconButton({
  label,
  onClick,
  expanded,
  testId,
  children,
}: {
  label: string;
  onClick(): void;
  expanded?: boolean;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="flex size-8 items-center justify-center rounded-lg text-secondary hover:bg-surface hover:text-fg"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      title={label}
      data-testid={testId}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

function Chip({
  on,
  onClick,
  testId,
  disabled,
  title,
  children,
}: {
  on: boolean;
  onClick(): void;
  testId: string;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={
        'h-7 flex-none rounded-[14px] border px-[9px] text-xs whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 @max-[400px]:px-2 ' +
        (on && !disabled
          ? 'border-chip-edge bg-chip-bg font-semibold text-chip-fg'
          : 'border-chip-off bg-transparent font-medium text-secondary hover:text-fg')
      }
    >
      {children}
    </button>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)
  );
}

export function Panel({
  store,
  player,
  onHeaderPointerDown,
  onCollapsedChange,
  onShadowingCollapsedChange,
  headerExtra,
  windowControls = true,
  translatorUnsupportedNote = vi.translatorUnsupported,
  pronunciation,
  pos,
  recorder,
  captions,
  translation,
  translationCache,
  dictionary,
  vocab: vocabStore,
  getVideoTitle,
  ads,
}: PanelProps) {
  const track = useStore(store, (s) => s.track);
  const status = useStore(store, (s) => s.status);
  const activeIndex = useStore(store, (s) => s.activeIndex);
  const collapsed = useStore(store, (s) => s.collapsed);
  const autoScroll = useStore(store, (s) => s.autoScroll);
  const theme = useStore(store, (s) => s.theme);
  const notice = useStore(store, (s) => s.notice);
  const pronunciations = useStore(store, (s) => s.pronunciations);
  const showIpa = useStore(store, (s) => s.showIpa);
  const showLinking = useStore(store, (s) => s.showLinking);
  const showPos = useStore(store, (s) => s.showPos);
  const posTags = useStore(store, (s) => s.posTags);
  const hidden = useStore(store, (s) => s.hidden);
  const shadowingCollapsed = useStore(store, (s) => s.shadowingCollapsed);
  const otherSourcesOpen = useStore(store, (s) => s.otherSourcesOpen);
  const videoId = useStore(store, (s) => s.videoId);
  // IPA and tips are for English text only; a player track in another language gets none.
  const englishText = !track || track.source !== 'player' || isEnglish(track.lang);
  const ipaAvailable = !!pronunciation && canUse('ipa') && englishText;
  const posAvailable = !!pos && ipaAvailable && canUse('posColors');
  const posOn = posAvailable && showPos;
  const showEnglish = useStore(store, (s) => s.showEnglish);
  const showVietnamese = useStore(store, (s) => s.showVietnamese);
  const translations = useStore(store, (s) => s.translations);
  const translator = useStore(store, (s) => s.translator);
  const translatorProgress = useStore(store, (s) => s.translatorProgress);
  // Vietnamese lines are for English tracks; the chips show even when the browser cannot translate.
  const viFeature = !!translation && canUse('bilingual') && englishText;
  const hasHuman = useMemo(
    () => Object.values(translations).some((t) => t.source === 'human'),
    [translations],
  );
  // Human Vietnamese captions work even where the browser cannot translate.
  const viOn = viFeature && showVietnamese && (translator !== 'unsupported' || hasHuman);
  const englishOn = !viOn || showEnglish;
  const { download, saveEdit } = useTranslation({
    store,
    translation: viFeature ? translation : null,
    cache: translationCache,
    track,
    activeIndex,
    enabled: viFeature && showVietnamese,
  });
  const spoken = track?.sentences[Math.max(0, activeIndex)];
  const lookupOn = !!dictionary && canUse('wordLookup') && englishText;
  const wordCard = useWordCard({
    dictionary: lookupOn ? dictionary : null,
    translation: viFeature ? translation : null,
    translator,
    // Untimed transcripts: the list tracks the picked sentence and shows the card there.
    spokenId: track?.timed ? spoken?.id : undefined,
  });
  const vocabOn = !!vocabStore && canUse('vocabulary');
  const tab = useStore(store, (s) => (vocabOn ? s.tab : 'captions'));
  const vocabEntries = useStore(store, (s) => s.vocab);
  const savedIds = useMemo(() => new Set((vocabEntries ?? []).map((e) => e.id)), [vocabEntries]);
  const [reviewLog, setReviewLog] = useState<ReviewLog>({});
  // Short messages in the notebook tab (the captions tab has its own notice line).
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 5000);
    return () => window.clearTimeout(t);
  }, [flash]);
  const say = useCallback(
    (msg: string) => {
      if (store.getState().tab === 'vocab') {
        setFlash(msg);
        return;
      }
      // Short-lived in the captions tab too; a newer notice is left alone.
      store.getState().setNotice(msg);
      window.setTimeout(() => {
        if (store.getState().notice === msg) store.getState().setNotice(null);
      }, 5000);
    },
    [store],
  );
  // The notebook may change in another tab: read it again when its tab opens.
  useEffect(() => {
    if (!vocabOn || !vocabStore) return;
    let alive = true;
    Promise.all([vocabStore.list(), vocabStore.reviewLog().catch(() => ({}))])
      .then(([list, log]) => {
        if (!alive) return;
        store.getState().setVocab(list);
        setReviewLog(log);
      })
      .catch(() => {
        if (alive) say(vi.vocabFailed);
      });
    return () => {
      alive = false;
    };
  }, [vocabOn, vocabStore, tab, store, say]);
  const saveEntry = (entry: VocabEntry) => {
    if (!vocabStore) return;
    const rest = (store.getState().vocab ?? []).filter((e) => e.id !== entry.id);
    store.getState().setVocab([entry, ...rest]);
    vocabStore.put(entry).catch(() => {
      store.getState().setVocab(rest);
      say(vi.vocabFailed);
    });
  };
  const removeEntry = (id: string) => {
    if (!vocabStore) return;
    const before = store.getState().vocab ?? [];
    store.getState().setVocab(before.filter((e) => e.id !== id));
    vocabStore.remove(id).catch(() => {
      store.getState().setVocab(before);
      say(vi.vocabFailed);
    });
  };
  const reviewOn = vocabOn && canUse('vocabReview');
  const [session, setSession] = useState<VocabEntry[] | null>(null);
  const reviewState = useStore(store, (s) => s.review);
  const endReview = useCallback(() => {
    setSession(null);
    store.getState().setReview(null);
  }, [store]);
  const onReviewProgress = useCallback(
    (done: number, total: number) => store.getState().setReview({ done, total }),
    [store],
  );
  const answer = (entry: VocabEntry, correct: boolean): number => {
    const list = store.getState().vocab ?? [];
    const current = list.find((e) => e.id === entry.id) ?? entry;
    const now = Date.now();
    const { entry: updated, nextInMs } = scheduleAnswer(current, correct, now);
    store.getState().setVocab(list.map((e) => (e.id === updated.id ? updated : e)));
    vocabStore?.put(updated).catch(() => say(vi.vocabFailed));
    const day = dayKey(now);
    setReviewLog((log) => ({ ...log, [day]: (log[day] ?? 0) + 1 }));
    vocabStore?.logReview(day).catch(() => undefined);
    return nextInMs;
  };
  const playSentence = (entry: VocabEntry) => {
    const ctx = entry.context;
    if (!ctx?.videoId) return;
    const sentence = track?.sentences.find((s) => s.start === ctx.start);
    if (player && track?.timed && ctx.videoId === videoId && sentence) {
      player.seekTo(sentence.start);
      player.play();
      const ms = (sentence.end - sentence.start) / Math.max(0.25, player.getPlaybackRate());
      window.setTimeout(() => player.pause(), ms);
      return;
    }
    const link = videoLink(ctx);
    if (link) window.open(link, '_blank', 'noopener');
  };
  const speak =
    typeof window !== 'undefined' && 'speechSynthesis' in window
      ? (text: string) => {
          // On-device voices only: online voices would send the word to a server.
          const voice = window.speechSynthesis
            .getVoices()
            .find((v) => v.localService && v.lang.toLowerCase().startsWith('en'));
          if (!voice) {
            say(vi.noVoice);
            return;
          }
          const u = new SpeechSynthesisUtterance(text);
          u.voice = voice;
          u.lang = voice.lang;
          u.rate = 0.9;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(u);
        }
      : undefined;
  const backup = () => vocabToBackup(store.getState().vocab ?? [], reviewLog, Date.now());
  const restore = async (text: string) => {
    const data = parseBackup(text);
    if (!data || !vocabStore) {
      say(vi.restoreBad);
      return;
    }
    const todo = entriesToRestore(store.getState().vocab ?? [], data.entries);
    try {
      for (const e of todo) await vocabStore.put(e);
      store.getState().setVocab(sortVocab(await vocabStore.list()));
      say(todo.length > 0 ? vi.restoreDone(todo.length) : vi.restoreNone);
    } catch {
      say(vi.vocabFailed);
    }
  };
  // When the ad started: due words are counted at that moment.
  const [ad, setAd] = useState(() => ({ showing: ads?.isShowing() ?? false, at: Date.now() }));
  useEffect(() => ads?.onChange((showing) => setAd({ showing, at: Date.now() })), [ads]);
  const adNoteOn = ad.showing && canUse('adNote');
  const adQueue = useMemo(
    () =>
      adNoteOn && reviewOn && vocabEntries && canQuiz(vocabEntries)
        ? reviewQueue(vocabEntries, ad.at)
        : [],
    [adNoteOn, reviewOn, vocabEntries, ad.at],
  );
  const reviewDuringAd = () => {
    store.getState().setTab('vocab');
    setSession(adQueue);
  };
  const jumpTo = (entry: VocabEntry): boolean => {
    const ctx = entry.context;
    if (!ctx || !player || !track?.timed || !ctx.videoId || ctx.videoId !== videoId) return false;
    store.getState().setTab('captions');
    seek(ctx.start);
    return true;
  };
  const selectedWords = useMemo(
    () => (wordCard.card ? new Set(wordCard.card.words) : undefined),
    [wordCard.card],
  );
  const spokenTranslation = spoken ? translations[sentenceHash(spoken.text)] : undefined;
  // The header names the Vietnamese source only once there is a Vietnamese line to name.
  const viBadge = viOn && Object.keys(translations).length > 0;
  // Named after the spoken line; before it has one, after the best source the video has.
  const viSource = spokenTranslation?.source ?? (hasHuman ? 'human' : 'machine');
  // Tags also pick homograph readings in the IPA, so tag while either is shown.
  const tagging = !!pos && ipaAvailable && (posOn || showIpa);
  const shadowingOn = !!player && !!track?.timed && track.sentences.length > 0;
  const sh = useShadowing({
    store,
    player: shadowingOn ? player : null,
    recorder,
    sentences: track?.timed ? track.sentences : null,
    activeIndex,
  });

  // Tag the spoken sentence and the next few, once each (cheap, done in the background).
  useEffect(() => {
    if (!pos || !tagging || !track) return;
    const known = store.getState().posTags;
    const start = Math.max(0, activeIndex);
    const wanted = track.sentences
      .slice(start, start + POS_LOOKAHEAD)
      .map((s) => s.text)
      .filter((t) => !(t in known));
    if (wanted.length === 0) return;
    let cancelled = false;
    pos
      .tag(wanted)
      .then((found) => {
        if (!cancelled) store.getState().addPosTags(found);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pos, tagging, track, activeIndex, store]);

  // Look up every new word of the track once; results are kept across videos.
  useEffect(() => {
    if (!pronunciation || !track || !canUse('ipa') || !englishText) return;
    let cancelled = false;
    const known = store.getState().pronunciations;
    const keys = new Set<string>();
    for (const s of track.sentences)
      for (const k of wordKeys(s.text)) if (!(k in known)) keys.add(k);
    const all = [...keys];
    void (async () => {
      for (let i = 0; i < all.length && !cancelled; i += LOOKUP_BATCH) {
        try {
          const found = await pronunciation.lookup(all.slice(i, i + LOOKUP_BATCH));
          if (!cancelled) store.getState().addPronunciations(found);
        } catch {
          // Keep a more specific notice (e.g. "extension updated, reload") if one is shown.
          if (!cancelled && !store.getState().notice) store.getState().setNotice(vi.ipaFailed);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pronunciation, track, store, englishText]);

  useEffect(() => {
    if (!player) return;
    // During an ad the player reports the ad's time: keep the sentence the learner was on.
    if (!ads?.isShowing()) store.getState().setTime(player.getCurrentTime());
    return player.onTimeUpdate((ms) => {
      if (!ads?.isShowing()) store.getState().setTime(ms);
    });
  }, [player, store, ads]);

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
    if (e.key === 'Escape' && wordCard.card && !isTypingTarget(e.target)) {
      e.preventDefault();
      wordCard.close();
      return;
    }
    if (!track?.timed || !player || isTypingTarget(e.target)) return;
    const list = track.sentences;
    const at = Math.max(0, activeIndex);
    let target: number | undefined;
    if (e.key === 'ArrowDown') target = list[Math.min(list.length - 1, at + 1)]?.start;
    else if (e.key === 'ArrowUp') target = list[Math.max(0, at - 1)]?.start;
    else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      sh.replay();
      return;
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      sh.toggleRecord();
      return;
    } else if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      sh.compare();
      return;
    } else if ((e.key === 'l' || e.key === 'L') && ipaAvailable && canUse('linking')) {
      e.preventDefault();
      store.getState().setShowLinking(!showLinking);
      return;
    } else if ((e.key === 'i' || e.key === 'I') && ipaAvailable) {
      e.preventDefault();
      store.getState().setShowIpa(!showIpa);
      return;
    } else if (e.key === ' ') {
      e.preventDefault();
      if (player.isPaused()) player.play();
      else player.pause();
      return;
    } else return;
    e.preventDefault();
    if (target !== undefined) seek(target);
  };

  const showOtherLanguage = track?.source === 'player' && !isEnglish(track.lang);
  if (hidden) return null;

  return (
    <section
      className={
        'sl-root flex h-full flex-col overflow-hidden rounded-2xl border border-edge bg-bg font-sans text-fg shadow-panel ' +
        (theme === 'dark' ? 'dark' : '')
      }
      data-theme={theme}
      data-testid="sl-panel"
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <header
        className="flex h-[52px] shrink-0 cursor-grab items-center gap-2.5 border-b border-line pr-3 pl-4 active:cursor-grabbing"
        onPointerDown={onHeaderPointerDown}
        title={onHeaderPointerDown ? vi.dragHint : undefined}
        data-testid="sl-header"
      >
        {onHeaderPointerDown && <DragDots />}
        <Wordmark />
        {tab === 'vocab' && (
          <span
            className="truncate rounded-[10px] border border-chip-off px-2 py-0.5 text-[11px] leading-4 whitespace-nowrap text-secondary"
            data-testid="sl-source"
          >
            {session && reviewState
              ? vi.reviewBadge(reviewState.done, reviewState.total)
              : vi.vocabBadge(vocabEntries?.length ?? 0)}
          </span>
        )}
        {track && tab === 'captions' && (
          <span
            className="truncate rounded-[10px] border border-chip-off px-2 py-0.5 text-[11px] leading-4 whitespace-nowrap text-secondary"
            title={
              viBadge
                ? viSource === 'human'
                  ? vi.viBadgeHumanTitle(sourceLabel(track))
                  : vi.viBadgeTitle(sourceLabel(track))
                : sourceLabel(track)
            }
            data-testid="sl-source"
          >
            {viBadge
              ? viSource === 'edited'
                ? vi.viBadgeEdited
                : viSource === 'human'
                  ? vi.viBadgeHuman
                  : vi.viBadgeMachine
              : sourceLabel(track)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
          {headerExtra}
          {windowControls && (
            <>
              <IconButton
                label={collapsed ? vi.expand : vi.collapse}
                onClick={toggleCollapsed}
                expanded={!collapsed}
                testId="sl-collapse"
              >
                {collapsed ? (
                  <path
                    d="M3 8 H13 M8 3 V13"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d="M3 8 H13"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                )}
              </IconButton>
              <IconButton
                label={vi.close}
                onClick={() => store.getState().setHidden(true)}
                testId="sl-close"
              >
                <path
                  d="M4 4 L12 12 M12 4 L4 12"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </IconButton>
            </>
          )}
        </div>
      </header>

      {!collapsed && (
        <>
          {vocabOn && (
            <div
              className="flex shrink-0 gap-1 border-b border-line px-3 pt-2"
              role="tablist"
              aria-label={vi.tabsLabel}
            >
              {(['captions', 'vocab'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => store.getState().setTab(t)}
                  className={
                    'h-9 border-b-2 px-3.5 text-[13px] transition-colors duration-150 ' +
                    (tab === t
                      ? 'border-accent font-semibold text-fg'
                      : 'border-transparent font-medium text-muted hover:text-fg')
                  }
                  data-testid={`sl-tab-${t}`}
                >
                  {t === 'captions' ? vi.tabCaptions : vi.tabVocab(vocabEntries?.length ?? 0)}
                </button>
              ))}
            </div>
          )}
          {tab === 'vocab' && flash && (
            <p
              className="shrink-0 border-b border-line bg-surface px-4 py-2 text-xs text-secondary"
              role="status"
              data-testid="sl-vocab-flash"
            >
              {flash}
            </p>
          )}
          {tab === 'vocab' && session ? (
            <Review
              queue={session}
              pool={vocabEntries ?? session}
              onAnswer={answer}
              onExit={endReview}
              onProgress={onReviewProgress}
              onPlaySentence={playSentence}
              onSpeak={speak}
            />
          ) : tab === 'vocab' ? (
            <Notebook
              entries={vocabEntries}
              videoId={videoId}
              onRemove={removeEntry}
              onJump={jumpTo}
              onStartReview={reviewOn ? setSession : undefined}
              reviewLog={reviewOn ? reviewLog : undefined}
              onBackup={backup}
              onRestore={(t) => void restore(t)}
            />
          ) : (
            <>
              {track && (ipaAvailable || viFeature) && (
                <div
                  className="@container flex shrink-0 flex-wrap items-center gap-1 border-b border-line px-4 py-3"
                  data-testid="sl-chips"
                >
                  {/* Narrow panels (YouTube's column is often ~380 px) drop the label so the chips fit. */}
                  <span className="mr-1 text-xs whitespace-nowrap text-secondary @max-[400px]:hidden">
                    {vi.show}
                  </span>
                  {viFeature && (
                    <Chip
                      on={englishOn}
                      onClick={() => store.getState().setShowEnglish(!showEnglish)}
                      disabled={!viOn}
                      testId="sl-en-toggle"
                    >
                      {vi.chipEnglish}
                    </Chip>
                  )}
                  {ipaAvailable && (
                    <Chip
                      on={showIpa}
                      onClick={() => store.getState().setShowIpa(!showIpa)}
                      testId="sl-ipa-toggle"
                    >
                      {vi.chipIpa}
                    </Chip>
                  )}
                  {viFeature && (
                    <Chip
                      on={viOn}
                      onClick={() => store.getState().setShowVietnamese(!showVietnamese)}
                      disabled={translator === 'unsupported' && !hasHuman}
                      title={
                        translator === 'unsupported' && !hasHuman
                          ? translatorUnsupportedNote
                          : undefined
                      }
                      testId="sl-vi-toggle"
                    >
                      {vi.chipVietnamese}
                    </Chip>
                  )}
                  {posAvailable && (
                    <Chip
                      on={showPos}
                      onClick={() => store.getState().setShowPos(!showPos)}
                      testId="sl-pos-toggle"
                    >
                      {vi.chipPos}
                    </Chip>
                  )}
                  {canUse('linking') && (
                    <Chip
                      on={showLinking}
                      onClick={() => store.getState().setShowLinking(!showLinking)}
                      testId="sl-linking-toggle"
                    >
                      {vi.chipLinking}
                    </Chip>
                  )}
                </div>
              )}
              {(notice || showOtherLanguage || (track && !track.timed)) && (
                <p className="shrink-0 border-b border-line bg-surface px-4 py-2 text-xs text-secondary">
                  {notice ??
                    (showOtherLanguage && track ? vi.otherLanguage(track.lang) : vi.untimedNote)}
                </p>
              )}
              {adNoteOn && <AdNote dueCount={adQueue.length} onReview={reviewDuringAd} />}
              {track ? (
                <>
                  <SentenceList
                    dimmed={adNoteOn}
                    repeats={sh.repeats}
                    sentences={track.sentences}
                    activeIndex={activeIndex}
                    timed={track.timed}
                    autoScroll={autoScroll}
                    onSeek={seek}
                    pronunciations={ipaAvailable ? pronunciations : undefined}
                    showIpa={showIpa}
                    showLinking={showLinking}
                    posTags={tagging ? posTags : undefined}
                    showPos={posOn}
                    showEnglish={englishOn}
                    translations={viOn ? translations : undefined}
                    translator={translator}
                    translatorProgress={translatorProgress}
                    onDownloadTranslator={download}
                    onEditTranslation={canUse('editTranslation') ? saveEdit : undefined}
                    onWordClick={lookupOn ? wordCard.open : undefined}
                    selectedWords={selectedWords}
                    wordCard={
                      wordCard.card
                        ? (sentenceId, annotated) => {
                            const c = wordCard.card;
                            if (!c || c.sentenceId !== sentenceId) return null;
                            const entry = c.lookup?.entry;
                            const viWords = entry?.vi ?? [];
                            return (
                              <WordCard
                                headword={c.headword}
                                status={c.status}
                                lemma={entry?.lemma}
                                ipa={cardIpa(c, annotated)}
                                senses={entry?.senses ?? []}
                                vietnamese={viWords.length > 0 ? viWords.join(', ') : c.machineVi}
                                viFrom={
                                  viWords.length > 0 ? 'wiktionary' : c.machineVi ? 'machine' : null
                                }
                                onClose={wordCard.close}
                                onSpeak={speak ? () => speak(c.headword) : undefined}
                                saved={savedIds.has(c.headword)}
                                onSave={
                                  vocabOn
                                    ? () => {
                                        const vietnamese =
                                          viWords.length > 0 ? viWords.join(', ') : c.machineVi;
                                        const e = entryFromCard(
                                          c,
                                          annotated,
                                          track.sentences.find((x) => x.id === c.sentenceId),
                                          videoId ?? '',
                                          getVideoTitle?.() ?? '',
                                          vietnamese,
                                          viWords.length > 0
                                            ? 'wiktionary'
                                            : c.machineVi
                                              ? 'machine'
                                              : null,
                                        );
                                        if (e) saveEntry(e);
                                      }
                                    : undefined
                                }
                              />
                            );
                          }
                        : undefined
                    }
                  />
                  {posOn && <PosLegend />}
                  {shadowingOn && (
                    <ShadowingSection
                      sh={sh}
                      collapsed={shadowingCollapsed}
                      onCollapsedChange={(c) => {
                        store.getState().setShadowingCollapsed(c);
                        onShadowingCollapsedChange?.(c);
                      }}
                    />
                  )}
                  <footer className="flex shrink-0 items-center justify-between gap-3.5 border-t border-line px-4 py-2 text-[11px] leading-4 text-secondary">
                    <span data-testid="sl-count">{vi.sentenceCount(track.sentences.length)}</span>
                    <button
                      type="button"
                      className="rounded-md px-2 py-1 hover:bg-surface hover:text-fg"
                      onClick={() => store.getState().chooseOtherSource()}
                      data-testid="sl-other-source"
                    >
                      {vi.useOtherSource}
                    </button>
                  </footer>
                </>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <EmptyState
                    // A new video (or "Dùng nguồn khác") starts from a fresh empty state.
                    key={`${videoId ?? ''}:${String(otherSourcesOpen)}`}
                    status={status === 'idle' ? 'idle' : 'waiting'}
                    onText={loadText}
                    captions={captions}
                    otherSourcesOpen={otherSourcesOpen}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
