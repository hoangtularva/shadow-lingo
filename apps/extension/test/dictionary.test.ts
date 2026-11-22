import { createDictionary } from '@shadow-lingo/core';
import { describe, expect, it, vi } from 'vitest';
import {
  DICT_LOOKUP,
  MAX_WORDS,
  createDictHandler,
  createRuntimeDictionary,
  isDictLookupRequest,
  shardPath,
} from '@/lib/dictionary';

const SHARDS: Record<string, string> = {
  g: 'give up\tvi|từ bỏ\tverb|To stop trying.|Never give up.',
  u: 'up\tadv|Toward a higher place.|',
};

describe('dictionary messages', () => {
  it('validates requests', () => {
    expect(isDictLookupRequest({ type: DICT_LOOKUP, words: ['a', 'b'], index: 1 })).toBe(true);
    expect(isDictLookupRequest({ type: DICT_LOOKUP, words: ['a'], index: 1 })).toBe(false);
    expect(isDictLookupRequest({ type: DICT_LOOKUP, words: [], index: 0 })).toBe(false);
    expect(isDictLookupRequest({ type: DICT_LOOKUP, words: ['a'], index: 0.5 })).toBe(false);
    expect(
      isDictLookupRequest({ type: DICT_LOOKUP, words: Array(MAX_WORDS + 1).fill('a'), index: 0 }),
    ).toBe(false);
  });

  it('only names real shard files', () => {
    expect(shardPath('a')).toBe('/dict/a.txt');
    expect(shardPath('_')).toBe('/dict/_.txt');
    expect(shardPath('../x')).toBeNull();
  });

  it('round-trips a lookup and maps indexes back for long sentences', async () => {
    const handler = createDictHandler(createDictionary((n) => Promise.resolve(SHARDS[n] ?? '')));
    const send = vi.fn((m: unknown) =>
      isDictLookupRequest(m) ? handler(m) : Promise.resolve(null),
    );
    const dict = createRuntimeDictionary(send);
    const words = [...Array(100).fill('so'), 'never', 'give', 'up'];
    const found = await dict.lookup(words, 102);
    expect(found?.entry.headword).toBe('give up');
    expect(found?.words).toEqual([101, 102]);
    const sent = send.mock.calls[0]?.[0] as { words: string[] };
    expect(sent.words.length).toBeLessThanOrEqual(MAX_WORDS);
  });

  it('reports failures', async () => {
    const dict = createRuntimeDictionary(() => Promise.resolve({ ok: false }));
    await expect(dict.lookup(['a'], 0)).rejects.toThrow();
    const bad = createRuntimeDictionary(() =>
      Promise.resolve({ ok: true, result: { words: [0], entry: { headword: 1 } } }),
    );
    await expect(bad.lookup(['a'], 0)).rejects.toThrow();
  });
});
