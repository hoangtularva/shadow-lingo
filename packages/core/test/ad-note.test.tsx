import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AdsAdapter } from '../src/adapters';
import { setFlags } from '../src/features';
import { Panel } from '../src/panel/Panel';
import { createPanelStore } from '../src/panel/store';
import { vi } from '../src/panel/strings';
import { buildTrack } from '../src/tracks';
import { createMemoryVocabStore, type VocabEntry } from '../src/vocab';

const SRT = `1
00:00:01,000 --> 00:00:03,000
Hello there.
`;

function fakeAds(initial: boolean) {
  let showing = initial;
  const listeners = new Set<(s: boolean) => void>();
  const ads: AdsAdapter = {
    isShowing: () => showing,
    onChange(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  const set = (s: boolean) => {
    showing = s;
    for (const l of listeners) l(s);
  };
  return { ads, set };
}

const words: VocabEntry[] = ['một', 'hai', 'ba', 'bốn'].map((v, i) => ({
  id: `w${i}`,
  headword: `w${i}`,
  vi: v,
  senses: [],
  addedAt: i,
}));

const flush = async () => {
  for (let i = 0; i < 5; i++) await act(() => new Promise((r) => setTimeout(r, 0)));
};

function setup(ads: AdsAdapter, vocab = createMemoryVocabStore(words)) {
  const store = createPanelStore({ theme: 'dark' });
  store.getState().setVideo('abc');
  store
    .getState()
    .setTrack(
      buildTrack({ videoId: 'abc', body: SRT, lang: 'en', kind: 'manual', source: 'player' }),
    );
  render(<Panel store={store} player={null} ads={ads} vocab={vocab} />);
  return store;
}

describe('ad note', () => {
  it('appears while an ad plays, never skips it, and goes away after', async () => {
    const { ads, set } = fakeAds(false);
    setup(ads);
    await flush();
    expect(screen.queryByTestId('sl-ad-note')).toBeNull();
    act(() => set(true));
    expect(screen.getByTestId('sl-ad-note').textContent).toContain(vi.adTitle);
    expect(screen.getByTestId('sl-list').className).toContain('opacity-55');
    act(() => set(false));
    expect(screen.queryByTestId('sl-ad-note')).toBeNull();
  });

  it('offers a quick review of due words during the ad', async () => {
    const { ads } = fakeAds(true);
    const store = setup(ads);
    await flush();
    fireEvent.click(screen.getByTestId('sl-ad-review'));
    expect(store.getState().tab).toBe('vocab');
    expect(screen.getByTestId('sl-review')).toBeTruthy();
  });

  it('has no review button when nothing can be quizzed, and respects the flag', async () => {
    const { ads } = fakeAds(true);
    setup(ads, createMemoryVocabStore([]));
    await flush();
    expect(screen.getByTestId('sl-ad-note')).toBeTruthy();
    expect(screen.queryByTestId('sl-ad-review')).toBeNull();
  });

  it('keeps the spoken sentence while the ad plays', async () => {
    const { ads, set } = fakeAds(false);
    let onTime: ((ms: number) => void) | null = null;
    const store = createPanelStore({ theme: 'dark' });
    store.getState().setVideo('abc');
    store
      .getState()
      .setTrack(
        buildTrack({ videoId: 'abc', body: SRT, lang: 'en', kind: 'manual', source: 'player' }),
      );
    const player = {
      getCurrentTime: () => 1500,
      seekTo: () => undefined,
      play: () => undefined,
      pause: () => undefined,
      isPaused: () => false,
      getPlaybackRate: () => 1,
      setPlaybackRate: () => undefined,
      onTimeUpdate: (l: (ms: number) => void) => {
        onTime = l;
        return () => undefined;
      },
    };
    render(<Panel store={store} player={player} ads={ads} />);
    await flush();
    expect(store.getState().timeMs).toBe(1500);
    act(() => set(true));
    act(() => onTime?.(9000));
    expect(store.getState().timeMs).toBe(1500);
    act(() => set(false));
    act(() => onTime?.(2000));
    expect(store.getState().timeMs).toBe(2000);
  });

  it('also shows before any captions arrived (pre-roll ads)', async () => {
    const { ads } = fakeAds(true);
    const store = createPanelStore({ theme: 'dark' });
    store.getState().setVideo('abc');
    render(<Panel store={store} player={null} ads={ads} />);
    await flush();
    expect(screen.getByTestId('sl-ad-note')).toBeTruthy();
  });

  it('is hidden when the flag is off', async () => {
    setFlags({ adNote: false });
    const { ads } = fakeAds(true);
    setup(ads);
    await flush();
    expect(screen.queryByTestId('sl-ad-note')).toBeNull();
  });
});
