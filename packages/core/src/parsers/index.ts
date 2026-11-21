import type { Cue } from '../types';
import { isJson3, parseJson3 } from './json3';
import { isSrt, parseSrt } from './srt';
import { parsePastedText } from './text';
import { isVtt, parseVtt } from './vtt';
import { isTimedTextXml, parseTimedTextXml } from './xml';

export { parseJson3, isJson3 } from './json3';
export { parseSrt, isSrt } from './srt';
export { parseVtt, isVtt } from './vtt';
export { parsePastedText } from './text';
export { parseTimedTextXml, isTimedTextXml } from './xml';
export {
  cleanText,
  decodeEntities,
  formatTimestamp,
  parseTimestamp,
  stripTags,
} from './text-utils';

export type CaptionFormat = 'json3' | 'xml' | 'vtt' | 'srt' | 'text';

export interface DetectedCaptions {
  format: CaptionFormat;
  cues: Cue[];
  timed: boolean;
}

function tryJson(input: string): unknown {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith('{')) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

/** Detects the caption format of a file or pasted text and parses it into cues. */
export function parseCaptions(input: string): DetectedCaptions {
  const json = tryJson(input);
  if (json !== undefined && isJson3(json)) {
    return { format: 'json3', cues: parseJson3(json), timed: true };
  }
  if (isVtt(input)) return { format: 'vtt', cues: parseVtt(input), timed: true };
  if (isSrt(input)) return { format: 'srt', cues: parseSrt(input), timed: true };
  if (isTimedTextXml(input)) {
    return { format: 'xml', cues: parseTimedTextXml(input), timed: true };
  }
  const { cues, timed } = parsePastedText(input);
  return { format: 'text', cues, timed };
}
