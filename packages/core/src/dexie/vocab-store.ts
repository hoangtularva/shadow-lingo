import { isVocabEntry, sortVocab, type ReviewLog, type VocabStore } from '../vocab';
import type { ShadowLingoDb } from './db';

/** Days of review history kept. */
export const LOG_DAYS = 400;
/** Upper bound on notebook size, so one page cannot fill the disk. */
export const MAX_VOCAB = 20000;

/** The notebook in IndexedDB. */
export function createDexieVocabStore(db: ShadowLingoDb): VocabStore {
  return {
    async list() {
      const rows = await db.vocab.toArray();
      return sortVocab(rows.filter(isVocabEntry));
    },
    async put(entry) {
      if (!(await db.vocab.get(entry.id)) && (await db.vocab.count()) >= MAX_VOCAB) {
        throw new Error('notebook full');
      }
      await db.vocab.put(entry);
    },
    async remove(id) {
      await db.vocab.delete(id);
    },
    async reviewLog() {
      const out: ReviewLog = {};
      for (const r of await db.reviewLog.toArray()) out[r.day] = r.count;
      return out;
    },
    async logReview(day) {
      await db.transaction('rw', db.reviewLog, async () => {
        const row = await db.reviewLog.get(day);
        await db.reviewLog.put({ day, count: (row?.count ?? 0) + 1 });
        const days = await db.reviewLog.orderBy('day').primaryKeys();
        if (days.length > LOG_DAYS)
          await db.reviewLog.bulkDelete(days.slice(0, days.length - LOG_DAYS));
      });
    },
  };
}
