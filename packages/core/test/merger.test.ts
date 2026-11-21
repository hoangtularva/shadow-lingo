import { describe, expect, it } from 'vitest';
import { isPunctuated, mergeSentences } from '../src/merger';
import type { Cue } from '../src/types';

describe('mergeSentences', () => {
  it('joins cues that split a sentence and splits cues that hold two', () => {
    const cues: Cue[] = [
      { start: 0, end: 2000, text: 'Hello everyone, today we' },
      { start: 2000, end: 4000, text: 'talk about shadowing. It' },
      { start: 4000, end: 5000, text: 'works!' },
    ];
    const out = mergeSentences(cues);
    expect(out.map((s) => s.text)).toEqual([
      'Hello everyone, today we talk about shadowing.',
      'It works!',
    ]);
    expect(out[0]?.start).toBe(0);
    // "It" sits at the end of the second cue, so the second sentence starts inside it.
    expect(out[1]?.start).toBeGreaterThan(3000);
    expect(out[1]?.start).toBeLessThan(4000);
    expect(out[1]?.end).toBe(5000);
  });

  it('does not split on common abbreviations or initialisms', () => {
    const out = mergeSentences([
      { start: 0, end: 3000, text: 'Mr. Smith lives in the U.S. now. Dr. Who? Yes.' },
    ]);
    expect(out.map((s) => s.text)).toEqual([
      'Mr. Smith lives in the U.S. now.',
      'Dr. Who?',
      'Yes.',
    ]);
  });

  it('keeps closing quotes with the sentence', () => {
    const out = mergeSentences([{ start: 0, end: 1000, text: 'He said "stop." Then left.' }]);
    expect(out.map((s) => s.text)).toEqual(['He said "stop."', 'Then left.']);
  });

  it('breaks on speaker markers', () => {
    const out = mergeSentences([
      { start: 0, end: 1000, text: '>> how are you' },
      { start: 1000, end: 2000, text: '>> fine thanks' },
    ]);
    expect(out.map((s) => s.text)).toEqual(['how are you', 'fine thanks']);
  });

  it('uses pauses and a word cap for unpunctuated auto captions', () => {
    const cues: Cue[] = [
      { start: 0, end: 300, text: 'so' },
      { start: 300, end: 600, text: 'today' },
      { start: 3000, end: 3300, text: 'we' },
      { start: 3300, end: 3600, text: 'begin' },
    ];
    expect(mergeSentences(cues).map((s) => s.text)).toEqual(['so today', 'we begin']);

    const many: Cue[] = Array.from({ length: 50 }, (_, i) => ({
      start: i * 300,
      end: i * 300 + 300,
      text: `w${i}`,
    }));
    const capped = mergeSentences(many, { maxWords: 20 });
    expect(capped).toHaveLength(3);
    expect(capped[0]?.text.split(' ')).toHaveLength(20);
  });

  it('gives stable ids and text hashes', () => {
    const a = mergeSentences([{ start: 0, end: 1000, text: 'One. Two.' }]);
    const b = mergeSentences([{ start: 0, end: 1000, text: 'One.  Two.' }]);
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
    expect(a[0]?.hash).not.toBe(a[1]?.hash);
    expect(new Set(a.map((s) => s.id)).size).toBe(2);
  });

  it('handles empty input and unsorted cues', () => {
    expect(mergeSentences([])).toEqual([]);
    const out = mergeSentences([
      { start: 2000, end: 3000, text: 'second.' },
      { start: 0, end: 1000, text: 'First.' },
    ]);
    expect(out.map((s) => s.text)).toEqual(['First.', 'second.']);
  });
});

describe('isPunctuated', () => {
  it('detects punctuation density', () => {
    expect(isPunctuated([{ start: 0, end: 1, text: 'Hi. Bye.' }])).toBe(true);
    expect(isPunctuated([{ start: 0, end: 1, text: 'no marks at all here' }])).toBe(false);
    expect(isPunctuated([])).toBe(false);
  });
});
