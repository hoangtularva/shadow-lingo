import { describe, expect, it } from 'vitest';
import { isCaptionMessage, isReplayMessage } from '@/lib/messages';
import { parseTimedTextUrl, videoIdFromLocation } from '@/lib/timedtext';

describe('parseTimedTextUrl', () => {
  it('keeps only video id, language, kind and tlang', () => {
    const info = parseTimedTextUrl(
      '/api/timedtext?v=abcdef12345&ei=x&caps=asr&opi=1&xoaf=5&lang=en&kind=asr&fmt=json3&pot=SECRET&signature=SIG',
    );
    expect(info).toEqual({ videoId: 'abcdef12345', lang: 'en', kind: 'asr', tlang: '' });
    expect(JSON.stringify(info)).not.toContain('SECRET');
    expect(JSON.stringify(info)).not.toContain('SIG');
  });

  it('marks human captions with an empty kind and keeps tlang', () => {
    expect(
      parseTimedTextUrl('https://www.youtube.com/api/timedtext?v=abcdef12345&lang=en-GB&tlang=vi'),
    ).toEqual({ videoId: 'abcdef12345', lang: 'en-GB', kind: '', tlang: 'vi' });
  });

  it('rejects other hosts, paths and bad params', () => {
    expect(
      parseTimedTextUrl('https://evil.example/api/timedtext?v=abcdef12345&lang=en'),
    ).toBeNull();
    expect(parseTimedTextUrl('https://www.youtube.com/api/stats?v=abcdef12345&lang=en')).toBeNull();
    expect(parseTimedTextUrl('/api/timedtext?v=<script>&lang=en')).toBeNull();
    expect(parseTimedTextUrl('/api/timedtext?v=abcdef12345')).toBeNull();
    expect(parseTimedTextUrl('http://[bad')).toBeNull();
  });
});

describe('videoIdFromLocation', () => {
  it('reads watch pages only', () => {
    expect(videoIdFromLocation('https://www.youtube.com/watch?v=abcdef12345&t=5')).toBe(
      'abcdef12345',
    );
    expect(videoIdFromLocation('https://www.youtube.com/')).toBeNull();
    expect(videoIdFromLocation('https://www.youtube.com/shorts/abcdef12345')).toBeNull();
    expect(videoIdFromLocation('https://www.youtube.com/watch?v=%3Cx%3E')).toBeNull();
    expect(videoIdFromLocation('not a url')).toBeNull();
  });
});

describe('message guards', () => {
  it('validates caption and replay messages', () => {
    const ok = {
      source: 'shadow-lingo:caption',
      videoId: 'v',
      lang: 'en',
      kind: '',
      tlang: '',
      body: '{}',
    };
    expect(isCaptionMessage(ok)).toBe(true);
    expect(isCaptionMessage({ ...ok, body: 5 })).toBe(false);
    expect(isCaptionMessage(null)).toBe(false);
    expect(isReplayMessage({ source: 'shadow-lingo:replay' })).toBe(true);
    expect(isReplayMessage({ source: 'other' })).toBe(false);
  });
});
