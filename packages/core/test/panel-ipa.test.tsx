import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createDictPronunciation, type PlayerAdapter } from '../src/adapters';
import { setFlags } from '../src/features';
import { dictFromPhones, parseArpabet } from '../src/ipa';
import { Panel } from '../src/panel/Panel';
import { createPanelStore } from '../src/panel/store';
import { topWarnings } from '../src/panel/WordLine';
import { vi } from '../src/panel/strings';
import { buildTrack } from '../src/tracks';
import { annotateSentence } from '../src/ipa';

const player: PlayerAdapter = {
  getCurrentTime: () => 1500,
  seekTo: () => {},
  play: () => {},
  pause: () => {},
  isPaused: () => true,
  onTimeUpdate: () => () => {},
};

const dict = dictFromPhones({
  think: [parseArpabet('TH IH1 NG K')],
  about: [parseArpabet('AH0 B AW1 T')],
  it: [parseArpabet('IH1 T')],
  pick: [parseArpabet('P IH1 K')],
  up: [parseArpabet('AH1 P')],
  to: [parseArpabet('T UW1')],
  go: [parseArpabet('G OW1')],
});

const SRT = `1
00:00:01,000 --> 00:00:03,000
Think about it.

2
00:00:03,000 --> 00:00:05,000
Pick it up to go.
`;

function setup(withAdapter = true) {
  const store = createPanelStore({ theme: 'light' });
  store.getState().setVideo('abc');
  const lookups: string[][] = [];
  const base = createDictPronunciation(dict);
  const adapter = {
    lookup(keys: readonly string[]) {
      lookups.push([...keys]);
      return base.lookup(keys);
    },
  };
  render(<Panel store={store} player={player} pronunciation={withAdapter ? adapter : null} />);
  act(() => {
    store
      .getState()
      .setTrack(
        buildTrack({ videoId: 'abc', body: SRT, lang: 'en', kind: 'manual', source: 'player' }),
      );
  });
  return { store, lookups };
}

describe('Panel IPA', () => {
  it('looks up each word once and shows IPA under words', async () => {
    const { lookups } = setup();
    await waitFor(() => expect(screen.getAllByTestId('sl-ipa').length).toBeGreaterThan(0));
    expect(lookups).toHaveLength(1);
    expect(lookups[0]).toEqual(['think', 'about', 'it', 'pick', 'up', 'to', 'go']);
    const [first, second] = screen.getAllByTestId('sl-sentence');
    if (!first || !second) throw new Error('no sentences');
    expect(first.dataset.text).toBe('Think about it.');
    const ipa = within(first)
      .getAllByTestId('sl-ipa')
      .map((e) => e.textContent);
    expect(ipa).toEqual(['θɪŋk‿', 'əˈbaʊt‿', 'ɪt']);
    // Weak "to" before a consonant.
    const weak = within(second)
      .getAllByTestId('sl-ipa')
      .find((e) => e.dataset.weak === 'true');
    expect(weak?.textContent).toBe('tə');
  });

  it('highlights hard sounds and lists tips for the active sentence', async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId('sl-tips')).toBeTruthy());
    const tips = screen.getByTestId('sl-tips');
    expect(tips.textContent).toContain(vi.tipsTitle);
    expect(tips.querySelector('[data-warn="th-voiceless"]')).toBeTruthy();
    // Only the active sentence (the first, at 1.5 s) highlights hard sounds.
    expect(document.querySelector('.sl-warn[data-warn="th-voiceless"]')?.textContent).toBe('θ');
    expect(screen.getAllByTestId('sl-sentence')[1]?.querySelector('.sl-warn')).toBeNull();
  });

  it('toggles IPA with the header button and the I key', async () => {
    const { store } = setup();
    await waitFor(() => expect(screen.getAllByTestId('sl-ipa').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId('sl-ipa-toggle'));
    expect(store.getState().showIpa).toBe(false);
    expect(screen.queryAllByTestId('sl-ipa')).toHaveLength(0);
    fireEvent.keyDown(screen.getByTestId('sl-panel'), { key: 'i' });
    expect(store.getState().showIpa).toBe(true);
    expect(screen.getByTestId('sl-ipa-toggle').textContent).toBe(vi.ipaOn);
  });

  it('shows no IPA without an adapter or when the feature is off', () => {
    setup(false);
    expect(screen.queryByTestId('sl-ipa-toggle')).toBeNull();
    expect(screen.queryAllByTestId('sl-ipa')).toHaveLength(0);
  });

  it('respects the ipa flag', async () => {
    setFlags({ ipa: false });
    const { lookups } = setup();
    await Promise.resolve();
    expect(lookups).toHaveLength(0);
    expect(screen.queryAllByTestId('sl-ipa')).toHaveLength(0);
  });

  it('shows a notice when lookups fail', async () => {
    const store = createPanelStore();
    store.getState().setVideo('abc');
    render(
      <Panel
        store={store}
        player={player}
        pronunciation={{ lookup: () => Promise.reject(new Error('x')) }}
      />,
    );
    act(() => {
      store
        .getState()
        .setTrack(
          buildTrack({ videoId: 'abc', body: SRT, lang: 'en', kind: 'manual', source: 'player' }),
        );
    });
    await waitFor(() => expect(screen.getByText(vi.ipaFailed)).toBeTruthy());
  });
});

describe('topWarnings', () => {
  it('orders by priority and keeps one per sound', () => {
    const words = annotateSentence('Pick it up, think', (k) => dict.lookup(k));
    expect(topWarnings(words).map((t) => t.warning.id)).toEqual([
      'th-voiceless',
      'final',
      'i-short',
    ]);
    expect(topWarnings(words)[0]?.word).toBe('think');
  });
});
