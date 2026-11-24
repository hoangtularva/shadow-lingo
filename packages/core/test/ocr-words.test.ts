import { describe, expect, it } from 'vitest';
import { keepRealWords, ocrWordKeys } from '../src/ocr';

const DICT = new Set([
  'thank',
  'you',
  'a',
  'on',
  'what',
  'are',
  'doing',
  'i',
  "i'm",
  'dancing',
  'grandma',
  'how',
  'much',
  'ten',
  'dollars',
  'we',
  'should',
  'go',
]);
const isWord = (k: string) => DICT.has(k);

describe('keepRealWords', () => {
  it('keeps real subtitles, names included', () => {
    expect(keepRealWords("I'm dancing, grandma.", isWord)).toBe("I'm dancing, grandma.");
    expect(keepRealWords('Karen, what are you doing?', isWord)).toBe('Karen, what are you doing?');
  });

  it('drops readings that are mostly not words', () => {
    expect(keepRealWords('Qn Xvr Lopt we', isWord)).toBe('');
    expect(keepRealWords('', isWord)).toBe('');
  });

  it('removes one- or two-letter scraps that are not words', () => {
    expect(keepRealWords('Thank Qn you', isWord)).toBe('Thank you');
    expect(keepRealWords('How much? Xr', isWord)).toBe('How much?');
  });

  it('lists the words to look up', () => {
    expect(ocrWordKeys("I'm dancing, Grandma. I'm")).toEqual(["i'm", 'dancing', 'grandma']);
  });
});
