import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi as vitestVi } from 'vitest';
import type { PlayerAdapter, PronunciationAdapter, TranslationAdapter } from '../src/adapters';
import {
  candidatesFor,
  createDictionary,
  entryOf,
  headwordOf,
  parseDictShard,
  shardOf,
  type DictionaryAdapter,
} from '../src/dict';
import { setFlags } from '../src/features';
import { Panel } from '../src/panel/Panel';
import { cambridgeUrl } from '../src/panel/WordCard';
import { createPanelStore } from '../src/panel/store';
import { vi } from '../src/panel/strings';
import { buildTrack } from '../src/tracks';

const SHARDS: Record<string, string> = {
  f: [
    'figure\tnoun|A drawing or diagram.|See figure 3.\tverb|To think or believe.|I figure it will rain.',
    'figure out\tvi|tìm ra; hiểu ra\tverb|To come to understand or solve.|I figured out the answer.',
    'figured\tverb|@figure',
  ].join('\n'),
  i: 'it\tpron|The thing being discussed.|',
  o: ['out\tadv|Away from the inside.|', 'of late\tadv|Recently.|'].join('\n'),
  s: [
    'struggle\tvi|đấu tranh\tverb|To strive or make a great effort.|',
    'struggled\tverb|@struggle',
  ].join('\n'),
  w: 'we\tpron|The speaker and others.|',
  t: 'together\tadv|In the same place or with each other.|',
};

const load = (name: string) => Promise.resolve(SHARDS[name] ?? '');

describe('dictionary data', () => {
  it('parses shards and resolves inflected forms to their lemma', () => {
    const shard = parseDictShard(SHARDS.s ?? '');
    const entry = entryOf('struggled', (h) => shard.get(h));
    expect(entry).toEqual({
      headword: 'struggled',
      lemma: 'struggle',
      vi: ['đấu tranh'],
      senses: [{ pos: 'verb', gloss: 'To strive or make a great effort.' }],
    });
    expect(entryOf('missing', (h) => shard.get(h))).toBeNull();
  });

  it('normalizes clicked words and names shards', () => {
    expect(headwordOf('“Learner’s,')).toBe("learner's");
    expect(shardOf('Zebra')).toBe('z');
    expect(shardOf("'tis")).toBe('_');
  });

  it('tries phrases around the word first, then the word', () => {
    const words = ['we', 'figured', 'it', 'out'];
    const heads = candidatesFor(words, 1, (h) => (h === 'figured' ? 'figure' : undefined)).map(
      (c) => c.headword,
    );
    expect(heads).toContain('figure out');
    expect(heads.at(-1)).toBe('figure');
    expect(heads.indexOf('figure out')).toBeLessThan(heads.indexOf('figured'));
  });
});

describe('createDictionary', () => {
  it('finds a separable phrasal verb from any of its words', async () => {
    const dict = createDictionary(load);
    const words = ['I', 'think', 'we', 'figured', 'it', 'out', 'together.'];
    for (const i of [3, 4, 5]) {
      const found = await dict.lookup(words, i);
      expect(found?.entry.headword).toBe('figure out');
      expect(found?.words).toEqual([3, 4, 5]);
    }
    expect((await dict.lookup(words, 6))?.entry.senses[0]?.gloss).toMatch(/same place/);
  });

  it('matches set phrases and falls back to the lemma', async () => {
    const dict = createDictionary(load);
    const found = await dict.lookup(['struggled', 'as', 'of', 'late', 'in'], 2);
    expect(found?.entry.headword).toBe('of late');
    expect(found?.words).toEqual([2, 3]);
    const lemma = await dict.lookup(['He', 'struggled.'], 1);
    expect(lemma?.entry.lemma).toBe('struggle');
    expect(await dict.lookup(['Casemiro'], 0)).toBeNull();
  });

  it('loads each shard once and retries a failed one', async () => {
    let fail = true;
    const loader = vitestVi.fn((name: string) => {
      if (name === 'w' && fail) {
        fail = false;
        return Promise.reject(new Error('offline'));
      }
      return load(name);
    });
    const dict = createDictionary(loader);
    await expect(dict.lookup(['we'], 0)).rejects.toThrow();
    expect((await dict.lookup(['we'], 0))?.entry.headword).toBe('we');
    await dict.lookup(['we'], 0);
    expect(loader.mock.calls.filter(([n]) => n === 'w')).toHaveLength(2);
  });
});

const SRT = `1
00:00:01,000 --> 00:00:03,000
We figured it out together.

2
00:00:03,000 --> 00:00:05,000
He struggled.
`;

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

const pronunciation: PronunciationAdapter = {
  lookup: (keys) => Promise.resolve(Object.fromEntries(keys.map((k) => [k, null]))),
};

const flush = async () => {
  for (let i = 0; i < 5; i++) await act(() => new Promise((r) => setTimeout(r, 0)));
};

