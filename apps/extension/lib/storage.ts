import type { StorageAdapter } from '@shadow-lingo/core';

/** Minimal shape of chrome.storage.local that we use (also easy to fake in tests). */
export interface StorageArea {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string): Promise<void>;
}

/** StorageAdapter over chrome.storage.local. Failures (e.g. context invalidated) are swallowed. */
export function createExtensionStorage(area: StorageArea): StorageAdapter {
  return {
    async get<T>(key: string) {
      try {
        const items = await area.get(key);
        return items[key] as T | undefined;
      } catch {
        return undefined;
      }
    },
    async set<T>(key: string, value: T) {
      try {
        await area.set({ [key]: value });
      } catch {
        // Extension reloaded or storage unavailable; layout is not critical.
      }
    },
    async remove(key: string) {
      try {
        await area.remove(key);
      } catch {
        // Ignore, same as above.
      }
    },
  };
}
