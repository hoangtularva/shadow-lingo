import { useCallback, useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import type { Translation, TranslationAdapter, TranslationCache } from '../adapters';
import { alignTranslation } from '../align';
import { canUse } from '../features';
import { sentenceHash } from '../hash';
import type { CaptionTrack } from '../types';
import type { PanelStore } from './store';

/** Sentences translated around the spoken one: one before, eight ahead. */
const BEFORE = 1;
const AHEAD = 8;

interface Options {
  store: PanelStore;
  translation: TranslationAdapter | null | undefined;
  cache: TranslationCache | null | undefined;
  track: CaptionTrack | null;
  activeIndex: number;
  /** Vietnamese is wanted and possible (English track, feature on). */
  enabled: boolean;
}

export interface TranslationControls {
  /** Downloads the language pack; must run from a click. */
  download(): void;
  /** Saves the learner's own Vietnamese for a sentence. */
  saveEdit(text: string, vi: string): void;
}

/**
 * Vietnamese lines for the track: the video's human Vietnamese captions when the player
 * loaded them, cached lines, then on-device machine translation
 * of the spoken sentence and the next few, one at a time (the translator is sequential).
 */
export function useTranslation({
  store,
  translation,
  cache,
  track,
  activeIndex,
  enabled,
}: Options): TranslationControls {
  const translator = useStore(store, (s) => s.translator);
  const videoId = useStore(store, (s) => s.videoId) ?? '';
  const humanCues = useStore(store, (s) => s.humanCues);

  // Find out whether the translator can run; when the pack is already there, create it.
  useEffect(() => {
    if (!translation || !enabled) return;
    let cancelled = false;
    void (async () => {
      const state = await translation.state().catch(() => 'unsupported' as const);
      if (cancelled) return;
      if (state !== 'ready') {
        // A download started elsewhere still needs a click here to attach to it.
        store.getState().setTranslator(state === 'downloading' ? 'needs-download' : state);
        return;
      }
      const ok = await translation.prepare().catch(() => false);
      if (!cancelled) store.getState().setTranslator(ok ? 'ready' : 'needs-download');
    })();
    return () => {
      cancelled = true;
    };
  }, [translation, enabled, store]);

  // Lines saved on this device for this video (edited ones included).
  useEffect(() => {
    if (!cache || !track || !enabled) return;
    let cancelled = false;
    const hashes = [...new Set(track.sentences.map((s) => sentenceHash(s.text)))];
    cache
      .get(videoId, hashes)
      .then((found) => {
        if (!cancelled) store.getState().addTranslations(found);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [cache, track, videoId, enabled, store]);

  // Human Vietnamese captions win over machine lines (never over the learner's own).
  // Kept in memory only: they come from the player every time.
  useEffect(() => {
    if (!track || !humanCues || !enabled || !canUse('humanSubtitles')) return;
    store.getState().addTranslations(alignTranslation(track.sentences, humanCues));
  }, [track, humanCues, enabled, store]);

  // One worker translates a queue, newest window first: the translator is sequential.
  const queue = useRef<{ text: string; hash: string }[]>([]);
  const running = useRef(false);
  const generation = useRef(0);

  // A new track, translator or video drops whatever was queued for the old one.
  useEffect(() => {
    generation.current += 1;
    queue.current = [];
    running.current = false;
  }, [translation, track, videoId]);

  useEffect(() => {
    if (!translation || !track || !enabled || translator !== 'ready') return;
    const at = Math.max(0, activeIndex);
    const spoken = track.sentences[at];
    const window = [
      ...(spoken ? [spoken] : []),
      ...track.sentences.slice(at + 1, at + AHEAD + 1),
      ...track.sentences.slice(Math.max(0, at - BEFORE), at),
      // Then the rest of the video, so every row gets its line without waiting for playback:
      // further ahead first, then the sentences already passed (nearest first).
      ...track.sentences.slice(at + AHEAD + 1),
      ...track.sentences.slice(0, Math.max(0, at - BEFORE)).reverse(),
    ];
    const known = store.getState().translations;
    const wanted = window
      .map((s) => ({ text: s.text, hash: sentenceHash(s.text) }))
      .filter((s) => !(s.hash in known));
    const fresh = new Set(wanted.map((s) => s.hash));
    queue.current = [...wanted, ...queue.current.filter((q) => !fresh.has(q.hash))];
    if (running.current || queue.current.length === 0) return;

    running.current = true;
    const gen = generation.current;
    void (async () => {
      while (gen === generation.current) {
        const next = queue.current.shift();
        if (!next) break;
        if (next.hash in store.getState().translations) continue;
        try {
          const vi = (await translation.translate(next.text)).trim();
          // Dropped meanwhile, or the learner edited this line: keep theirs.
          if (gen !== generation.current || !vi || next.hash in store.getState().translations) {
            continue;
          }
          const entry: Record<string, Translation> = { [next.hash]: { vi, source: 'machine' } };
          store.getState().addTranslations(entry);
          void cache?.put(videoId, entry).catch(() => undefined);
        } catch {
          // One failed sentence must not stop the others.
        }
      }
      if (gen === generation.current) running.current = false;
    })();
  }, [translation, cache, track, activeIndex, enabled, translator, videoId, store]);

  const download = useCallback(() => {
    if (!translation) return;
    store.getState().setTranslator('downloading', 0);
    translation
      .prepare((p) => store.getState().setTranslator('downloading', p))
      .then((ok) => store.getState().setTranslator(ok ? 'ready' : 'needs-download'))
      .catch(() => store.getState().setTranslator('needs-download'));
  }, [translation, store]);

  const saveEdit = useCallback(
    (text: string, vi: string) => {
      const clean = vi.trim();
      if (!clean) return;
      const entry: Record<string, Translation> = {
        [sentenceHash(text)]: { vi: clean, source: 'edited' },
      };
      store.getState().addTranslations(entry);
      void cache?.put(videoId, entry).catch(() => undefined);
    },
    [cache, videoId, store],
  );

  return { download, saveEdit };
}
