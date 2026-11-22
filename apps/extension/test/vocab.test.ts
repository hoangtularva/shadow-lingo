import 'fake-indexeddb/auto';
import type { VocabEntry } from '@shadow-lingo/core';
import { describe, expect, it } from 'vitest';
import { openDb } from '@/lib/db';
import { createDexieTranslationCache } from '@/lib/translation-db';
import {
  LOG_DAYS,
  VOCAB_LIST,
  VOCAB_LOG_ADD,
  VOCAB_PUT,
  VOCAB_REMOVE,
  createDexieVocabStore,
  createRuntimeVocabStore,
  createVocabHandler,
  isVocabRequest,
} from '@/lib/vocab';

const entry = (id: string, addedAt: number): VocabEntry => ({
  id,
  headword: id,
  vi: 'nghĩa',
  senses: [{ pos: 'noun', gloss: 'A thing.' }],
  addedAt,
});

describe('notebook messages', () => {
  it('validates requests', () => {
    expect(isVocabRequest({ type: VOCAB_LIST })).toBe(true);
    expect(isVocabRequest({ type: VOCAB_PUT, entry: entry('word', 1) })).toBe(true);
    expect(isVocabRequest({ type: VOCAB_PUT, entry: { ...entry('word', 1), id: 'x' } })).toBe(
      false,
    );
    expect(isVocabRequest({ type: VOCAB_REMOVE, id: '' })).toBe(false);
    expect(isVocabRequest({ type: 'other' })).toBe(false);
  });
});

describe('IndexedDB notebook (background)', () => {
  it('round-trips through the content adapter, newest first, next to translations', async () => {
    const db = openDb(`test-${Math.random()}`);
    const translations = createDexieTranslationCache(db);
    await translations.put('vid1', { '0a1b2c3d': { vi: 'Xin chào.', source: 'machine' } });
    const handler = createVocabHandler(createDexieVocabStore(db));
    const store = createRuntimeVocabStore((m) =>
      isVocabRequest(m) ? handler(m) : Promise.resolve(null),
    );
    await store.put(entry('older', 1));
    await store.put(entry('newer', 2));
    await store.put({ ...entry('older', 1), vi: 'đã sửa' });
    expect((await store.list()).map((e) => [e.id, e.vi])).toEqual([
      ['newer', 'nghĩa'],
      ['older', 'đã sửa'],
    ]);
    await store.remove('newer');
    expect((await store.list()).map((e) => e.id)).toEqual(['older']);
    expect(await translations.get('vid1', ['0a1b2c3d'])).toEqual({
      '0a1b2c3d': { vi: 'Xin chào.', source: 'machine' },
    });
  });

  it('counts answers per day and keeps a bounded history', async () => {
    const db = openDb(`test-${Math.random()}`);
    const store = createDexieVocabStore(db);
    await store.logReview('2026-11-22');
    await store.logReview('2026-11-22');
    await store.logReview('2026-11-23');
    expect(await store.reviewLog()).toEqual({ '2026-11-22': 2, '2026-11-23': 1 });
    for (let i = 0; i < LOG_DAYS + 5; i++) {
      const d = new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      await db.reviewLog.put({ day: d, count: 1 });
    }
    await store.logReview('2026-11-24');
    expect(Object.keys(await store.reviewLog())).toHaveLength(LOG_DAYS);
    expect(isVocabRequest({ type: VOCAB_LOG_ADD, day: '2026-1-1' })).toBe(false);
    expect(isVocabRequest({ type: VOCAB_LOG_ADD, day: '2026-11-24' })).toBe(true);
  });

  it('reports failures to the panel', async () => {
    const store = createRuntimeVocabStore(() => Promise.resolve({ ok: false }));
    await expect(store.list()).rejects.toThrow();
    await expect(store.put(entry('a', 1))).rejects.toThrow();
  });
});
