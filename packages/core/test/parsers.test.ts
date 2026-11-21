import { describe, expect, it } from 'vitest';
import {
  cleanText,
  formatTimestamp,
  parseCaptions,
  parseJson3,
  parsePastedText,
  parseSrt,
  parseTimedTextXml,
  parseTimestamp,
  parseVtt,
} from '../src/parsers';

describe('text utils', () => {
  it('parses timestamps in several layouts', () => {
    expect(parseTimestamp('00:00:01,500')).toBe(1500);
    expect(parseTimestamp('01:02:03.004')).toBe(3723004);
    expect(parseTimestamp('1:05')).toBe(65000);
    expect(parseTimestamp('12:05.5')).toBe(725500);
    expect(parseTimestamp('1:02:03')).toBe(3723000);
    expect(parseTimestamp('abc')).toBeNaN();
    expect(parseTimestamp('0:75')).toBeNaN();
  });

  it('formats timestamps', () => {
    expect(formatTimestamp(65000)).toBe('1:05');
    expect(formatTimestamp(3723004)).toBe('1:02:03');
    expect(formatTimestamp(-5)).toBe('0:00');
  });

  it('strips tags and decodes entities without parsing HTML', () => {
    expect(cleanText('<i>Tom &amp; Jerry</i>\n&#39;hi&#39; &lt;b&gt;')).toBe(
      "Tom & Jerry 'hi' <b>",
    );
    expect(cleanText('{\\an8}<c.yellow>top</c>')).toBe('top');
    expect(cleanText('&#0; &bogus;')).toBe('&#0; &bogus;');
  });
});

describe('parseJson3', () => {
  it('reads manual events and skips empty ones', () => {
    const doc = {
      events: [
        { tStartMs: 0, dDurationMs: 1000 },
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Hello\nworld.' }] },
        { tStartMs: 3000, dDurationMs: 500, segs: [{ utf8: '\n' }] },
      ],
    };
    expect(parseJson3(JSON.stringify(doc))).toEqual([
      { start: 1000, end: 3000, text: 'Hello world.' },
    ]);
  });

  it('splits auto-generated word segments using offsets', () => {
    const doc = {
      events: [
        {
          tStartMs: 500,
          dDurationMs: 3000,
          segs: [
            { utf8: 'so' },
            { utf8: ' today', tOffsetMs: 400 },
            { utf8: ' we', tOffsetMs: 900 },
          ],
        },
      ],
    };
    expect(parseJson3(doc)).toEqual([
      { start: 500, end: 900, text: 'so' },
      { start: 900, end: 1400, text: 'today' },
      { start: 1400, end: 3500, text: 'we' },
    ]);
  });

  it('rejects other JSON', () => {
    expect(() => parseJson3('{"foo":1}')).toThrow();
  });
});

describe('parseSrt', () => {
  it('reads blocks with CRLF, BOM and tags', () => {
    const srt =
      '\uFEFF1\r\n00:00:01,000 --> 00:00:02,500\r\n<i>Hi there</i>\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nsecond\r\nline\r\n';
    expect(parseSrt(srt)).toEqual([
      { start: 1000, end: 2500, text: 'Hi there' },
      { start: 3000, end: 4000, text: 'second line' },
    ]);
  });

  it('skips broken blocks', () => {
    expect(parseSrt('1\nnot a time\ntext\n\n2\n00:00:01,000 --> 00:00:02,000\nok')).toHaveLength(1);
  });
});

describe('parseVtt', () => {
  it('skips header, notes and settings', () => {
    const vtt = `WEBVTT
Kind: captions

NOTE a comment

intro
00:01.000 --> 00:02.000 align:start position:0%
<v Roger>Hello <00:01.500><c>there</c>

00:02.000 --> 00:03.000
Next.`;
    expect(parseVtt(vtt)).toEqual([
      { start: 1000, end: 2000, text: 'Hello there' },
      { start: 2000, end: 3000, text: 'Next.' },
    ]);
  });

  it('removes rolling repeats from auto-generated VTT', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
we are going

00:00:02.000 --> 00:00:02.010
we are going

00:00:02.010 --> 00:00:04.000
we are going to the park`;
    expect(parseVtt(vtt).map((c) => c.text)).toEqual(['we are going', 'to the park']);
  });
});

describe('parsePastedText', () => {
  it('reads the copied transcript layout (time line, then text)', () => {
    const r = parsePastedText('0:00\nHello there.\n0:04\nHow are\nyou?\n1:02:03\nEnd');
    expect(r.timed).toBe(true);
    expect(r.cues).toEqual([
      { start: 0, end: 4000, text: 'Hello there.' },
      { start: 4000, end: 3723000, text: 'How are you?' },
      { start: 3723000, end: 3727000, text: 'End' },
    ]);
  });

  it('reads "time text" lines', () => {
    const r = parsePastedText('[0:01] one\n0:05 - two');
    expect(r.cues.map((c) => [c.start, c.text])).toEqual([
      [1000, 'one'],
      [5000, 'two'],
    ]);
  });

  it('falls back to untimed text', () => {
    const r = parsePastedText('First line.\n\nSecond line.');
    expect(r.timed).toBe(false);
    expect(r.cues.map((c) => c.text)).toEqual(['First line.', 'Second line.']);
  });
});

describe('parseTimedTextXml', () => {
  it('reads srv3 and srv1', () => {
    const srv3 =
      '<?xml version="1.0"?><timedtext format="3"><body><p t="100" d="900">A &amp; B</p><p t="1000" d="500"><s>C</s><s> D</s></p></body></timedtext>';
    expect(parseTimedTextXml(srv3)).toEqual([
      { start: 100, end: 1000, text: 'A & B' },
      { start: 1000, end: 1500, text: 'C D' },
    ]);
    const srv1 = '<transcript><text start="1.5" dur="2">hi</text></transcript>';
    expect(parseTimedTextXml(srv1)).toEqual([{ start: 1500, end: 3500, text: 'hi' }]);
  });

  it('throws on invalid XML', () => {
    expect(() => parseTimedTextXml('<timedtext><p>')).toThrow();
  });
});

describe('parseCaptions (detection)', () => {
  it('detects each format', () => {
    expect(parseCaptions('{"events":[]}').format).toBe('json3');
    expect(parseCaptions('WEBVTT\n\n00:01.000 --> 00:02.000\nx').format).toBe('vtt');
    expect(parseCaptions('1\n00:00:01,000 --> 00:00:02,000\nx').format).toBe('srt');
    expect(parseCaptions('<timedtext><body></body></timedtext>').format).toBe('xml');
    expect(parseCaptions('{not json').format).toBe('text');
    expect(parseCaptions('just words').format).toBe('text');
  });
});
