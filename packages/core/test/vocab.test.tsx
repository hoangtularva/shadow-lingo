import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi as vitestVi } from 'vitest';
import type { PlayerAdapter, PronunciationAdapter } from '../src/adapters';
import { createDictionary } from '../src/dict';
import { setFlags } from '../src/features';
import { Panel } from '../src/panel/Panel';
import { createPanelStore } from '../src/panel/store';
import { vi } from '../src/panel/strings';
import { buildTrack } from '../src/tracks';
import {
  createMemoryVocabStore,
  isVocabEntry,
  markContext,
  videoLink,
  vocabToAnki,
  vocabToCsv,
  type VocabEntry,
} from '../src/vocab';

const CTX = {
  text: 'We figured it out together.',
  words: [1, 2, 3],
  start: 75_000,
  videoId: 'abc',
  title: 'A "great" talk, part 1',
};

const ENTRY: VocabEntry = {
  id: 'figure out',
  headword: 'figure out',
  ipa: 'ˈfɪɡjərd ɪt aʊt',
  pos: 'verb',
  vi: 'tìm ra, hiểu ra',
  viFrom: 'wiktionary',
  senses: [{ pos: 'verb', gloss: 'To come to understand.', example: 'I figured it out.' }],
  context: CTX,
  addedAt: Date.UTC(2026, 10, 22),
};

describe('vocab model', () => {
  it('validates entries', () => {
    expect(isVocabEntry(ENTRY)).toBe(true);
    expect(isVocabEntry({ ...ENTRY, id: 'other' })).toBe(false);
    expect(isVocabEntry({ ...ENTRY, pos: 'thing' })).toBe(false);
    expect(isVocabEntry({ ...ENTRY, context: { ...ENTRY.context, videoId: '../x' } })).toBe(false);
    expect(isVocabEntry({ ...ENTRY, senses: Array(4).fill(ENTRY.senses[0]) })).toBe(false);
  });

  it('marks the saved words in their sentence and links to the moment', () => {
    expect(markContext(CTX)).toEqual(['We ', 'figured it out', ' together.']);
    expect(videoLink(ENTRY.context)).toBe('https://www.youtube.com/watch?v=abc&t=75s');
    expect(videoLink({ ...CTX, videoId: '' })).toBeNull();
  });

  it('exports CSV safely for spreadsheets', () => {
    const csv = vocabToCsv([ENTRY, { ...ENTRY, id: '=cmd', headword: '=cmd', context: undefined }]);
    expect(csv.startsWith('﻿word,ipa')).toBe(true);
    expect(csv).toContain('We figured it out together.');
    expect(csv).toContain("'=cmd");
    expect(csv).toContain('https://www.youtube.com/watch?v=abc&t=75s');
  });

  it('exports an Anki file with the word in context on the front', () => {
    const anki = vocabToAnki([{ ...ENTRY, headword: '<b>x</b>', id: '<b>x</b>' }]);
    const [, , , line] = anki.split('\n');
    const [front, back, tag] = (line ?? '').split('\t');
    expect(anki.startsWith('#separator:tab\n#html:true')).toBe(true);
    expect(front).toBe('<b>&lt;b&gt;x&lt;/b&gt;</b><br><i>We <u>figured it out</u> together.</i>');
    expect(back).toContain('tìm ra, hiểu ra');
    expect(tag).toBe('shadowlingo');
  });
});

const SRT = `1
00:00:01,000 --> 00:00:03,000
We figured it out together.

2
00:00:03,000 --> 00:00:05,000
He struggled.
`;

const SHARDS: Record<string, string> = {
  f: 'figure out\tvi|tìm ra; hiểu ra\tverb|To come to understand.|I figured it out.\nfigured\tverb|@figure',
  t: 'together\tadv|With each other.|',
};

const pronunciation: PronunciationAdapter = {
  lookup: (keys) => Promise.resolve(Object.fromEntries(keys.map((k) => [k, null]))),
};

