import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  annotateSentence,
  cardinalWords,
  numberPhones,
  parseCmuDict,
  spellAcronym,
  toIpa,
  yearWords,
  type PronunciationDict,
} from '../src/ipa';

const ipaOf = (phones: Parameters<typeof toIpa>[0] | null) => (phones ? toIpa(phones) : null);

describe('numbers', () => {
  it('reads cardinals the American way', () => {
    expect(cardinalWords(0)).toEqual(['zero']);
    expect(cardinalWords(21)).toEqual(['twenty', 'one']);
    expect(cardinalWords(105)).toEqual(['one', 'hundred', 'five']);
    expect(cardinalWords(10_000)).toEqual(['ten', 'thousand']);
    expect(cardinalWords(2_500_001)).toEqual([
      'two',
      'million',
      'five',
      'hundred',
      'thousand',
      'one',
    ]);
  });

  it('reads years', () => {
    expect(yearWords(1995)).toEqual(['nineteen', 'ninety', 'five']);
    expect(yearWords(1905)).toEqual(['nineteen', 'oh', 'five']);
    expect(yearWords(1900)).toEqual(['nineteen', 'hundred']);
    expect(yearWords(2005)).toEqual(['two', 'thousand', 'five']);
    expect(yearWords(2026)).toEqual(['twenty', 'twenty', 'six']);
  });

  it('gives phones for number tokens', () => {
    expect(ipaOf(numberPhones('2'))).toBe('tuː');
    expect(numberPhones('2026')).not.toBeNull();
    expect(numberPhones('10,000')).toEqual(numberPhones('10000'));
    expect(ipaOf(numberPhones('3rd'))).toBe('θɝːd');
    expect(numberPhones('21st')?.slice(-4)).toEqual(['F', 'ER1', 'S', 'T']);
    expect(numberPhones('20th')?.slice(-3)).toEqual(['IY0', 'AH0', 'TH']);
    expect(numberPhones('1.5')).toContain('OY1');
    expect(numberPhones('90s')?.at(-1)).toBe('Z');
    expect(numberPhones('abc')).toBeNull();
    expect(numberPhones('1234567890123')).toBeNull();
  });
});

describe('acronyms', () => {
  it('spells all-capital words, stress on the last letter', () => {
    expect(spellAcronym('MLS')).toEqual(['EH2', 'M', 'EH2', 'L', 'EH1', 'S']);
    expect(spellAcronym('APIs')?.at(-1)).toBe('Z');
    expect(spellAcronym('Nba')).toBeNull();
    expect(spellAcronym('A')).toBeNull();
  });
});

describe('words built from dictionary words', () => {
  let dict: PronunciationDict;
  beforeAll(() => {
    dict = parseCmuDict(readFileSync(join(__dirname, '../data/cmudict.txt'), 'utf8'));
  });
  const first = (w: string) => dict.lookup(w)?.[0] ?? null;

  it('adds suffixes with the right sound', () => {
    // "vibing" / "googled" are not in CMU Dict; vibe / google are.
    expect(dict.lookup('vibe')).not.toBeNull();
    expect(first('vibing')?.slice(-2)).toEqual(['IH0', 'NG']);
    expect(first('googled')?.at(-1)).toBe('D');
    expect(first('unfollowed')?.slice(0, 2)).toEqual(['AH0', 'N']);
  });

  it('returns null for words it cannot build', () => {
    expect(dict.lookup('qzxv')).toBeNull();
    expect(dict.lookup('casemiro')).toBeNull();
  });

  it('annotates numbers and acronyms in a sentence', () => {
    const words = annotateSentence('The MLS final is in 2026.', (k) => dict.lookup(k));
    expect(words.find((w) => w.text === 'MLS')?.ipa).toBeTruthy();
    expect(words.find((w) => w.text === '2026')?.ipa).toBeTruthy();
    const score = annotateSentence('They won 3-1.', (k) => dict.lookup(k));
    expect(score.find((w) => w.text === '3-1')?.ipa).toBeTruthy();
  });
});
