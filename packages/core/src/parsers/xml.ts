import type { Cue } from '../types';
import { cleanText } from './text-utils';

export function isTimedTextXml(input: string): boolean {
  return /^\s*(<\?xml[^>]*>\s*)?<(timedtext|transcript)[\s>]/.test(input);
}

/**
 * Parses YouTube's XML caption formats (srv3 `<p t d>` in ms, srv1 `<text start dur>` in s).
 * Uses DOMParser in XML mode, which never runs scripts; only textContent is read.
 */
export function parseTimedTextXml(input: string): Cue[] {
  const doc = new DOMParser().parseFromString(input, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Invalid caption XML');
  }
  const cues: Cue[] = [];
  for (const p of Array.from(doc.getElementsByTagName('p'))) {
    const start = Number(p.getAttribute('t'));
    const dur = Number(p.getAttribute('d') ?? 0);
    const text = cleanText(p.textContent ?? '');
    if (Number.isFinite(start) && text) cues.push({ start, end: start + Math.max(0, dur), text });
  }
  for (const t of Array.from(doc.getElementsByTagName('text'))) {
    const start = Number(t.getAttribute('start')) * 1000;
    const dur = Number(t.getAttribute('dur') ?? 0) * 1000;
    const text = cleanText(t.textContent ?? '');
    if (Number.isFinite(start) && text) cues.push({ start, end: start + Math.max(0, dur), text });
  }
  return cues.sort((a, b) => a.start - b.start);
}
