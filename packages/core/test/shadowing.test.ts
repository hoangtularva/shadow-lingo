import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerAdapter } from '../src/adapters';
import { computePeaks, isPeaks, resamplePeaks } from '../src/shadowing/peaks';
import { SentencePlayback } from '../src/shadowing/playback';

describe('peaks', () => {
  it('takes the loudest sample per slice, normalized', () => {
    const samples = [0, 0.1, -0.5, 0.2, 0, 0.25, 0, 0];
    expect(computePeaks(samples, 4)).toEqual([0.2, 1, 0.5, 0]);
  });

  it('gives zeros for silence or empty input', () => {
    expect(computePeaks([], 3)).toEqual([0, 0, 0]);
    expect(computePeaks([0, 0.00001, 0], 3)).toEqual([0, 0, 0]);
  });

  it('works when there are fewer samples than slices', () => {
    expect(computePeaks([0.5, 1], 4)).toEqual([0.5, 0.5, 1, 1]);
  });

  it('resamples to fewer or more bars', () => {
    expect(resamplePeaks([0.1, 0.9, 0.3, 0.4], 2)).toEqual([0.9, 0.4]);
    expect(resamplePeaks([0.2, 0.8], 4)).toEqual([0.2, 0.2, 0.8, 0.8]);
    expect(resamplePeaks([], 2)).toEqual([0, 0]);
    expect(resamplePeaks([1], 0)).toEqual([]);
  });

  it('validates peaks from messages', () => {
    expect(isPeaks([0, 0.5, 1])).toBe(true);
    expect(isPeaks([1.5])).toBe(false);
    expect(isPeaks([Number.NaN])).toBe(false);
    expect(isPeaks('x')).toBe(false);
    expect(isPeaks(new Array(41).fill(0))).toBe(false);
  });
});

/** A player whose clock moves only when `advance` is called while playing. */
function clockPlayer() {
  let time = 0;
  let paused = true;
  const player: PlayerAdapter = {
    getCurrentTime: () => time,
    seekTo: vi.fn((ms: number) => {
      time = ms;
    }),
    play: vi.fn(() => {
      paused = false;
    }),
    pause: vi.fn(() => {
      paused = true;
    }),
    isPaused: () => paused,
    getPlaybackRate: () => 1,
    setPlaybackRate: () => undefined,
    onTimeUpdate: () => () => undefined,
  };
  /** Moves the clock in 40 ms steps (one poll each). */
  const advance = (ms: number) => {
    for (let done = 0; done < ms; done += 40) {
      if (!paused) time += 40;
      vi.advanceTimersByTime(40);
    }
  };
  return {
    player,
    advance,
    get time() {
      return time;
    },
    get paused() {
      return paused;
    },
  };
}

const FIRST = { start: 0, end: 1000 };
const SECOND = { start: 1000, end: 2000 };
const THIRD = { start: 2500, end: 4000 };
const SENTENCES = [FIRST, SECOND, THIRD];

describe('SentencePlayback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays one sentence and stops just inside its end', async () => {
    const c = clockPlayer();
    const p = new SentencePlayback(c.player);
    p.setSentences(SENTENCES);
    const done = p.playSegment(SECOND);
    expect(c.time).toBe(1000);
    expect(c.paused).toBe(false);
    c.advance(1100);
    await expect(done).resolves.toBe(true);
    expect(c.paused).toBe(true);
    expect(c.time).toBe(1999);
    p.dispose();
  });

  it('resolves false when the player never starts', async () => {
    const c = clockPlayer();
    c.player.play = () => undefined;
    const p = new SentencePlayback(c.player);
    const done = p.playSegment(FIRST);
    c.advance(1000);
    await expect(done).resolves.toBe(false);
    p.dispose();
  });

  it('a new segment cancels the previous one', async () => {
    const c = clockPlayer();
    const p = new SentencePlayback(c.player);
    const first = p.playSegment(FIRST);
    const second = p.playSegment(THIRD);
    await expect(first).resolves.toBe(false);
    c.advance(1600);
    await expect(second).resolves.toBe(true);
    p.dispose();
  });

  it('loops A–B: back to A at B, still playing, until cleared', () => {
    const c = clockPlayer();
    const p = new SentencePlayback(c.player);
    p.setSentences(SENTENCES);
    p.setLoop({ start: FIRST.start, end: SECOND.end });
    c.player.seekTo(500);
    c.player.play();
    c.advance(1600); // past B (2000)
    expect(c.time).toBeLessThan(500);
    expect(c.paused).toBe(false);
    p.setLoop(null);
    c.advance(2600);
    expect(c.time).toBeGreaterThan(2000);
    p.dispose();
  });

  it('ignores an empty or reversed loop', () => {
    const c = clockPlayer();
    const p = new SentencePlayback(c.player);
    p.setLoop({ start: 2000, end: 2000 });
    expect(p.getLoop()).toBeNull();
    p.setLoop({ start: 3000, end: 1000 });
    expect(p.getLoop()).toBeNull();
    p.dispose();
  });

  it('auto-pause stops at each sentence end, then plays on from there', () => {
    const c = clockPlayer();
    const p = new SentencePlayback(c.player);
    p.setSentences(SENTENCES);
    p.setAutoPause(true);
    c.player.play();
    c.advance(1200);
    expect(c.paused).toBe(true);
    expect(c.time).toBe(999);
    // Play on: must not stop again at the same end.
    c.player.play();
    c.advance(400);
    expect(c.paused).toBe(false);
    c.advance(800);
    expect(c.paused).toBe(true);
    expect(c.time).toBe(1999);
    p.dispose();
  });

  it('does not pause when auto-pause is off or after a seek', () => {
    const c = clockPlayer();
    const p = new SentencePlayback(c.player);
    p.setSentences(SENTENCES);
    c.player.play();
    c.advance(1500);
    expect(c.paused).toBe(false);
    p.setAutoPause(true);
    // A jump over a sentence end is a seek, not playback.
    c.player.seekTo(3000);
    c.advance(80);
    expect(c.paused).toBe(false);
    p.dispose();
  });
});
