/** One timed caption cue as it appears in the source. Times are in milliseconds. */
export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** A full sentence merged from one or more cues. Times are in milliseconds. */
export interface Sentence {
  /** Stable id: index plus hash of the normalized text. */
  id: string;
  /** Hash of the normalized text only, used for translation / IPA caches. */
  hash: string;
  start: number;
  end: number;
  text: string;
}

/** Where a track came from. */
export type TrackSource = 'player' | 'file' | 'paste' | 'ocr';

/** `manual` = human captions, `asr` = auto-generated. */
export type TrackKind = 'manual' | 'asr' | 'unknown';

export interface CaptionTrack {
  videoId: string;
  lang: string;
  kind: TrackKind;
  source: TrackSource;
  /** False when the source had no timestamps (plain pasted text). */
  timed: boolean;
  sentences: Sentence[];
}
