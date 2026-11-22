/**
 * Platform adapters. Core never touches Chrome or Electron APIs; each app passes in
 * implementations of these interfaces.
 */

import type { PronunciationDict, Pronunciations } from './ipa';
import type { PartOfSpeech } from './pos';

export type Unsubscribe = () => void;

/** Key-value storage on the user's device (chrome.storage.local, IndexedDB, files...). */
export interface StorageAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Controls and observes the video player. Times are in milliseconds. */
export interface PlayerAdapter {
  getCurrentTime(): number;
  seekTo(ms: number): void;
  play(): void;
  pause(): void;
  isPaused(): boolean;
  getPlaybackRate(): number;
  setPlaybackRate(rate: number): void;
  /** Called on every time update (and on seek). */
  onTimeUpdate(listener: (ms: number) => void): Unsubscribe;
}

/** Whether the player is showing captions ("unknown": no caption button found). */
export type CaptionsState = 'on' | 'off' | 'unknown';

/** The player's own captions (CC) switch. The player only loads captions while it is on. */
export interface CaptionsAdapter {
  getState(): CaptionsState;
  /** Presses the player's CC button. */
  turnOn(): void;
  onChange(listener: (state: CaptionsState) => void): Unsubscribe;
}

/** A recording of the learner's voice. The audio itself stays inside the recorder. */
export interface Recording {
  durationMs: number;
  /** Loudness per slice, 0..1, evenly spread over the recording. */
  peaks: number[];
}

export type RecorderStartResult =
  { ok: true } | { ok: false; reason: 'permission' | 'no-device' | 'failed' };

/**
 * Microphone recorder (shadowing). Keeps only the last recording, in memory, on the
 * device: recordings are never stored or sent anywhere.
 */
export interface RecorderAdapter {
  start(): Promise<RecorderStartResult>;
  /** Stops recording; null when nothing was recorded. */
  stop(): Promise<Recording | null>;
  /** Plays the last recording; resolves when it ends (false: nothing to play). */
  play(): Promise<boolean>;
  stopPlayback(): Promise<void>;
}

/**
 * State of the on-device EN→VI translator. "needs-download": the language pack must be
 * downloaded first, which browsers only allow right after a click.
 */
export type TranslatorState = 'unsupported' | 'needs-download' | 'downloading' | 'ready';

/** English → Vietnamese machine translation, on the device only. */
export interface TranslationAdapter {
  state(): Promise<TranslatorState>;
  /** Creates the translator (downloading if needed; call from a click). True when ready. */
  prepare(onProgress?: (fraction: number) => void): Promise<boolean>;
  translate(text: string): Promise<string>;
}

/** Where a Vietnamese line comes from. */
export type TranslationSource = 'machine' | 'human' | 'edited';

export interface Translation {
  vi: string;
  source: TranslationSource;
}

/** Translations kept on the device, by video and sentence hash. */
export interface TranslationCache {
  get(videoId: string, hashes: readonly string[]): Promise<Record<string, Translation>>;
  put(videoId: string, entries: Readonly<Record<string, Translation>>): Promise<void>;
}

/** In-memory cache (tests, and when no storage is available). */
export function createMemoryTranslationCache(): TranslationCache {
  const data = new Map<string, Translation>();
  return {
    get(videoId, hashes) {
      const out: Record<string, Translation> = {};
      for (const h of hashes) {
        const t = data.get(`${videoId}:${h}`);
        if (t) out[h] = t;
      }
      return Promise.resolve(out);
    },
    put(videoId, entries) {
      for (const [h, t] of Object.entries(entries)) data.set(`${videoId}:${h}`, { ...t });
      return Promise.resolve();
    },
  };
}

/** Word pronunciations (CMU Dict today). Lookups may be slow: they are batched. */
export interface PronunciationAdapter {
  /** Takes normalized word keys; every requested key is in the result (null = unknown). */
  lookup(keys: readonly string[]): Promise<Record<string, Pronunciations | null>>;
}

/** Part-of-speech tagging, one class (or null) per word of each sentence. */
export interface PosAdapter {
  /** Keys of the result are the given sentence texts. */
  tag(sentences: readonly string[]): Promise<Record<string, (PartOfSpeech | null)[]>>;
}

/** Adapter over an in-process tagger (tests, desktop). */
export function createLocalPos(tagSentence: (text: string) => (PartOfSpeech | null)[]): PosAdapter {
  return {
    tag(sentences) {
      const out: Record<string, (PartOfSpeech | null)[]> = {};
      for (const s of sentences) out[s] = tagSentence(s);
      return Promise.resolve(out);
    },
  };
}

/** Adapter over an in-process dictionary (tests, desktop). */
export function createDictPronunciation(dict: PronunciationDict): PronunciationAdapter {
  return {
    lookup(keys) {
      const out: Record<string, Pronunciations | null> = {};
      for (const k of keys) out[k] = dict.lookup(k);
      return Promise.resolve(out);
    },
  };
}

/** In-memory storage, used by tests and as a safe fallback. */
export function createMemoryStorage(initial: Record<string, unknown> = {}): StorageAdapter {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    get<T>(key: string) {
      return Promise.resolve(data.get(key) as T | undefined);
    },
    set<T>(key: string, value: T) {
      data.set(key, structuredClone(value));
      return Promise.resolve();
    },
    remove(key: string) {
      data.delete(key);
      return Promise.resolve();
    },
  };
}
