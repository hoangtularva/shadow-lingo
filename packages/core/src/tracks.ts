import { mergeSentences } from './merger';
import { parseCaptions } from './parsers';
import type { CaptionTrack, TrackKind, TrackSource } from './types';

export interface BuildTrackInput {
  videoId: string;
  body: string;
  lang?: string;
  kind?: TrackKind;
  source: TrackSource;
}

/** Parses any supported caption text and merges it into a sentence track. */
export function buildTrack(input: BuildTrackInput): CaptionTrack {
  const { cues, timed } = parseCaptions(input.body);
  return {
    videoId: input.videoId,
    lang: input.lang ?? 'en',
    kind: input.kind ?? 'unknown',
    source: input.source,
    timed,
    sentences: mergeSentences(cues),
  };
}

export function isEnglish(lang: string): boolean {
  return /^en(\b|[-_])/i.test(lang) || lang.toLowerCase() === 'en';
}

function score(track: CaptionTrack): number {
  if (track.sentences.length === 0) return -1;
  const english = isEnglish(track.lang) ? 10 : 0;
  const human = track.kind === 'manual' ? 2 : track.kind === 'unknown' ? 1 : 0;
  return english + human;
}

/** Preferred track: manual English, then auto-generated English, then anything else. */
export function pickPreferredTrack(tracks: readonly CaptionTrack[]): CaptionTrack | undefined {
  let best: CaptionTrack | undefined;
  for (const t of tracks) {
    if (score(t) < 0) continue;
    if (!best || score(t) > score(best)) best = t;
  }
  return best;
}
