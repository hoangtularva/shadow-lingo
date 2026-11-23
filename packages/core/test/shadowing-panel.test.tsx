import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi as vitestVi } from 'vitest';
import type { PlayerAdapter, RecorderAdapter, RecorderStartResult } from '../src/adapters';
import { setFlags } from '../src/features';
import { Panel } from '../src/panel/Panel';
import { createPanelStore } from '../src/panel/store';
import { vi } from '../src/panel/strings';
import { buildTrack } from '../src/tracks';

const SRT = `1
00:00:01,000 --> 00:00:03,000
Hello there.

2
00:00:03,000 --> 00:00:05,000
How are you today?
`;

function fakePlayer() {
  let listener: ((ms: number) => void) | null = null;
  let time = 0;
  let paused = true;
  let rate = 1;
  const player: PlayerAdapter = {
    getCurrentTime: () => time,
    seekTo: vitestVi.fn((ms: number) => {
      time = ms;
    }),
    play: vitestVi.fn(() => {
      paused = false;
    }),
    pause: vitestVi.fn(() => {
      paused = true;
    }),
    isPaused: () => paused,
    getPlaybackRate: () => rate,
    setPlaybackRate: vitestVi.fn((r: number) => {
      rate = r;
    }),
    onTimeUpdate(cb) {
      listener = cb;
      return () => {
        listener = null;
      };
    },
  };
  const tick = (ms: number) => {
    time = ms;
    act(() => listener?.(ms));
  };
  return { player, tick };
}

function fakeRecorder(startResult: RecorderStartResult = { ok: true }) {
  const recorder: RecorderAdapter = {
    start: vitestVi.fn(() => Promise.resolve(startResult)),
    stop: vitestVi.fn(() =>
      Promise.resolve({ durationMs: 2000, peaks: new Array<number>(40).fill(0.5) }),
    ),
    play: vitestVi.fn(() => Promise.resolve(true)),
    stopPlayback: vitestVi.fn(() => Promise.resolve()),
  };
  return recorder;
}

