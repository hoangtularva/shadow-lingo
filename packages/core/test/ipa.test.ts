import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PHONES,
  PHONE_CODES,
  addSuffixS,
  annotateSentence,
  decodePronunciation,
  dictFromPhones,
  encodePronunciation,
  normalizeWord,
  parseArpabet,
  parseCmuDict,
  toIpa,
  tokenize,
  warningsFor,
  wordKeys,
  type AnnotatedWord,
  type PronunciationDict,
} from '../src/ipa';

const ipa = (arpa: string) => toIpa(parseArpabet(arpa));

describe('arpabet', () => {
  it('has one unique printable code per phone, never # or |', () => {
    expect(PHONE_CODES).toHaveLength(PHONES.length);
    expect(new Set(PHONE_CODES).size).toBe(PHONES.length);
    expect(PHONE_CODES).not.toContain('#');
    expect(PHONE_CODES).not.toContain('|');
  });

  it('round-trips encoded pronunciations', () => {
    const phones = parseArpabet('K AH0 M Y UW2 N AH0 K EY1 SH AH0 N');
    expect(decodePronunciation(encodePronunciation(phones))).toEqual(phones);
  });

  it('rejects unknown phones', () => {
    expect(() => parseArpabet('XX')).toThrow();
    expect(() => decodePronunciation('#')).toThrow();
  });
});

describe('toIpa', () => {
  it('maps vowels learner-dictionary style', () => {
    expect(ipa('K AE1 T')).toBe('kæt');
    expect(ipa('B EH1 D')).toBe('bed');
    expect(ipa('SH IY1 P')).toBe('ʃiːp');
    expect(ipa('SH IH1 P')).toBe('ʃɪp');
    expect(ipa('TH IH1 NG K')).toBe('θɪŋk');
  });

  it('reduces unstressed vowels', () => {
    expect(ipa('AH0 B AW1 T')).toBe('əˈbaʊt');
    expect(ipa('W AO1 T ER0')).toBe('ˈwɔːtɚ');
    expect(ipa('HH AE1 P IY0')).toBe('ˈhæpi');
  });

  it('puts stress before the syllable onset (maximal onset)', () => {
    expect(ipa('K AH0 M Y UW2 N AH0 K EY1 SH AH0 N')).toBe('kəˌmjuːnəˈkeɪʃən');
    expect(ipa('AH0 S T R AA1 N AH0 M IY0')).toBe('əˈstrɑːnəmi');
    expect(ipa('IH0 K S P L EY1 N')).toBe('ɪkˈspleɪn');
    expect(ipa('W EH1 L K AH0 M')).toBe('ˈwelkəm');
  });

  it('leaves one-syllable words unmarked', () => {
    expect(ipa('S T R EH1 NG K TH S')).toBe('streŋkθs');
  });

  it('brackets an elided final phone', () => {
    expect(toIpa(parseArpabet('N EH1 K S T'), { elideLast: true })).toBe('neks(t)');
  });
});

describe('dictionary', () => {
  const dict = dictFromPhones({
    john: [parseArpabet('JH AA1 N')],
    cat: [parseArpabet('K AE1 T')],
  });

  it('normalizes words', () => {
    expect(normalizeWord('“Don’t,')).toBe("don't");
    expect(normalizeWord('(Hello!)')).toBe('hello');
  });

  it('adds the right -s allomorph', () => {
    expect(addSuffixS(parseArpabet('K AE1 T'))).toEqual(parseArpabet('K AE1 T S'));
    expect(addSuffixS(parseArpabet('D AO1 G'))).toEqual(parseArpabet('D AO1 G Z'));
    expect(addSuffixS(parseArpabet('B AH1 S'))).toEqual(parseArpabet('B AH1 S IH0 Z'));
  });

  it('parses the data file format and falls back for possessives', () => {
    const enc = (s: string) => encodePronunciation(parseArpabet(s));
    const text = `# header\njohn\t${enc('JH AA1 N')}\nread\t${enc('R EH1 D')}|${enc('R IY1 D')}\n`;
    const d = parseCmuDict(text);
    expect(d.size).toBe(2);
    expect(d.lookup('Read')).toEqual([parseArpabet('R EH1 D'), parseArpabet('R IY1 D')]);
    expect(d.lookup("John's")).toEqual([parseArpabet('JH AA1 N Z')]);
    expect(d.lookup('nope')).toBeNull();
    expect(dict.lookup('CAT.')).toEqual([parseArpabet('K AE1 T')]);
  });
});

describe('bundled CMU data', () => {
  let dict: PronunciationDict;
  beforeAll(() => {
    dict = parseCmuDict(readFileSync(join(__dirname, '../data/cmudict.txt'), 'utf8'));
  });

  it('loads >100k words and decodes common ones', () => {
    expect(dict.size).toBeGreaterThan(100_000);
    expect(dict.lookup('the')?.[0]).toEqual(parseArpabet('DH AH0'));
    expect(dict.lookup("don't")?.[0]).toEqual(parseArpabet('D OW1 N T'));
    expect(dict.lookup('U.S.')?.[0]).toEqual(parseArpabet('Y UW2 EH1 S'));
  });

  it('annotates a real sentence end to end', () => {
    const words = annotateSentence('Welcome to the show, everyone!', (k) => dict.lookup(k));
    expect(words.map((w) => w.ipa)).toEqual(['ˈwelkəm', 'tə', 'ðə', 'ʃoʊ', 'ˈevriˌwʌn']);
  });
});

