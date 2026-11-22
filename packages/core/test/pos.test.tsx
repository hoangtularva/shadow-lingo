import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createDictPronunciation, createLocalPos, type PlayerAdapter } from '../src/adapters';
import { dictFromPhones, parseArpabet } from '../src/ipa';
import { alignPos, posFromTags } from '../src/pos';
import { tagSentence } from '../src/pos/tagger';
import { Panel } from '../src/panel/Panel';
import { createPanelStore } from '../src/panel/store';
import { buildTrack } from '../src/tracks';

describe('posFromTags', () => {
  it('maps tagger tags to the five coloured classes', () => {
    expect(posFromTags(['Noun', 'Pronoun'])).toBe('pronoun');
    expect(posFromTags(['Verb', 'Modal', 'Auxiliary'])).toBe('verb');
    expect(posFromTags(['Adjective'])).toBe('adjective');
    expect(posFromTags(['Adverb'])).toBe('adverb');
    expect(posFromTags(['Noun', 'Singular'])).toBe('noun');
    expect(posFromTags(['Determiner'])).toBeNull();
    expect(posFromTags(['Preposition'])).toBeNull();
  });
});

describe('alignPos', () => {
  it('gives each tokenizer word the class of the term it overlaps', () => {
    const text = "I don't know.";
    const tags = alignPos(text, [
      { start: 0, end: 1, tags: ['Pronoun'] },
      { start: 2, end: 7, tags: ['Verb'] },
      { start: 8, end: 12, tags: ['Verb'] },
    ]);
    expect(tags).toEqual(['pronoun', 'verb', 'verb']);
  });

  it('leaves uncovered words null', () => {
    expect(alignPos('hello there', [])).toEqual([null, null]);
  });
});

describe('tagSentence (compromise)', () => {
  it('tags a real sentence, one entry per word', () => {
    const tags = tagSentence('The children were running fast.');
    expect(tags).toEqual([null, 'noun', 'verb', 'verb', 'adverb']);
  });

  it('keeps contractions as one word', () => {
    const tags = tagSentence("Don't read it.");
    expect(tags).toHaveLength(3);
    expect(tags[0]).toBe('verb');
    expect(tags[2]).toBe('pronoun');
  });
});

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
  children: [parseArpabet('CH IH1 L D R AH0 N')],
  run: [parseArpabet('R AH1 N')],
  fast: [parseArpabet('F AE1 S T')],
});

describe('Panel part-of-speech colours', () => {
  function setup() {
    const store = createPanelStore();
    store.getState().setTrack(
      buildTrack({
        videoId: 'v',
        body: '1\n00:00:01,000 --> 00:00:03,000\nChildren run fast.\n',
        source: 'file',
      }),
    );
    store.getState().setTime(1500);
    render(
      <Panel
        store={store}
        player={player}
        pronunciation={createDictPronunciation(dict)}
        pos={createLocalPos(tagSentence)}
      />,
    );
    return store;
  }

  it('colours the spoken sentence and shows the legend; the chip turns it off', async () => {
    setup();
    const words = await screen.findByTestId('sl-words');
    await waitFor(() => expect(words.querySelectorAll('[data-pos]')).toHaveLength(3));
    expect(words.querySelector('[data-pos="noun"]')?.textContent).toBe('Children');
    expect(words.querySelector('[data-pos="verb"]')?.textContent).toBe('run');
    const legend = screen.getByTestId('sl-pos-legend');
    expect(within(legend).getByText('Danh từ')).toBeTruthy();
    expect(within(legend).getByText('Đại từ')).toBeTruthy();

    const chip = screen.getByTestId('sl-pos-toggle');
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByTestId('sl-pos-legend')).toBeNull();
    expect(screen.getByTestId('sl-words').querySelectorAll('[data-pos]')).toHaveLength(0);
  });

  it('shows no chip without a tagger', async () => {
    const store = createPanelStore();
    store.getState().setTrack(
      buildTrack({
        videoId: 'v',
        body: '1\n00:00:01,000 --> 00:00:03,000\nChildren run fast.\n',
        source: 'file',
      }),
    );
    render(<Panel store={store} player={player} pronunciation={createDictPronunciation(dict)} />);
    await screen.findByTestId('sl-ipa-toggle');
    expect(screen.queryByTestId('sl-pos-toggle')).toBeNull();
  });
});
