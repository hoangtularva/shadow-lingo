import { describe, expect, it } from 'vitest';
import { isExternalLink } from '../src/links';
import { videoFromSharedText } from '../src/youtube';

describe('shared text', () => {
  it('finds the video in what the YouTube app shares', () => {
    expect(videoFromSharedText('https://youtu.be/8KkKuTCFvzI?si=abc')).toEqual({
      id: '8KkKuTCFvzI',
      start: 0,
    });
    expect(
      videoFromSharedText('What makes a good life? https://youtu.be/8KkKuTCFvzI?t=90 via app'),
    ).toEqual({ id: '8KkKuTCFvzI', start: 90 });
    expect(videoFromSharedText('https://www.youtube.com/shorts/8KkKuTCFvzI')?.id).toBe(
      '8KkKuTCFvzI',
    );
  });

  it('ignores text without a YouTube link, even an 11-letter word', () => {
    expect(videoFromSharedText('Hello there')).toBeNull();
    expect(videoFromSharedText('Learnenglis')).toBeNull();
    expect(videoFromSharedText('https://example.com/watch?v=8KkKuTCFvzI')).toBeNull();
  });
});

describe('external links', () => {
  it('allows only https links to known sites', () => {
    expect(isExternalLink('https://youtu.be/8KkKuTCFvzI')).toBe(true);
    expect(isExternalLink('https://en.wiktionary.org/wiki/figure')).toBe(true);
    expect(isExternalLink('http://youtube.com/')).toBe(false);
    expect(isExternalLink('https://youtube.com.evil.example/')).toBe(false);
    expect(isExternalLink('not a url')).toBe(false);
  });
});