describe('tokenize', () => {
  it('keeps contractions, hyphens and abbreviations as words', () => {
    const words = tokenize("I don't know—well-known U.S. stuff.").filter((t) => t.isWord);
    expect(words.map((t) => t.text)).toEqual(['I', "don't", 'know', 'well-known', 'U.S', 'stuff']);
  });

  it('collects unique keys, including hyphen parts', () => {
    expect(wordKeys('The cat, the well-known cat.')).toEqual([
      'the',
      'cat',
      'well-known',
      'well',
      'known',
    ]);
  });
});

describe('annotateSentence', () => {
  const dict = dictFromPhones({
    i: [parseArpabet('AY1')],
    want: [parseArpabet('W AA1 N T')],
    to: [parseArpabet('T UW1')],
    go: [parseArpabet('G OW1')],
    an: [parseArpabet('AE1 N')],
    island: [parseArpabet('AY1 L AH0 N D')],
    where: [parseArpabet('W EH1 R')],
    are: [parseArpabet('AA1 R')],
    you: [parseArpabet('Y UW1')],
    from: [parseArpabet('F R AH1 M')],
    the: [parseArpabet('DH AH0'), parseArpabet('DH IY0')],
    apple: [parseArpabet('AE1 P AH0 L')],
    pick: [parseArpabet('P IH1 K')],
    it: [parseArpabet('IH1 T')],
    up: [parseArpabet('AH1 P')],
    last: [parseArpabet('L AE1 S T')],
    night: [parseArpabet('N AY1 T')],
    well: [parseArpabet('W EH1 L')],
    known: [parseArpabet('N OW1 N')],
    company: [parseArpabet('K AH1 M P AH0 N IY2')],
  });
  const run = (s: string) => annotateSentence(s, (k) => dict.lookup(k));
  const byText = (ws: AnnotatedWord[], t: string) => {
    const w = ws.find((x) => x.text === t);
    if (!w) throw new Error(`no ${t}`);
    return w;
  };

  it('uses weak forms inside a phrase and strong forms at the end', () => {
    const ws = run('Where are you from? I want to go.');
    expect(byText(ws, 'are')).toMatchObject({ weak: true, ipa: 'ɚ' });
    expect(byText(ws, 'from')).toMatchObject({ weak: false, ipa: 'frʌm' });
    expect(byText(ws, 'to')).toMatchObject({ weak: true, ipa: 'tə' });
  });

  it('chooses the pre-vowel weak form', () => {
    const ws = run('The apple, to an island.');
    expect(ws[0]).toMatchObject({ weak: true, ipa: 'ði', linkNext: 'j' });
    expect(byText(ws, 'to')).toMatchObject({ ipa: 'tu', linkNext: 'w' });
    expect(byText(ws, 'an')).toMatchObject({ weak: true, ipa: 'ən', linkNext: 'consonant' });
  });

  it('links consonant to vowel but not across punctuation', () => {
    const ws = run('Pick it up, it up.');
    expect(ws.map((w) => w.linkNext)).toEqual(['consonant', 'consonant', null, 'consonant', null]);
  });

  it('marks t/d elision before a consonant', () => {
    const ws = run('last night, I want to go');
    expect(byText(ws, 'last')).toMatchObject({ elided: true, ipa: 'læs(t)' });
    expect(byText(ws, 'night').elided).toBe(false);
    expect(byText(ws, 'want')).toMatchObject({ elided: true, ipa: 'wɑːn(t)' });
  });

  it('reads unknown hyphenated words part by part and keeps unknown words', () => {
    const ws = run('well-known zorblax');
    expect(ws[0]?.ipa).toBe('ˈwelˈnoʊn');
    expect(ws[1]).toMatchObject({ ipa: null, phones: null, warnings: [] });
  });

  it('treats a final -y with secondary stress as unstressed', () => {
    expect(run('company')[0]?.ipa).toBe('ˈkʌmpəni');
  });

  it('keeps punctuation around words', () => {
    const ws = run('“Pick it up,” I want');
    expect(ws[0]?.before).toBe('“');
    expect(byText(ws, 'up').after).toBe(',” ');
  });
});

describe('warningsFor', () => {
  const ids = (arpa: string, opts = {}) => warningsFor(parseArpabet(arpa), opts).map((w) => w.id);

  it('flags /θ ð æ ʃ ʒ tʃ dʒ/ with Vietnamese tips', () => {
    expect(ids('TH IH1 NG K')).toEqual(['th-voiceless', 'i-short', 'final']);
    expect(ids('DH IH1 S')).toEqual(['th-voiced', 'i-short', 'final']);
    expect(ids('M EH1 ZH ER0')).toEqual(['zh']);
    expect(ids('CH ER1 CH')).toEqual(['ch', 'final']);
    expect(ids('JH AA1 B')).toEqual(['dj', 'final']);
    const [th] = warningsFor(parseArpabet('TH IH1 NG K'));
    expect(th?.tip).toMatch(/đầu lưỡi/);
  });

  it('flags final clusters and non-Vietnamese finals, not m/n/ng', () => {
    const w = warningsFor(parseArpabet('N EH1 K S T')).find((x) => x.id === 'final');
    expect(w).toMatchObject({ sound: 'kst', indices: [2, 3, 4] });
    expect(ids('M AE1 N')).toEqual(['ae']);
    expect(ids('S IH1 NG')).toEqual(['i-short']);
  });

  it('skips the elided phone and reduced vowels', () => {
    const w = warningsFor(parseArpabet('N EH1 K S T'), { elidedLast: true }).find(
      (x) => x.id === 'final',
    );
    expect(w?.sound).toBe('ks');
    expect(ids('HH AE1 P IY0')).toEqual(['ae']);
  });

  it('only flags /θ ð/ in weak forms', () => {
    expect(ids('DH AH0', { weak: true })).toEqual(['th-voiced']);
    expect(ids('AH0 T', { weak: true })).toEqual([]);
  });
});