function fakePlayer(): PlayerAdapter {
  return {
    getCurrentTime: () => 1500,
    seekTo: vitestVi.fn(),
    play: () => undefined,
    pause: () => undefined,
    isPaused: () => true,
    getPlaybackRate: () => 1,
    setPlaybackRate: () => undefined,
    onTimeUpdate: () => () => undefined,
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await act(() => new Promise((r) => setTimeout(r, 0)));
};

function setup(vocab = createMemoryVocabStore()) {
  const store = createPanelStore({ theme: 'dark' });
  store.getState().setVideo('abc');
  store
    .getState()
    .setTrack(
      buildTrack({ videoId: 'abc', body: SRT, lang: 'en', kind: 'manual', source: 'player' }),
    );
  store.getState().setTime(1500);
  const player = fakePlayer();
  render(
    <Panel
      store={store}
      player={player}
      pronunciation={pronunciation}
      dictionary={createDictionary((n) => Promise.resolve(SHARDS[n] ?? ''))}
      vocab={vocab}
      getVideoTitle={() => 'My video'}
    />,
  );
  return { store, player, vocab };
}

afterEach(() => vitestVi.restoreAllMocks());

/** jsdom's Blob has no text(). */
function readBlob(b: Blob | undefined): Promise<string> {
  return new Promise((resolve) => {
    if (!b) return resolve('');
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(b);
  });
}

describe('notebook', () => {
  it('saves a word from its card with the sentence and video moment', async () => {
    const { vocab } = setup();
    await flush();
    expect(screen.getByTestId('sl-tab-vocab').textContent).toBe(vi.tabVocab(0));
    fireEvent.click(screen.getAllByTestId('sl-word')[3] as HTMLElement); // "out"
    await flush();
    fireEvent.click(screen.getByTestId('sl-word-save'));
    await flush();
    expect(screen.getByTestId('sl-word-save').textContent).toBe(vi.savedWord);
    expect((screen.getByTestId('sl-word-save') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('sl-tab-vocab').textContent).toBe(vi.tabVocab(1));
    const [saved] = await vocab.list();
    expect(saved).toMatchObject({
      id: 'figure out',
      vi: 'tìm ra, hiểu ra',
      viFrom: 'wiktionary',
      context: {
        text: 'We figured it out together.',
        words: [1, 2, 3],
        start: 1000,
        videoId: 'abc',
        title: 'My video',
      },
    });
    expect(isVocabEntry(saved)).toBe(true);
  });

  it('lists, searches, filters, removes and jumps back to the sentence', async () => {
    const other: VocabEntry = {
      ...ENTRY,
      id: 'together',
      headword: 'together',
      vi: 'cùng nhau',
      context: { ...CTX, videoId: 'zzz', start: 0 },
      addedAt: ENTRY.addedAt + 1,
    };
    const { store, player, vocab } = setup(
      createMemoryVocabStore([{ ...ENTRY, context: { ...CTX, start: 3000 } }, other]),
    );
    await flush();
    fireEvent.click(screen.getByTestId('sl-tab-vocab'));
    await flush();
    expect(screen.getByTestId('sl-source').textContent).toBe(vi.vocabBadge(2));
    const items = () => screen.getAllByTestId('sl-vocab-item').map((li) => li.dataset.id);
    expect(items()).toEqual(['together', 'figure out']);

    fireEvent.change(screen.getByTestId('sl-vocab-search'), { target: { value: 'hiểu' } });
    expect(items()).toEqual(['figure out']);
    fireEvent.change(screen.getByTestId('sl-vocab-search'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('sl-vocab-video'));
    expect(items()).toEqual(['figure out']);
    fireEvent.click(screen.getByTestId('sl-vocab-all'));

    // Same video: jumps inside the page and goes back to the captions.
    fireEvent.click(
      within(screen.getAllByTestId('sl-vocab-item')[1] as HTMLElement).getByTestId('sl-vocab-jump'),
    );
    expect(player.seekTo).toHaveBeenCalledWith(3000);
    expect(store.getState().tab).toBe('captions');

    fireEvent.click(screen.getByTestId('sl-tab-vocab'));
    await flush();
    fireEvent.click(
      within(screen.getAllByTestId('sl-vocab-item')[0] as HTMLElement).getByTestId(
        'sl-vocab-remove',
      ),
    );
    await flush();
    expect(items()).toEqual(['figure out']);
    expect((await vocab.list()).map((e) => e.id)).toEqual(['figure out']);
  });

  it('exports CSV and Anki files from the menu', async () => {
    const created: Blob[] = [];
    vitestVi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      created.push(b as Blob);
      return 'blob:x';
    });
    vitestVi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vitestVi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    setup(createMemoryVocabStore([ENTRY]));
    await flush();
    fireEvent.click(screen.getByTestId('sl-tab-vocab'));
    await flush();
    fireEvent.click(screen.getByTestId('sl-vocab-export'));
    fireEvent.click(screen.getByTestId('sl-vocab-export-csv'));
    fireEvent.click(screen.getByTestId('sl-vocab-export'));
    fireEvent.click(screen.getByTestId('sl-vocab-export-anki'));
    expect(click).toHaveBeenCalledTimes(2);
    expect(await readBlob(created[0])).toContain('figure out');
    expect(await readBlob(created[1])).toContain('#separator:tab');
  });

  it('shows an empty notebook hint, and no tab without the flag', async () => {
    setup();
    await flush();
    fireEvent.click(screen.getByTestId('sl-tab-vocab'));
    await flush();
    expect(screen.getByTestId('sl-vocab-empty').textContent).toBe(vi.vocabEmpty);
  });

  it('hides the notebook when the flag is off', async () => {
    setFlags({ vocabulary: false });
    setup();
    await flush();
    expect(screen.queryByTestId('sl-tab-vocab')).toBeNull();
    fireEvent.click(screen.getAllByTestId('sl-word')[0] as HTMLElement);
    await flush();
    expect(screen.queryByTestId('sl-word-save')).toBeNull();
  });
});
