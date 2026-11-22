import {
  buildTrack,
  parseCaptions,
  pickPreferredTrack,
  type CaptionTrack,
  type Cue,
} from '@shadow-lingo/core';
import type { CaptionMessage } from './messages';

/**
 * Keeps the caption tracks captured for the current video only (in memory, never stored).
 * Messages for other videos, such as a pre-roll ad's captions, are dropped.
 */
export class CaptionCollector {
  private videoId: string | null = null;
  private tracks = new Map<string, CaptionTrack>();
  private vietnamese: Cue[] | null = null;

  setVideo(videoId: string | null): void {
    if (videoId === this.videoId) return;
    this.videoId = videoId;
    this.tracks.clear();
    this.vietnamese = null;
  }

  /** Adds a captured response. Returns the preferred track if this one was accepted. */
  add(msg: CaptionMessage): CaptionTrack | undefined {
    if (!this.videoId || msg.videoId !== this.videoId) return undefined;
    // Translated tracks (tlang) are machine translations of another track: skip them.
    if (msg.tlang) return undefined;
    let track: CaptionTrack;
    try {
      track = buildTrack({
        videoId: msg.videoId,
        body: msg.body,
        lang: msg.lang,
        kind: msg.kind === 'asr' ? 'asr' : 'manual',
        source: 'player',
      });
    } catch {
      return undefined;
    }
    if (track.sentences.length === 0 || !track.timed) return undefined;
    this.tracks.set(`${msg.lang}|${msg.kind}`, track);
    if (isVietnamese(msg.lang) && msg.kind !== 'asr') {
      this.vietnamese = parseCaptions(msg.body).cues;
    }
    return this.preferred();
  }

  /** Cues of the human Vietnamese captions, once the learner showed them in the player. */
  vietnameseCues(): Cue[] | null {
    return this.vietnamese;
  }

  preferred(): CaptionTrack | undefined {
    return pickPreferredTrack([...this.tracks.values()]);
  }
}

function isVietnamese(lang: string): boolean {
  return /^vi([-_]|$)/i.test(lang);
}
