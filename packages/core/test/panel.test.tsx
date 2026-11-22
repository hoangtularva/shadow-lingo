import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi as vitestVi } from 'vitest';
import type { PlayerAdapter } from '../src/adapters';
import { setFlags } from '../src/features';
import { Panel } from '../src/panel/Panel';
import { createPanelStore } from '../src/panel/store';
import { vi } from '../src/panel/strings';
import { buildTrack } from '../src/tracks';

function fakePlayer() {
  let listener: ((ms: number) => void) | null = null;
  let time = 0;
  let paused = true;
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
    getPlaybackRate: () => 1,
    setPlaybackRate: () => undefined,
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

const SRT = `1
00:00:01,000 --> 00:00:03,000
Hello there. How are

2
00:00:03,000 --> 00:00:05,000
you today?
`;

function setup(trackBody?: string) {
  const store = createPanelStore({ theme: 'dark' });
  store.getState().setVideo('abc');
  if (trackBody) {
    store.getState().setTrack(
      buildTrack({
        videoId: 'abc',
        body: trackBody,
        lang: 'en',
        kind: 'manual',
        source: 'player',
      }),
    );
  }
  const { player, tick } = fakePlayer();
  const utils = render(<Panel store={store} player={player} />);
  return { store, player, tick, ...utils };
}

describe('Panel', () => {
  it('shows the empty state with paste and file options while waiting', () => {
    setup();
    expect(screen.getByText(vi.waitingTitle)).toBeTruthy();
    expect(screen.getByTestId('sl-paste')).toBeTruthy();
    expect(screen.getByText(vi.openFile)).toBeTruthy();
  });

  it('loads a pasted transcript', () => {
    setup();
    fireEvent.change(screen.getByTestId('sl-paste'), { target: { value: SRT } });
    fireEvent.click(screen.getByTestId('sl-paste-submit'));
    const items = screen.getAllByTestId('sl-sentence');
    expect(items.map((i) => i.textContent)).toEqual(['0:01Hello there.', '0:02How are you today?']);
    expect(screen.getByTestId('sl-source').textContent).toContain(vi.sourcePaste);
  });

  it('shows an error for empty paste', () => {
    setup();
    fireEvent.click(screen.getByTestId('sl-paste-submit'));
    expect(screen.getByRole('alert').textContent).toBe(vi.emptyPaste);
  });

  it('loads an opened file', async () => {
    setup();
    const file = new File([SRT], 'talk.srt', { type: 'application/x-subrip' });
    await act(async () => {
      fireEvent.change(screen.getByTestId('sl-file'), { target: { files: [file] } });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.getAllByTestId('sl-sentence')).toHaveLength(2);
    expect(screen.getByTestId('sl-source').textContent).toContain(vi.sourceFile);
  });

  it('highlights the sentence at the current time', () => {
    const { tick } = setup(SRT);
    tick(1500);
    let items = screen.getAllByTestId('sl-sentence');
    expect(items[0]?.dataset.active).toBe('true');
    tick(4000);
    items = screen.getAllByTestId('sl-sentence');
    expect(items[0]?.dataset.active).toBeUndefined();
    expect(items[1]?.dataset.active).toBe('true');
  });

  it('seeks when a sentence is clicked, unless the feature is off', () => {
    const { player } = setup(SRT);
    const second = screen.getAllByTestId('sl-sentence')[1];
    if (!second) throw new Error('missing sentence');
    fireEvent.click(second);
    expect(player.seekTo).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('sl-sentence')[1]?.dataset.active).toBe('true');
  });

  it('disables seeking when clickToSeek is off', () => {
    setFlags({ clickToSeek: false });
    const { player } = setup(SRT);
    const first = screen.getAllByTestId('sl-sentence')[0];
    if (!first) throw new Error('missing sentence');
    fireEvent.click(first);
    expect(player.seekTo).not.toHaveBeenCalled();
  });

  it('supports keyboard shortcuts', () => {
    const { player, tick, store } = setup(SRT);
    tick(1200);
    const panel = screen.getByTestId('sl-panel');
    fireEvent.keyDown(panel, { key: 'ArrowDown' });
    expect(player.seekTo).toHaveBeenLastCalledWith(store.getState().track?.sentences[1]?.start);
    fireEvent.keyDown(panel, { key: 'ArrowUp' });
    expect(player.seekTo).toHaveBeenLastCalledWith(1000);
    fireEvent.keyDown(panel, { key: ' ' });
    expect(player.play).toHaveBeenCalled();
    fireEvent.keyDown(panel, { key: ' ' });
    expect(player.pause).toHaveBeenCalled();
  });

  it('collapses and reports the change', () => {
    const store = createPanelStore();
    const onCollapsedChange = vitestVi.fn();
    render(<Panel store={store} player={null} onCollapsedChange={onCollapsedChange} />);
    fireEvent.click(screen.getByTestId('sl-collapse'));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId('sl-empty')).toBeNull();
  });

  it('warns when the player track is not English', () => {
    const store = createPanelStore();
    store.getState().setVideo('abc');
    store
      .getState()
      .setTrack(
        buildTrack({ videoId: 'abc', body: SRT, lang: 'vi', kind: 'manual', source: 'player' }),
      );
    render(<Panel store={store} player={null} />);
    expect(screen.getByText(vi.otherLanguage('vi'))).toBeTruthy();
  });

  it('applies the theme and resets on video change', () => {
    const { store, container } = setup(SRT);
    expect(container.querySelector('.sl-root.dark')).toBeTruthy();
    act(() => store.getState().setTheme('light'));
    expect(container.querySelector('.sl-root.dark')).toBeNull();
    act(() => store.getState().setVideo('other'));
    expect(screen.getByTestId('sl-empty')).toBeTruthy();
  });

  it('renders caption text as text, never as markup', () => {
    const { container } = setup(
      '1\n00:00:01,000 --> 00:00:02,000\n&lt;img src=x onerror=alert(1)&gt;\n',
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('sl-sentence').textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
