import { encodePronunciation, parseArpabet } from '@shadow-lingo/core';
import {
  IPA_LOOKUP,
  MAX_KEYS,
  createLookupHandler,
  createRuntimePronunciation,
  isIpaLookupRequest,
  type IpaLookupRequest,
} from '@/lib/pronunciation';

const enc = (s: string) => encodePronunciation(parseArpabet(s));
const DATA = `# test\nthe\t${enc('DH AH0')}|${enc('DH IY0')}\ncat\t${enc('K AE1 T')}\n`;

describe('isIpaLookupRequest', () => {
  it('accepts well-formed requests only', () => {
    expect(isIpaLookupRequest({ type: IPA_LOOKUP, keys: ['the'] })).toBe(true);
    expect(isIpaLookupRequest({ type: IPA_LOOKUP, keys: [1] })).toBe(false);
    expect(isIpaLookupRequest({ type: IPA_LOOKUP, keys: [''] })).toBe(false);
    expect(isIpaLookupRequest({ type: 'other', keys: [] })).toBe(false);
    expect(isIpaLookupRequest({ type: IPA_LOOKUP, keys: Array(MAX_KEYS + 1).fill('a') })).toBe(
      false,
    );
    expect(isIpaLookupRequest(null)).toBe(false);
  });
});

describe('createLookupHandler', () => {
  it('loads the dictionary once and answers every key', async () => {
    const load = vi.fn(() => Promise.resolve(DATA));
    const handle = createLookupHandler(load);
    const a = await handle({ type: IPA_LOOKUP, keys: ['the', 'dog'] });
    await handle({ type: IPA_LOOKUP, keys: ['cat'] });
    expect(load).toHaveBeenCalledTimes(1);
    expect(a).toEqual({
      ok: true,
      result: { the: [parseArpabet('DH AH0'), parseArpabet('DH IY0')], dog: null },
    });
  });

  it('reports failure and retries the load next time', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValue(DATA);
    const handle = createLookupHandler(load);
    expect(await handle({ type: IPA_LOOKUP, keys: ['cat'] })).toEqual({ ok: false });
    expect(await handle({ type: IPA_LOOKUP, keys: ['cat'] })).toMatchObject({ ok: true });
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('createRuntimePronunciation', () => {
  it('asks the background only for uncached keys', async () => {
    const handle = createLookupHandler(() => Promise.resolve(DATA));
    const sent: IpaLookupRequest[] = [];
    const adapter = createRuntimePronunciation((m) => {
      sent.push(m);
      return handle(m);
    });
    expect(await adapter.lookup(['cat', 'the'])).toMatchObject({ cat: [parseArpabet('K AE1 T')] });
    expect(await adapter.lookup(['cat', 'dog'])).toEqual({
      cat: [parseArpabet('K AE1 T')],
      dog: null,
    });
    expect(sent.map((m) => m.keys)).toEqual([['cat', 'the'], ['dog']]);
  });

  it('rejects malformed or failed answers', async () => {
    const bad = createRuntimePronunciation(() =>
      Promise.resolve({ ok: true, result: { a: [['XX']] } }),
    );
    await expect(bad.lookup(['a'])).rejects.toThrow();
    const failed = createRuntimePronunciation(() => Promise.resolve({ ok: false }));
    await expect(failed.lookup(['a'])).rejects.toThrow();
  });
});
