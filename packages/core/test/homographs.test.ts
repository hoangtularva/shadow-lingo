import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  annotateSentence,
  homographPhones,
  parseCmuDict,
  type PronunciationDict,
} from '../src/ipa';
import type { PartOfSpeech } from '../src/pos';
import { tagSentence } from '../src/pos/tagger';

let dict: PronunciationDict;
beforeAll(() => {
  dict = parseCmuDict(readFileSync(join(__dirname, '../data/cmudict.txt'), 'utf8'));
});

function ipaOf(text: string, word: string, pos?: readonly (PartOfSpeech | null)[]) {
  const words = annotateSentence(text, (k) => dict.lookup(k), pos);
  return words.find((w) => w.key === word)?.ipa;
}

describe('homographs', () => {
  it('reads noun and verb stress from the tag', () => {
    expect(ipaOf('Play the record', 'record', [null, null, 'noun'])).toBe('ˈrekɚd');
    expect(ipaOf('We record it', 'record', [null, 'verb', null])).toBe('rɪˈkɔːrd');
    expect(ipaOf('A live show', 'live', [null, 'adjective', null])).toBe('laɪv');
    expect(ipaOf('We live here', 'live', [null, 'verb', null])).toBe('lɪv');
  });

  it('uses the common reading without a tag', () => {
    expect(ipaOf('We live here', 'live')).toBe('lɪv');
    expect(ipaOf('Use it', 'use')).toBe('juːz');
    expect(ipaOf('Follow the lead', 'lead')).toBe('liːd');
  });

  it('reads "read" as past after have / be', () => {
    expect(ipaOf('I will read it', 'read')).toBe('riːd');
    expect(ipaOf('I have read it', 'read')).toBe('red');
    expect(ipaOf('It was read aloud', 'read')).toBe('red');
  });

  it('leaves other words alone', () => {
    expect(homographPhones('table', 'noun')).toBeNull();
  });

  it('works with the real tagger', () => {
    const text = 'Please present the project and record the record.';
    const words = annotateSentence(text, (k) => dict.lookup(k), tagSentence(text));
    expect(words.map((w) => w.ipa)).toEqual([
      'pliːz',
      'priˈzen(t)',
      'ðə',
      'ˈprɑːdʒekt',
      'ən',
      'rɪˈkɔːrd',
      'ðə',
      'ˈrekɚd',
    ]);
  });
});
