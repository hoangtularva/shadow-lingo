/**
 * Platform adapters. Core never touches Chrome or Electron APIs; each app passes in
 * implementations of these interfaces.
 */

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
  /** Called on every time update (and on seek). */
  onTimeUpdate(listener: (ms: number) => void): Unsubscribe;
}

export interface TranslationRequest {
  text: string;
  from: string;
  to: string;
}

/** Machine translation running on the device. Not used by phase 1. */
export interface TranslationAdapter {
  isAvailable(from: string, to: string): Promise<boolean>;
  translate(request: TranslationRequest): Promise<string>;
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
