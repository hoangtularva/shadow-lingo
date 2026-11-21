import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../src/adapters';
import { buildFontFaceCss, FONT_FILES } from '../src/fonts';
import { fnv1a, sentenceHash } from '../src/hash';
import { buildTrack, isEnglish, pickPreferredTrack } from '../src/tracks';

const json3 = JSON.stringify({
  events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'Hi. Bye.' }] }],
});

describe('buildTrack', () => {
  it('parses and merges any format', () => {
    const t = buildTrack({
      videoId: 'v1',
      body: json3,
      lang: 'en',
      kind: 'manual',
      source: 'player',
    });
    expect(t.sentences.map((s) => s.text)).toEqual(['Hi.', 'Bye.']);
    expect(t.timed).toBe(true);
    const p = buildTrack({ videoId: 'v1', body: 'plain words', source: 'paste' });
    expect(p.timed).toBe(false);
    expect(p.kind).toBe('unknown');
  });
});

describe('pickPreferredTrack', () => {
  const make = (lang: string, kind: 'manual' | 'asr', body = json3) =>
    buildTrack({ videoId: 'v', body, lang, kind, source: 'player' });

  it('prefers manual English, then asr English, then others', () => {
    const vi = make('vi', 'manual');
    const asr = make('en', 'asr');
    const manual = make('en-GB', 'manual');
    expect(pickPreferredTrack([vi, asr, manual])).toBe(manual);
    expect(pickPreferredTrack([vi, asr])).toBe(asr);
    expect(pickPreferredTrack([vi])).toBe(vi);
    expect(pickPreferredTrack([make('en', 'manual', '{"events":[]}')])).toBeUndefined();
  });

  it('detects English codes', () => {
    expect(isEnglish('en')).toBe(true);
    expect(isEnglish('en-US')).toBe(true);
    expect(isEnglish('eng')).toBe(false);
    expect(isEnglish('vi')).toBe(false);
  });
});

describe('hash', () => {
  it('is stable and normalizes text', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(sentenceHash('Hello  World')).toBe(sentenceHash(' hello world '));
  });
});

describe('memory storage', () => {
  it('stores copies', async () => {
    const s = createMemoryStorage();
    const value = { a: 1 };
    await s.set('k', value);
    value.a = 2;
    expect(await s.get('k')).toEqual({ a: 1 });
    await s.remove('k');
    expect(await s.get('k')).toBeUndefined();
  });
});

describe('fonts', () => {
  it('builds one @font-face per file with resolved URLs', () => {
    const css = buildFontFaceCss((f) => `chrome-extension://id/fonts/${f}`);
    expect(css.match(/@font-face/g)).toHaveLength(FONT_FILES.length);
    expect(css).toContain('chrome-extension://id/fonts/be-vietnam-pro-vietnamese-700-normal.woff2');
    expect(css).toContain('"SL Noto Sans"');
  });
});
