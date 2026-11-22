import type { Translation, TranslationCache } from '@shadow-lingo/core';
import { openDb, type ShadowLingoDb } from './db';

/** Background side: the IndexedDB store. */
export function createDexieTranslationCache(
  db: ShadowLingoDb | string = 'shadowlingo',
): TranslationCache {
  if (typeof db === 'string') db = openDb(db);
  const d = db;
  return {
    async get(videoId, hashes) {
      const rows = await d.translations.bulkGet(
        hashes.map((h) => [videoId, h] as [string, string]),
      );
      const out: Record<string, Translation> = {};
      for (const r of rows) if (r) out[r.hash] = { vi: r.vi, source: r.source };
      return out;
    },
    async put(videoId, entries) {
      const at = Date.now();
      await d.transaction('rw', d.translations, async () => {
        for (const [hash, t] of Object.entries(entries)) {
          const old = await d.translations.get([videoId, hash]);
          // The learner's own line is never replaced by a machine one.
          if (old?.source === 'edited' && t.source !== 'edited') continue;
          await d.translations.put({ videoId, hash, vi: t.vi, source: t.source, at });
        }
      });
    },
  };
}
