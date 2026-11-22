import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import {
  TR_GET,
  TR_PUT,
  createRuntimeTranslationCache,
  createTranslationCacheHandler,
  isTrGetRequest,
  isTrPutRequest,
} from '@/lib/translation-cache';
import { createDexieTranslationCache } from '@/lib/translation-db';
import {
  createChromeTranslation,
  findTranslatorFactory,
  type TranslatorFactory,
} from '@/lib/translator';

const H1 = '0a1b2c3d';
const H2 = 'deadbeef';

describe('translation cache messages', () => {
  it('validates requests', () => {
    expect(isTrGetRequest({ type: TR_GET, videoId: 'abc_DEF-12', hashes: [H1] })).toBe(true);
    expect(isTrGetRequest({ type: TR_GET, videoId: '', hashes: [H1] })).toBe(false);
    expect(isTrGetRequest({ type: TR_GET, videoId: 'abc', hashes: ['nothex!!'] })).toBe(false);
    const entry = { vi: 'Xin chào.', source: 'machine' };
    expect(isTrPutRequest({ type: TR_PUT, videoId: 'abc', entries: { [H1]: entry } })).toBe(true);
    expect(
      isTrPutRequest({
        type: TR_PUT,
        videoId: 'abc',
        entries: { [H1]: { vi: 'x', source: 'other' } },
      }),
    ).toBe(false);
    expect(
      isTrPutRequest({
        type: TR_PUT,
        videoId: 'abc',
        entries: { [H1]: { vi: '', source: 'machine' } },
      }),
    ).toBe(false);
  });
});

describe('IndexedDB cache (background)', () => {
  it('stores lines per video and never lets a machine line replace an edited one', async () => {
    const cache = createDexieTranslationCache(`test-${Math.random()}`);
    await cache.put('vid1', { [H1]: { vi: 'Máy dịch.', source: 'machine' } });
    await cache.put('vid1', { [H1]: { vi: 'Tôi sửa.', source: 'edited' } });
    await cache.put('vid1', { [H1]: { vi: 'Máy dịch lại.', source: 'machine' } });
    await cache.put('vid2', { [H2]: { vi: 'Khác.', source: 'machine' } });
    expect(await cache.get('vid1', [H1, H2])).toEqual({
      [H1]: { vi: 'Tôi sửa.', source: 'edited' },
    });
  });

  it('round-trips through the content adapter and the handler', async () => {
    const handler = createTranslationCacheHandler(
      createDexieTranslationCache(`test-${Math.random()}`),
    );
    const send = (m: unknown) =>
      isTrGetRequest(m)
        ? handler.get(m)
        : isTrPutRequest(m)
          ? handler.put(m)
          : Promise.resolve(null);
    const cache = createRuntimeTranslationCache(send);
    await cache.put('vid1', { [H1]: { vi: 'Xin chào.', source: 'machine' } });
    expect(await cache.get('vid1', [H1])).toEqual({ [H1]: { vi: 'Xin chào.', source: 'machine' } });
    // Pasted transcripts have no video id: nothing is sent.
    const spy = vi.fn(send);
    await createRuntimeTranslationCache(spy).put('', { [H1]: { vi: 'x', source: 'machine' } });
    expect(spy).not.toHaveBeenCalled();
  });
});

function fakeFactory(availability: string): TranslatorFactory & { created: number } {
  const f = {
    created: 0,
    availability: () => Promise.resolve(availability as 'available'),
    create(options: { monitor?: (m: EventTarget) => void }) {
      f.created += 1;
      const target = new EventTarget();
      options.monitor?.(target);
      const e = new Event('downloadprogress');
      Object.defineProperty(e, 'loaded', { value: 0.4 });
      target.dispatchEvent(e);
      return Promise.resolve({ translate: (t: string) => Promise.resolve(`vi:${t}`) });
    },
  };
  return f;
}

describe('Chrome translator adapter', () => {
  it('maps availability to panel states', async () => {
    expect(await createChromeTranslation(null).state()).toBe('unsupported');
    expect(await createChromeTranslation(fakeFactory('available')).state()).toBe('ready');
    expect(await createChromeTranslation(fakeFactory('downloadable')).state()).toBe(
      'needs-download',
    );
    expect(await createChromeTranslation(fakeFactory('unavailable')).state()).toBe('unsupported');
  });

  it('reports download progress and creates the translator once', async () => {
    const factory = fakeFactory('downloadable');
    const t = createChromeTranslation(factory);
    const progress = vi.fn();
    expect(await t.prepare(progress)).toBe(true);
    expect(progress).toHaveBeenCalledWith(0.4);
    expect(await t.translate('Hello')).toBe('vi:Hello');
    expect(factory.created).toBe(1);
  });

  it('finds the global Translator only when it looks right', () => {
    expect(findTranslatorFactory({})).toBeNull();
    expect(findTranslatorFactory({ Translator: { availability: 1 } })).toBeNull();
    const T = Object.assign(() => undefined, { availability: () => 0, create: () => 0 });
    expect(findTranslatorFactory({ Translator: T })).toBe(T);
  });
});
