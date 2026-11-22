import type { Translation, TranslationCache } from '@shadow-lingo/core';
import Dexie, { type Table } from 'dexie';

/** Background only: the extension's IndexedDB (kept out of the content script bundle). */
interface Row extends Translation {
  videoId: string;
  hash: string;
  /** Last change, ms since epoch. */
  at: number;
}

class TranslationDb extends Dexie {
  translations!: Table<Row, [string, string]>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ translations: '[videoId+hash], videoId, at' });
  }
}

/** Background side: the IndexedDB store. */
export function createDexieTranslationCache(name = 'shadowlingo'): TranslationCache {
  const db = new TranslationDb(name);
  return {
    async get(videoId, hashes) {
      const rows = await db.translations.bulkGet(
        hashes.map((h) => [videoId, h] as [string, string]),
      );
      const out: Record<string, Translation> = {};
      for (const r of rows) if (r) out[r.hash] = { vi: r.vi, source: r.source };
      return out;
    },
    async put(videoId, entries) {
      const at = Date.now();
      await db.transaction('rw', db.translations, async () => {
        for (const [hash, t] of Object.entries(entries)) {
          const old = await db.translations.get([videoId, hash]);
          // The learner's own line is never replaced by a machine one.
          if (old?.source === 'edited' && t.source !== 'edited') continue;
          await db.translations.put({ videoId, hash, vi: t.vi, source: t.source, at });
        }
      });
    },
  };
}