function setup(
  dictionary: DictionaryAdapter | null = createDictionary(load),
  translation: TranslationAdapter | null = null,
) {
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
      dictionary={dictionary}
      translation={translation}
    />,
  );
  return { store, player };
}

describe('word card', () => {
  it('opens on a click, underlines the phrase and closes with Esc', async () => {
    setup();
    await flush();
    const words = screen.getAllByTestId('sl-word');
    fireEvent.click(words[3] as HTMLElement); // "out"
    await flush();
    const card = screen.getByTestId('sl-word-card');
    expect(card.dataset.status).toBe('ready');
    expect(screen.getByTestId('sl-word-head').textContent).toBe('figure out');
    expect(screen.getByTestId('sl-word-vi').textContent).toBe('tìm ra, hiểu ra');
    expect(screen.getAllByTestId('sl-word-sense')[0]?.textContent).toMatch(/understand or solve/);
    expect(card.textContent).toContain(vi.phrasalVerb);
    expect(card.textContent).toContain(vi.wordSource('wiktionary'));
    expect(
      screen
        .getAllByTestId('sl-word')
        .map((w) => w.getAttribute('aria-expanded'))
        .slice(1, 4),
    ).toEqual(['true', 'true', 'true']);
    expect(screen.getByTestId('sl-word-cambridge').getAttribute('href')).toBe(
      cambridgeUrl('figure out'),
    );
    fireEvent.keyDown(screen.getByTestId('sl-panel'), { key: 'Escape' });
    expect(screen.queryByTestId('sl-word-card')).toBeNull();
  });

  it('reads the word aloud with an on-device voice only', async () => {
    const spoken: string[] = [];
    const local = { localService: true, lang: 'en-US', name: 'Local' } as SpeechSynthesisVoice;
    const remote = { localService: false, lang: 'en-US', name: 'Online' } as SpeechSynthesisVoice;
    let voices = [remote, local];
    Object.assign(window, {
      speechSynthesis: {
        getVoices: () => voices,
        cancel: () => undefined,
        speak: (u: { text: string; voice: SpeechSynthesisVoice }) => {
          expect(u.voice).toBe(local);
          spoken.push(u.text);
        },
      },
      SpeechSynthesisUtterance: class {
        voice: SpeechSynthesisVoice | null = null;
        lang = '';
        rate = 1;
        constructor(public text: string) {}
      },
    });
    setup();
    await flush();
    fireEvent.click(screen.getAllByTestId('sl-word')[3] as HTMLElement);
    await flush();
    fireEvent.click(screen.getByTestId('sl-word-speak'));
    expect(spoken).toEqual(['figure out']);
    voices = [remote];
    fireEvent.click(screen.getByTestId('sl-word-speak'));
    expect(spoken).toHaveLength(1);
    expect(screen.getByText(vi.noVoice)).toBeTruthy();
    Reflect.deleteProperty(window, 'speechSynthesis');
    Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
  });

  it('a word click does not seek; the header still does', async () => {
    const { player } = setup();
    await flush();
    fireEvent.click(screen.getAllByTestId('sl-word')[0] as HTMLElement);
    expect(player.seekTo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('sl-sentence-seek'));
    expect(player.seekTo).toHaveBeenCalledWith(1000);
  });

  it('uses the on-device translator when Wiktionary has no Vietnamese', async () => {
    const translation: TranslationAdapter = {
      state: () => Promise.resolve('ready'),
      prepare: () => Promise.resolve(true),
      translate: vitestVi.fn((t: string) => Promise.resolve(`VI(${t})`)),
    };
    setup(createDictionary(load), translation);
    await flush();
    fireEvent.click(screen.getAllByTestId('sl-word')[4] as HTMLElement); // "together."
    await flush();
    expect(screen.getByTestId('sl-word-vi').textContent).toBe('VI(together)');
    expect(screen.getByTestId('sl-word-card').textContent).toContain(vi.wordSource('machine'));
  });

  it('says when a word is not in the dictionary, and closes on the X', async () => {
    setup(createDictionary(() => Promise.resolve('')));
    await flush();
    fireEvent.click(screen.getAllByTestId('sl-word')[0] as HTMLElement);
    await flush();
    expect(screen.getByTestId('sl-word-card').textContent).toContain(vi.wordMissing);
    fireEvent.click(screen.getByTestId('sl-word-close'));
    expect(screen.queryByTestId('sl-word-card')).toBeNull();
  });

  it('closes when another sentence is spoken', async () => {
    const { store } = setup();
    await flush();
    fireEvent.click(screen.getAllByTestId('sl-word')[0] as HTMLElement);
    await flush();
    expect(screen.getByTestId('sl-word-card')).toBeTruthy();
    act(() => store.getState().setTime(3500));
    expect(screen.queryByTestId('sl-word-card')).toBeNull();
  });

  it('words are plain text without a dictionary or with the flag off', async () => {
    setFlags({ wordLookup: false });
    setup();
    await flush();
    expect(screen.queryByTestId('sl-word')).toBeNull();
  });
});