function setup(recorder: RecorderAdapter | null = fakeRecorder()) {
  const store = createPanelStore({ theme: 'dark' });
  // Folded by default; these tests work with the open section.
  store.getState().setShadowingCollapsed(false);
  store.getState().setVideo('abc');
  store
    .getState()
    .setTrack(
      buildTrack({ videoId: 'abc', body: SRT, lang: 'en', kind: 'manual', source: 'player' }),
    );
  const { player, tick } = fakePlayer();
  render(<Panel store={store} player={player} recorder={recorder} />);
  tick(1500);
  return { store, player, tick, recorder };
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

describe('Shadowing section', () => {
  it('shows the steps, rows and buttons from the spec', () => {
    setup();
    expect(screen.getByTestId('sl-steps').dataset.step).toBe('1');
    expect(screen.getByText(vi.stepListen)).toBeTruthy();
    expect(screen.getByText(vi.original)).toBeTruthy();
    expect(screen.getByText(vi.yourVoice)).toBeTruthy();
    expect(screen.getByTestId('sl-record').textContent).toContain(vi.record);
    expect((screen.getByTestId('sl-compare') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('sl-speed-1').getAttribute('aria-pressed')).toBe('true');
  });

  it('records, shows the waveform and compares', async () => {
    const { recorder, player } = setup();
    fireEvent.click(screen.getByTestId('sl-record'));
    await flush();
    expect(recorder?.start).toHaveBeenCalled();
    expect(screen.getByTestId('sl-steps').dataset.step).toBe('2');
    expect(screen.getByTestId('sl-record').textContent).toContain(vi.stop);
    fireEvent.keyDown(screen.getByTestId('sl-panel'), { key: 'r' });
    await flush();
    expect(recorder?.stop).toHaveBeenCalled();
    expect(screen.getByTestId('sl-steps').dataset.step).toBe('3');
    // 2 s take vs 2 s sentence: full row of 40 bars.
    expect(screen.getByTestId('sl-wave-you').dataset.bars).toBe('40');
    fireEvent.keyDown(screen.getByTestId('sl-panel'), { key: 'c' });
    expect(player.seekTo).toHaveBeenLastCalledWith(1000);
    expect(player.play).toHaveBeenCalled();
  });

  it('S replays the spoken sentence', () => {
    const { player } = setup();
    fireEvent.keyDown(screen.getByTestId('sl-panel'), { key: 's' });
    expect(player.seekTo).toHaveBeenLastCalledWith(1000);
    expect(player.play).toHaveBeenCalled();
  });

  it('asks for microphone permission when it is missing', async () => {
    const { store } = setup(fakeRecorder({ ok: false, reason: 'permission' }));
    fireEvent.click(screen.getByTestId('sl-record'));
    await flush();
    expect(store.getState().notice).toBe(vi.micPermission);
    expect(screen.getByTestId('sl-record').textContent).toContain(vi.record);
  });

  it('a new sentence clears the take', async () => {
    const { tick } = setup();
    fireEvent.click(screen.getByTestId('sl-record'));
    await flush();
    fireEvent.click(screen.getByTestId('sl-record'));
    await flush();
    expect(screen.getByTestId('sl-wave-you').dataset.bars).toBe('40');
    tick(3500);
    expect(screen.getByTestId('sl-wave-you').dataset.bars).toBe('0');
    expect(screen.getByTestId('sl-steps').dataset.step).toBe('1');
  });

  it('counts replays of the spoken sentence ("lặp lần N")', async () => {
    setup();
    expect(screen.getByTestId('sl-speaking').textContent).toBe(vi.speaking);
    fireEvent.click(screen.getByTestId('sl-replay'));
    fireEvent.click(screen.getByTestId('sl-replay'));
    fireEvent.click(screen.getByTestId('sl-replay'));
    expect(screen.getByTestId('sl-speaking').textContent).toBe(
      `${vi.speaking} · ${vi.repeatCount(3)}`,
    );
  });

  it('is folded by default', () => {
    expect(createPanelStore({ theme: 'dark' }).getState().shadowingCollapsed).toBe(true);
  });

  it('folds to the steps row; keys still work', () => {
    const { store, player } = setup();
    fireEvent.click(screen.getByTestId('sl-shadowing-toggle'));
    expect(store.getState().shadowingCollapsed).toBe(true);
    expect(screen.getByTestId('sl-shadowing').dataset.collapsed).toBe('true');
    expect(screen.getByTestId('sl-steps')).toBeTruthy();
    expect(screen.queryByTestId('sl-record')).toBeNull();
    expect(screen.getByTestId('sl-shadowing-toggle').getAttribute('aria-label')).toBe(
      vi.shadowingExpand,
    );
    fireEvent.keyDown(screen.getByTestId('sl-panel'), { key: 's' });
    expect(player.seekTo).toHaveBeenLastCalledWith(1000);
    fireEvent.click(screen.getByTestId('sl-shadowing-toggle'));
    expect(screen.getByTestId('sl-record')).toBeTruthy();
  });

  it('sets the playback speed', () => {
    const { player } = setup();
    fireEvent.click(screen.getByTestId('sl-speed-0.75'));
    expect(player.setPlaybackRate).toHaveBeenCalledWith(0.75);
    expect(screen.getByTestId('sl-speed-0.75').getAttribute('aria-pressed')).toBe('true');
  });

  it('offers 1.25× too', () => {
    const { player } = setup();
    fireEvent.click(screen.getByTestId('sl-speed-1.25'));
    expect(player.setPlaybackRate).toHaveBeenCalledWith(1.25);
    expect(screen.getByTestId('sl-speed-1.25').textContent).toBe('1.25×');
  });

  it('loops A–B: set at the spoken sentences, back to A at B, cleared on demand', () => {
    vitestVi.useFakeTimers();
    try {
      const { player, tick } = setup();
      expect(screen.queryByTestId('sl-loop-count')).toBeNull();
      fireEvent.click(screen.getByTestId('sl-loop-a')); // spoken: sentence 1 (1–3 s)
      expect(screen.getByTestId('sl-loop-a').textContent).toBe('A · 0:01');
      expect(screen.queryByTestId('sl-loop-count')).toBeNull();
      tick(3500); // sentence 2 (3–5 s)
      fireEvent.keyDown(screen.getByTestId('sl-panel'), { key: 'b' });
      expect(screen.getByTestId('sl-loop-b').textContent).toBe('B · 0:05');
      expect(screen.getByTestId('sl-loop-count').textContent).toBe(vi.loopCount(2));
      // Playing past B jumps back to A.
      player.play();
      tick(5200);
      act(() => {
        vitestVi.advanceTimersByTime(100);
      });
      expect(player.seekTo).toHaveBeenLastCalledWith(1000);
      fireEvent.click(screen.getByTestId('sl-loop-clear'));
      expect(screen.queryByTestId('sl-loop-clear')).toBeNull();
      expect(screen.getByTestId('sl-loop-a').getAttribute('aria-pressed')).toBe('false');
    } finally {
      vitestVi.useRealTimers();
    }
  });

  it('the open section carries the sentence to read (shown on narrow panels)', () => {
    setup();
    const card = screen.getByTestId('sl-read-card');
    expect(card.textContent).toContain('Hello there.');
    expect(card.textContent).toContain(vi.speaking);
    fireEvent.click(screen.getByTestId('sl-shadowing-toggle'));
    expect(screen.queryByTestId('sl-read-card')).toBeNull();
  });

  it('respects the abLoop flag', () => {
    setFlags({ abLoop: false });
    setup();
    expect(screen.queryByTestId('sl-loop')).toBeNull();
  });

  it('hides recording without a recorder or when the flag is off', () => {
    setup(null);
    expect(screen.queryByTestId('sl-record')).toBeNull();
    expect(screen.getByTestId('sl-replay')).toBeTruthy();
  });

  it('respects the recordCompare flag', () => {
    setFlags({ recordCompare: false, playbackSpeed: false, autoPause: false });
    setup();
    expect(screen.queryByTestId('sl-record')).toBeNull();
    expect(screen.queryByTestId('sl-speed-1')).toBeNull();
    expect(screen.queryByTestId('sl-auto-pause')).toBeNull();
  });
});
