import { describe, expect, it } from 'vitest';
import { buildOcrTrack, cleanOcrText, OcrCueBuilder, similarity } from '../src/ocr';

const r = (text: string, confidence = 85) => ({ text, confidence });

describe('cleanOcrText', () => {
  it('drops frame-edge noise and keeps real subtitles', () => {
    expect(cleanOcrText('| I think we should figure it out together, ,')).toBe(
      'I think we should figure it out together,',
    );
    expect(cleanOcrText('Researchers followed 724 men for 75 years. |')).toBe(
      'Researchers followed 724 men for 75 years.',
    );
    expect(cleanOcrText('| ~ |')).toBe('');
    expect(cleanOcrText('| think we should go.')).toBe('I think we should go.');
    expect(cleanOcrText('So l think so.')).toBe('So I think so.');
    expect(cleanOcrText('4K')).toBe('');
  });

  it('measures how alike two readings are', () => {
    expect(
      similarity('Let’s start with the easy part', "Let's start with theleasy part"),
    ).toBeGreaterThan(0.85);
    expect(similarity('So what do we do now?', 'First, we need a plan.')).toBeLessThan(0.4);
  });
});

describe('OcrCueBuilder', () => {
  it('times each subtitle from when it appears to when it changes', () => {
    const b = new OcrCueBuilder();
    b.feed(1000, r('So what do we do now?'));
    b.feed(1500, r('So what do we do now?'));
    b.same(2000);
    b.feed(2500, r('I think we should figure it out together.'));
    b.feed(3000, r('I think we shou1d figure it out together.', 70));
    b.feed(4200, r(''));
    expect(b.getCues()).toEqual([
      { start: 1000, end: 2500, text: 'So what do we do now?' },
      { start: 2500, end: 4200, text: 'I think we should figure it out together.' },
    ]);
  });

  it('a part of a line read while it appears is the same line; the full text wins', () => {
    const b = new OcrCueBuilder();
    b.feed(0, r('what are you'));
    b.feed(500, r('Karen, what are you doing?'));
    b.feed(1000, r('Karen, what are you doing?'));
    b.feed(1500, r(''));
    expect(b.getCues()).toEqual([{ start: 0, end: 1500, text: 'Karen, what are you doing?' }]);
  });

  it('a reading seen only once (the picture changing) is dropped', () => {
    const b = new OcrCueBuilder();
    b.feed(0, r('Thank you, grandma.'));
    b.feed(500, r('Thank you, grandma.'));
    b.feed(1000, r('Thank Qn A On'));
    b.feed(1500, r('Ten dollars please.'));
    b.feed(2000, r('Ten dollars please.'));
    b.feed(2500, r(''));
    expect(b.getCues().map((c) => c.text)).toEqual(['Thank you, grandma.', 'Ten dollars please.']);
  });

  it('a line seen twice is listed while still on screen, then gets its real end', () => {
    const b = new OcrCueBuilder();
    expect(b.feed(0, r('Take a deep breath.'))).toBe(false);
    expect(b.getCues()).toEqual([]);
    expect(b.feed(500, r('Take a deep breath.'))).toBe(true);
    expect(b.getCues()).toEqual([{ start: 0, end: 1000, text: 'Take a deep breath.' }]);
    expect(b.same(1000)).toBe(false);
    expect(b.feed(1500, r(''))).toBe(true);
    expect(b.getCues()).toEqual([{ start: 0, end: 1500, text: 'Take a deep breath.' }]);
  });

  it('readings from a place that turned out not to hold subtitles are taken back', () => {
    const b = new OcrCueBuilder();
    b.feed(0, r('So what do we do now?'));
    b.feed(1000, r(''));
    b.checkpoint();
    b.feed(1500, r('English Short Stories For Kids'));
    b.feed(2000, r('English Short Stories For Kids'));
    expect(b.getCues()).toHaveLength(2);
    expect(b.rollback()).toBe(true);
    expect(b.getCues().map((c) => c.text)).toEqual(['So what do we do now?']);
    expect(b.rollback()).toBe(false);
    b.checkpoint();
    b.feed(3000, r('Take a deep breath.'));
    b.commit();
    expect(b.rollback()).toBe(false);
  });

  it('ignores unsure readings and flickers', () => {
    const b = new OcrCueBuilder();
    b.feed(0, r('Random scene text here', 30));
    b.feed(500, r('A flash of words', 90));
    b.feed(700, r(''));
    expect(b.getCues()).toEqual([]);
  });

  it('does not add a line twice after a seek back', () => {
    const b = new OcrCueBuilder();
    b.feed(1000, r('So what do we do now?'));
    b.feed(2000, r(''));
    b.feed(1100, r('So what do we do now?')); // seek back
    b.feed(1900, r(''));
    expect(b.getCues()).toHaveLength(1);
    expect(b.getCues()[0]).toMatchObject({ start: 1000, end: 2000 });
  });

  it('builds a timed OCR track for the panel', () => {
    const b = new OcrCueBuilder();
    b.feed(0, r('Hello there everyone.'));
    b.feed(500, r('Hello there everyone.'));
    b.feed(1500, r('How are you today?'));
    b.feed(2000, r('How are you today?'));
    b.flush();
    const track = buildOcrTrack('abc', b.getCues());
    expect(track).toMatchObject({ source: 'ocr', timed: true, lang: 'en' });
    expect(track.sentences.map((s) => s.text)).toEqual([
      'Hello there everyone.',
      'How are you today?',
    ]);
  });
});
