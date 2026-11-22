import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createDictPronunciation, type PlayerAdapter } from '../src/adapters';
import { setFlags } from '../src/features';
import { dictFromPhones, parseArpabet } from '../src/ipa';
import { Panel } from '../src/panel/Panel';
import { createPanelStore } from '../src/panel/store';
import { WordLine, topWarnings } from '../src/panel/WordLine';
import { vi } from '../src/panel/strings';
import { buildTrack } from '../src/tracks';
import { annotateSentence } from '../src/ipa';

const player: PlayerAdapter = {
  getCurrentTime: () => 1500,
  seekTo: () => {},
  play: () => {},
  pause: () => {},
  isPaused: () => true,
  getPlaybackRate: () => 1,
  setPlaybackRate: () => undefined,
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
  it('looks up each word once and shows IPA only for the spoken sentence', async () => {
    const { lookups } = setup();
    await waitFor(() => expect(screen.getAllByTestId('sl-ipa').length).toBeGreaterThan(0));
    expect(lookups).toHaveLength(1);
    expect(lookups[0]).toEqual(['think', 'about', 'it', 'pick', 'up', 'to', 'go']);
    const [first, second] = screen.getAllByTestId('sl-sentence');
    if (!first || !second) throw new Error('no sentences');
    expect(first.dataset.active).toBe('true');
    expect(first.dataset.text).toBe('Think about it.');
    const ipa = within(first)
      .getAllByTestId('sl-ipa')
      .map((e) => e.textContent);
    expect(ipa).toEqual(['/θɪŋk/', '/əˈbaʊt/', '/ɪt/']);
    // Linking marks sit after the English word.
    expect(first.querySelectorAll('[data-link="consonant"]')).toHaveLength(2);
    // Other sentences are plain muted text.
    expect(within(second).queryAllByTestId('sl-ipa')).toHaveLength(0);
    expect(second.textContent).toContain('Pick it up to go.');
  });

  it('tags hard sounds and weak forms, and shows one tip', async () => {
    const { store } = setup();
    await waitFor(() => expect(screen.getByTestId('sl-tips')).toBeTruthy());
    const tip = screen.getByTestId('sl-tips');
    expect(tip.dataset.warn).toBe('th-voiceless');
    expect(tip.textContent).toContain('/θ/ trong “Think”:');
    expect(screen.getAllByTestId('sl-tag').map((t) => t.textContent)).toEqual([vi.hardSound('θ')]);

    // Second sentence: weak "to" is tagged.
    act(() => store.getState().setTime(3500));
    await waitFor(() =>
      expect(screen.getAllByTestId('sl-tag').map((t) => t.textContent)).toContain(vi.weakTag),
    );
  });

  it('toggles IPA and linking with chips and keys', async () => {
    const { store } = setup();
    await waitFor(() => expect(screen.getAllByTestId('sl-ipa').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId('sl-ipa-toggle'));
    expect(store.getState().showIpa).toBe(false);
    expect(screen.queryAllByTestId('sl-ipa')).toHaveLength(0);
    fireEvent.keyDown(screen.getByTestId('sl-panel'), { key: 'i' });
    expect(store.getState().showIpa).toBe(true);
    expect(screen.getByTestId('sl-ipa-toggle').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByTestId('sl-linking-toggle'));
    expect(document.querySelectorAll('[data-link]')).toHaveLength(0);
    fireEvent.keyDown(screen.getByTestId('sl-panel'), { key: 'l' });
    expect(document.querySelectorAll('[data-link]').length).toBeGreaterThan(0);
  });

  it('shows no IPA without an adapter or when the feature is off', () => {
    setup(false);
    expect(screen.queryByTestId('sl-chips')).toBeNull();
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
    expect(topWarnings(words, 3).map((t) => t.warning.id)).toEqual([
      'th-voiceless',
      'final',
      'i-short',
    ]);
    expect(topWarnings(words)).toHaveLength(1);
    expect(topWarnings(words)[0]?.word).toBe('think');
  });
});

describe('Panel chrome', () => {
  it('shows the source badge and closes until the next video', async () => {
    const { store } = setup();
    expect(screen.getByTestId('sl-source').textContent).toBe(vi.sourceManual);
    fireEvent.click(screen.getByTestId('sl-close'));
    expect(screen.queryByTestId('sl-panel')).toBeNull();
    act(() => store.getState().setVideo('next'));
    expect(screen.getByTestId('sl-panel')).toBeTruthy();
  });

  it('lets the user pick a sentence in an untimed transcript', async () => {
    const store = createPanelStore();
    store.getState().setVideo('abc');
    render(<Panel store={store} player={player} pronunciation={createDictPronunciation(dict)} />);
    act(() => {
      store
        .getState()
        .setTrack(
          buildTrack({ videoId: 'abc', body: 'Think about it. Pick it up.', source: 'paste' }),
        );
    });
    expect(screen.queryByTestId('sl-ipa')).toBeNull();
    fireEvent.click(screen.getAllByTestId('sl-sentence')[1] as HTMLElement);
    await waitFor(() => expect(screen.getAllByTestId('sl-ipa').length).toBe(3));
  });
});

describe('WordLine tags', () => {
  it('tags each hard sound once per sentence', () => {
    const d = dictFromPhones({
      cat: [parseArpabet('K AE1 T')],
      bad: [parseArpabet('B AE1 D')],
    });
    const words = annotateSentence('cat bad', (k) => d.lookup(k));
    render(<WordLine words={words} showIpa showLinking showWarnings />);
    expect(screen.getAllByTestId('sl-tag').map((t) => t.textContent)).toEqual([vi.hardSound('æ')]);
  });
});
