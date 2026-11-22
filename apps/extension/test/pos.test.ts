import { describe, expect, it } from 'vitest';
import { POS_TAG, createPosHandler, createRuntimePos, isPosTagRequest } from '@/lib/pos';

describe('isPosTagRequest', () => {
  it('accepts well-formed requests only', () => {
    expect(isPosTagRequest({ type: POS_TAG, sentences: ['Hi there.'] })).toBe(true);
    expect(isPosTagRequest({ type: POS_TAG, sentences: [1] })).toBe(false);
    expect(isPosTagRequest({ type: 'other', sentences: [] })).toBe(false);
    expect(isPosTagRequest({ type: POS_TAG, sentences: Array(21).fill('a') })).toBe(false);
    expect(isPosTagRequest({ type: POS_TAG, sentences: ['x'.repeat(1001)] })).toBe(false);
  });
});

describe('POS messaging', () => {
  it('tags through the handler and caches on the content side', async () => {
    let calls = 0;
    const handler = createPosHandler((text) => {
      calls++;
      return text.split(' ').map(() => 'noun');
    });
    const pos = createRuntimePos((m) => Promise.resolve(handler(m)));
    expect(await pos.tag(['a b', 'c'])).toEqual({ 'a b': ['noun', 'noun'], c: ['noun'] });
    await pos.tag(['a b']);
    expect(calls).toBe(2);
  });

  it('rejects malformed answers', async () => {
    const pos = createRuntimePos(() => Promise.resolve({ ok: true, result: { a: ['banana'] } }));
    await expect(pos.tag(['a'])).rejects.toThrow();
  });

  it('reports tagger failures as not ok', () => {
    const handler = createPosHandler(() => {
      throw new Error('boom');
    });
    expect(handler({ type: POS_TAG, sentences: ['a'] })).toEqual({ ok: false });
  });
});
