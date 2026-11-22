import type { PlayerAdapter } from '../adapters';
import { findActiveIndex, type Timed } from '../sync';

/** Speeds offered by the "Tốc độ" chips (UI spec). */
export const SPEEDS = [0.5, 0.75, 1] as const;

/** Longest recording; the recorder stops by itself after this. */
export const MAX_RECORDING_MS = 30_000;

/** A forward step bigger than this between two polls is a seek, not playback. */
const SEEK_JUMP_MS = 1000;
/** A segment is cancelled if the player is still paused after this (user pause, no media). */
const START_GRACE_MS = 600;

interface ActiveSegment {
  end: number;
  startedAt: number;
  resolve(ended: boolean): void;
}

/**
 * Sentence-level playback for shadowing: play one sentence and stop at its end, and
 * "Tự dừng sau câu" (pause at every sentence end). Polls the player only while one of
 * them is active, so sentence ends are caught within ~40 ms (timeupdate is ~250 ms).
 */
export class SentencePlayback {
  private sentences: readonly Timed[] = [];
  private autoPause = false;
  private segment: ActiveSegment | null = null;
  private last: number | null = null;
  /** End just stopped at: playing on from there must not stop again. */
  private heldEnd: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly player: PlayerAdapter,
    private readonly pollMs = 40,
  ) {}

  setSentences(sentences: readonly Timed[]): void {
    this.sentences = sentences;
    this.heldEnd = null;
  }

  setAutoPause(on: boolean): void {
    this.autoPause = on;
    this.last = null;
    this.schedule();
  }

  /** Plays [start, end) and pauses at the end. Resolves true at the end, false if cut short. */
  playSegment(seg: Timed): Promise<boolean> {
    this.cancelSegment();
    this.heldEnd = null;
    this.last = null;
    this.player.seekTo(seg.start);
    this.player.play();
    return new Promise<boolean>((resolve) => {
      this.segment = { end: seg.end, startedAt: Date.now(), resolve };
      this.schedule();
    });
  }

  cancelSegment(): void {
    const seg = this.segment;
    if (!seg) return;
    this.segment = null;
    seg.resolve(false);
    this.schedule();
  }

  dispose(): void {
    this.cancelSegment();
    this.autoPause = false;
    this.schedule();
  }

  private schedule(): void {
    const needed = this.autoPause || this.segment !== null;
    if (needed && !this.timer) this.timer = setInterval(() => this.tick(), this.pollMs);
    else if (!needed && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Pauses at `end`, staying inside the sentence so it remains the spoken one. */
  private stopAt(end: number, start: number): void {
    this.player.pause();
    this.player.seekTo(Math.max(start, end - 1));
    this.heldEnd = end;
    this.last = null;
  }

  private tick(): void {
    const t = this.player.getCurrentTime();
    const paused = this.player.isPaused();
    const seg = this.segment;
    if (seg) {
      if (t >= seg.end) {
        this.segment = null;
        const i = findActiveIndex(this.sentences, seg.end - 1);
        this.stopAt(seg.end, this.sentences[i]?.start ?? 0);
        seg.resolve(true);
        this.schedule();
        return;
      }
      if (paused && Date.now() - seg.startedAt > START_GRACE_MS) {
        this.segment = null;
        seg.resolve(false);
        this.schedule();
      }
      return;
    }
    if (paused) {
      this.last = null;
      return;
    }
    const last = this.last;
    this.last = t;
    if (last === null) return;
    if (t < last || t - last >= SEEK_JUMP_MS) {
      this.heldEnd = null;
      return;
    }
    if (!this.autoPause) return;
    const s = this.sentences[findActiveIndex(this.sentences, last)];
    if (s && s.end !== this.heldEnd && last < s.end && t >= s.end) this.stopAt(s.end, s.start);
  }
}
