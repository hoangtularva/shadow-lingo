import {
  isDayKey,
  isReviewLog,
  isVocabEntry,
  sortVocab,
  VOCAB_LIMITS,
  type ReviewLog,
  type VocabStore,
} from '@shadow-lingo/core';
import type { ShadowLingoDb } from './db';

/** Content script → background: the learner's notebook, kept in the extension's IndexedDB. */
export const VOCAB_LIST = 'shadow-lingo:vocab-list';
export const VOCAB_PUT = 'shadow-lingo:vocab-put';
export const VOCAB_REMOVE = 'shadow-lingo:vocab-remove';
export const VOCAB_LOG = 'shadow-lingo:vocab-log';
export const VOCAB_LOG_ADD = 'shadow-lingo:vocab-log-add';
/** Days of review history kept. */
export const LOG_DAYS = 400;
/** Upper bound on notebook size, so one page cannot fill the disk. */
export const MAX_VOCAB = 20000;

export type VocabRequest =
  | { type: typeof VOCAB_LIST }
  | { type: typeof VOCAB_PUT; entry: unknown }
  | { type: typeof VOCAB_REMOVE; id: string }
  | { type: typeof VOCAB_LOG }
  | { type: typeof VOCAB_LOG_ADD; day: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function isVocabRequest(v: unknown): v is VocabRequest {
  if (!isRecord(v)) return false;
  if (v.type === VOCAB_LIST || v.type === VOCAB_LOG) return true;
  if (v.type === VOCAB_LOG_ADD) return isDayKey(v.day);
  if (v.type === VOCAB_PUT) return isVocabEntry(v.entry);
  if (v.type === VOCAB_REMOVE) {
    return typeof v.id === 'string' && v.id.length > 0 && v.id.length <= VOCAB_LIMITS.headword;
  }
  return false;
}

/** Background side: IndexedDB rows. */
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

export function createVocabHandler(store: VocabStore) {
  return async (req: VocabRequest): Promise<{ ok: boolean; result?: unknown }> => {
    try {
      if (req.type === VOCAB_LIST) return { ok: true, result: await store.list() };
      if (req.type === VOCAB_LOG) return { ok: true, result: await store.reviewLog() };
      if (req.type === VOCAB_LOG_ADD) {
        await store.logReview(req.day);
        return { ok: true };
      }
      if (req.type === VOCAB_PUT) {
        if (!isVocabEntry(req.entry)) return { ok: false };
        await store.put(req.entry);
        return { ok: true };
      }
      await store.remove(req.id);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  };
}

type Send = (message: VocabRequest) => Promise<unknown>;

function okOf(res: unknown): boolean {
  return isRecord(res) && res.ok === true;
}

/** Content side: the panel's VocabStore, over runtime messages. */
export function createRuntimeVocabStore(send: Send): VocabStore {
  return {
    async list() {
      const res = await send({ type: VOCAB_LIST });
      if (!okOf(res) || !isRecord(res) || !Array.isArray(res.result)) {
        throw new Error('notebook failed');
      }
      return sortVocab(res.result.filter(isVocabEntry));
    },
    async put(entry) {
      if (!okOf(await send({ type: VOCAB_PUT, entry }))) throw new Error('notebook failed');
    },
    async remove(id) {
      if (!okOf(await send({ type: VOCAB_REMOVE, id }))) throw new Error('notebook failed');
    },
    async reviewLog() {
      const res = await send({ type: VOCAB_LOG });
      if (!okOf(res) || !isRecord(res) || !isReviewLog(res.result)) {
        throw new Error('notebook failed');
      }
      return res.result;
    },
    async logReview(day) {
      if (!okOf(await send({ type: VOCAB_LOG_ADD, day }))) throw new Error('notebook failed');
    },
  };
}
