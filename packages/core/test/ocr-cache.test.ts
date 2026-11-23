import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../src/adapters';
import { loadOcrCues, OCR_CACHE_VIDEOS, OcrCueBuilder, saveOcrCues } from '../src/ocr';

const cue = (start: number, text: string) => ({ start, end: start + 2000, text });

describe('lines read from the picture, kept per video', () => {
  it('saves and loads a video’s lines', async () => {
    const storage = createMemoryStorage();
    await saveOcrCues(storage, 'abcdefghijk', [cue(0, 'So what do we do now?')]);
    expect(await loadOcrCues(storage, 'abcdefghijk')).toEqual([cue(0, 'So what do we do now?')]);
    expect(await loadOcrCues(storage, 'zzzzzzzzzzz')).toBeNull();
  });

  it('keeps only the most recent videos', async () => {
    const storage = createMemoryStorage();
    for (let i = 0; i <= OCR_CACHE_VIDEOS; i++) {
      await saveOcrCues(storage, `video${String(i).padStart(6, '0')}`, [cue(0, 'Hello there.')], i);
    }
    expect(await loadOcrCues(storage, 'video000000')).toBeNull();
    expect(
      await loadOcrCues(storage, `video${String(OCR_CACHE_VIDEOS).padStart(6, '0')}`),
    ).not.toBeNull();
  });

  it('ignores anything that is not a list of lines', async () => {
    const storage = createMemoryStorage({
      'ocr:abcdefghijk': [
        cue(0, 'Fine line.'),
        { start: 'x', end: 1, text: 'bad' },
        cue(-5, 'neg'),
      ],
      'ocr:lmnopqrstuv': 'not a list',
    });
    expect(await loadOcrCues(storage, 'abcdefghijk')).toEqual([cue(0, 'Fine line.')]);
    expect(await loadOcrCues(storage, 'lmnopqrstuv')).toBeNull();
    expect(await loadOcrCues(storage, '../etc')).toBeNull();
  });

  it('a builder starts from saved lines and keeps reading after them', () => {
    const b = new OcrCueBuilder();
    b.seed([cue(0, 'So what do we do now?')]);
    b.feed(3000, { text: 'I think we should go.', confidence: 90 });
    b.feed(3500, { text: 'I think we should go.', confidence: 90 });
    b.feed(4500, { text: '', confidence: 0 });
    expect(b.getCues().map((c) => c.text)).toEqual([
      'So what do we do now?',
      'I think we should go.',
    ]);
    // Something already read is not replaced by an older save.
    b.seed([cue(0, 'Old line.')]);
    expect(b.getCues()).toHaveLength(2);
  });
});
