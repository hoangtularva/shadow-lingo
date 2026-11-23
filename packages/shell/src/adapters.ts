import {
  createDictionary,
  createDictPronunciation,
  normalizeWord,
  parseCmuDict,
  type PronunciationAdapter,
  type StorageAdapter,
} from '@shadow-lingo/core';

/** Files shipped next to the app pages (same layout as the extension package). */
async function appText(path: string): Promise<string> {
  const res = await fetch(new URL(path, document.baseURI));
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

/** CMU Dict, loaded on first use (2 MB). */
export function createAppPronunciation(): PronunciationAdapter {
  let inner: Promise<PronunciationAdapter> | null = null;
  return {
    async lookup(keys) {
      inner ??= appText('ipa/cmudict.txt')
        .then((t) => createDictPronunciation(parseCmuDict(t)))
        .catch((err: unknown) => {
          inner = null;
          throw err;
        });
      return (await inner).lookup(keys.map(normalizeWord).filter(Boolean));
    },
  };
}

/** Wiktionary shards, one first letter at a time. */
export function createAppDictionary() {
  return createDictionary((shard) => {
    if (!/^[a-z_]$/.test(shard)) return Promise.reject(new Error('bad shard'));
    return appText(`dict/${shard}.txt`);
  });
}

/** Small settings (display toggles, recent videos) in localStorage. */
export function createLocalStorageAdapter(prefix = 'shadowlingo:'): StorageAdapter {
  return {
    get<T>(key: string) {
      try {
        const raw = localStorage.getItem(prefix + key);
        return Promise.resolve(raw === null ? undefined : (JSON.parse(raw) as T));
      } catch {
        return Promise.resolve(undefined);
      }
    },
    set<T>(key: string, value: T) {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      } catch {
        // Storage full or blocked: settings are not critical.
      }
      return Promise.resolve();
    },
    remove(key: string) {
      try {
        localStorage.removeItem(prefix + key);
      } catch {
        // Same as above.
      }
      return Promise.resolve();
    },
  };
}
