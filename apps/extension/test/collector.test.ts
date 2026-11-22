import { describe, expect, it } from 'vitest';
import { CaptionCollector } from '@/lib/collector';
import type { CaptionMessage } from '@/lib/messages';
import { createExtensionStorage, type StorageArea } from '@/lib/storage';

function json3(text: string): string {
  return JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: text }] }] });
}

function msg(partial: Partial<CaptionMessage>): CaptionMessage {
  return {
    source: 'shadow-lingo:caption',
    videoId: 'video000001',
    lang: 'en',
    kind: '',
    tlang: '',
    body: json3('Hello there.'),
    ...partial,
  };
}

describe('CaptionCollector', () => {
  it('ignores captions for other videos (e.g. ads) and before a video is set', () => {
    const c = new CaptionCollector();
    expect(c.add(msg({}))).toBeUndefined();
    c.setVideo('video000001');
    expect(c.add(msg({ videoId: 'adVideo0001' }))).toBeUndefined();
    expect(c.add(msg({}))?.sentences[0]?.text).toBe('Hello there.');
  });

  it('prefers manual English over auto-generated and other languages', () => {
    const c = new CaptionCollector();
    c.setVideo('video000001');
    expect(c.add(msg({ lang: 'vi', body: json3('Xin chào.') }))?.lang).toBe('vi');
    expect(c.add(msg({ kind: 'asr', body: json3('hello there') }))?.kind).toBe('asr');
    expect(c.add(msg({ body: json3('Hello there.') }))?.kind).toBe('manual');
    expect(c.add(msg({ kind: 'asr', body: json3('again') }))?.kind).toBe('manual');
  });

  it('skips translated tracks, broken bodies and empty tracks', () => {
    const c = new CaptionCollector();
    c.setVideo('video000001');
    expect(c.add(msg({ tlang: 'vi' }))).toBeUndefined();
    expect(c.add(msg({ body: '{"events":' }))).toBeUndefined();
    expect(c.add(msg({ body: '{"events":[]}' }))).toBeUndefined();
    expect(c.preferred()).toBeUndefined();
  });

  it('keeps human Vietnamese cues for the Vietnamese line, never auto or translated ones', () => {
    const c = new CaptionCollector();
    c.setVideo('video000001');
    c.add(msg({}));
    expect(c.vietnameseCues()).toBeNull();
    c.add(msg({ lang: 'vi', tlang: '', kind: 'asr', body: json3('tự động') }));
    expect(c.vietnameseCues()).toBeNull();
    c.add(msg({ lang: 'en', tlang: 'vi', body: json3('Máy dịch.') }));
    expect(c.vietnameseCues()).toBeNull();
    // English stays the track to shadow.
    expect(c.add(msg({ lang: 'vi', body: json3('Xin chào.') }))?.lang).toBe('en');
    expect(c.vietnameseCues()?.[0]?.text).toBe('Xin chào.');
    c.setVideo('video000002');
    expect(c.vietnameseCues()).toBeNull();
  });

  it('clears tracks when the video changes', () => {
    const c = new CaptionCollector();
    c.setVideo('video000001');
    c.add(msg({}));
    c.setVideo('video000002');
    expect(c.preferred()).toBeUndefined();
  });
});

describe('createExtensionStorage', () => {
  it('reads and writes through the storage area', async () => {
    const data = new Map<string, unknown>();
    const area: StorageArea = {
      get: (k) => Promise.resolve(data.has(k) ? { [k]: data.get(k) } : {}),
      set: (items) => {
        for (const [k, v] of Object.entries(items)) data.set(k, v);
        return Promise.resolve();
      },
      remove: (k) => {
        data.delete(k);
        return Promise.resolve();
      },
    };
    const s = createExtensionStorage(area);
    await s.set('a', { x: 1 });
    expect(await s.get('a')).toEqual({ x: 1 });
    await s.remove('a');
    expect(await s.get('a')).toBeUndefined();
  });

  it('swallows storage failures', async () => {
    const fail = () => Promise.reject(new Error('Extension context invalidated'));
    const s = createExtensionStorage({ get: fail, set: fail, remove: fail });
    await expect(s.get('a')).resolves.toBeUndefined();
    await expect(s.set('a', 1)).resolves.toBeUndefined();
    await expect(s.remove('a')).resolves.toBeUndefined();
  });
});
