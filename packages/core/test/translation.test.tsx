import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi as vitestVi } from 'vitest';
import {
  createMemoryTranslationCache,
  type PlayerAdapter,
  type TranslationAdapter,
  type TranslatorState,
} from '../src/adapters';
import { alignTranslation } from '../src/align';
import { setFlags } from '../src/features';
import { sentenceHash } from '../src/hash';
import { CaptionBar } from '../src/panel/CaptionBar';
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

function fakePlayer(): PlayerAdapter {
  return {
    getCurrentTime: () => 1500,
    seekTo: () => undefined,
    play: () => undefined,
    pause: () => undefined,
    isPaused: () => true,
    getPlaybackRate: () => 1,
    setPlaybackRate: () => undefined,
    onTimeUpdate: () => () => undefined,
  };
}

function fakeTranslator(initial: TranslatorState) {
  let state = initial;
  const translation: TranslationAdapter = {
    state: vitestVi.fn(() => Promise.resolve(state)),
    prepare: vitestVi.fn((onProgress?: (p: number) => void) => {
      onProgress?.(0.5);
      state = 'ready';
      return Promise.resolve(true);
    }),
    translate: vitestVi.fn((text: string) => Promise.resolve(`VI(${text})`)),
  };
  return translation;
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await act(() => new Promise((r) => setTimeout(r, 0)));
};

function setup(translation: TranslationAdapter | null, cache = createMemoryTranslationCache()) {
  const store = createPanelStore({ theme: 'dark' });
  store.getState().setVideo('abc');
  store
    .getState()
    .setTrack(
      buildTrack({ videoId: 'abc', body: SRT, lang: 'en', kind: 'manual', source: 'player' }),
    );
  store.getState().setTime(1500);
  render(
    <Panel
      store={store}
      player={fakePlayer()}
      translation={translation}
      translationCache={cache}
    />,
  );
  return { store, cache };
}

const cue = (start: number, end: number, text: string) => ({ start, end, text });

describe('alignTranslation', () => {
  const track = buildTrack({ videoId: 'abc', body: SRT, source: 'player', kind: 'manual' });
  const [hello, how] = track.sentences.map((s) => sentenceHash(s.text));

  it('gives each Vietnamese cue to the sentence it shares the most time with', () => {
    const out = alignTranslation(track.sentences, [
      cue(1000, 2000, 'Xin'),
      cue(2000, 3400, 'chào.'), // mostly in sentence 1
      cue(3400, 5000, 'Hôm nay bạn thế nào?'),
    ]);
    expect(hello && out[hello]).toEqual({ vi: 'Xin chào.', source: 'human' });
    expect(how && out[how]?.vi).toBe('Hôm nay bạn thế nào?');
  });

  it('attaches a cue in a short gap to the nearest sentence and drops far ones', () => {
    const out = alignTranslation(track.sentences, [
      cue(5300, 5800, 'nhé'),
      cue(9000, 9500, 'xa quá'),
    ]);
    expect(how && out[how]?.vi).toBe('nhé');
    expect(Object.keys(out)).toHaveLength(1);
  });

  it('leaves sentences without a cue for the machine', () => {
    expect(alignTranslation(track.sentences, [cue(3000, 5000, 'Bạn khỏe không?')])).toEqual({
      [how ?? '']: { vi: 'Bạn khỏe không?', source: 'human' },
    });
  });
});

describe('bilingual panel', () => {
  it('translates on the device and shows a Vietnamese line under each sentence', async () => {
    const translation = fakeTranslator('ready');
    const { cache } = setup(translation);
    await flush();
    expect(screen.getByTestId('sl-vi-spoken').textContent).toBe('VI(Hello there.)');
    expect(screen.getByTestId('sl-vi').textContent).toBe('VI(How are you today?)');
    expect(screen.getByTestId('sl-source').textContent).toBe(vi.viBadgeMachine);
    // Spoken sentence first.
    expect(translation.translate).toHaveBeenNthCalledWith(1, 'Hello there.');
    // Kept on the device for next time.
    const saved = await cache.get('abc', [sentenceHash('Hello there.')]);
    expect(Object.values(saved)[0]?.source).toBe('machine');
  });

  it('goes on through the whole video: ahead first, then the sentences already passed', async () => {
    const lines = Array.from({ length: 20 }, (_, i) => {
      const t = i * 2;
      const ts = (n: number) => `00:00:${String(n).padStart(2, '0')},000`;
      return `${i + 1}\n${ts(t)} --> ${ts(t + 2)}\nSentence number ${i + 1}.\n`;
    });
    const store = createPanelStore({ theme: 'dark' });
    store.getState().setVideo('long');
    store.getState().setTrack(
      buildTrack({
        videoId: 'long',
        body: lines.join('\n'),
        lang: 'en',
        kind: 'manual',
        source: 'player',
      }),
    );
    store.getState().setTime(10_500); // sentence 6 is spoken
    const translation = fakeTranslator('ready');
    const player = { ...fakePlayer(), getCurrentTime: () => 10_500 };
    render(<Panel store={store} player={player} translation={translation} />);
    for (let i = 0; i < 12; i++) await flush();
    const calls = (translation.translate as ReturnType<typeof vitestVi.fn>).mock.calls.map(
      ([t]) => t as string,
    );
    expect(calls[0]).toBe('Sentence number 6.');
    expect(new Set(calls).size).toBe(20);
    // Everything ahead comes before the earlier sentences.
    expect(calls.indexOf('Sentence number 20.')).toBeLessThan(calls.indexOf('Sentence number 1.'));
  });

  it('asks for a click before downloading the language pack', async () => {
    const translation = fakeTranslator('needs-download');
    setup(translation);
    await flush();
    expect(translation.translate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('sl-vi-download'));
    await flush();
    expect(translation.prepare).toHaveBeenCalled();
    expect(screen.getByTestId('sl-vi-spoken').textContent).toBe('VI(Hello there.)');
  });

  it('uses cached lines without translating them again', async () => {
    const cache = createMemoryTranslationCache();
    await cache.put('abc', {
      [sentenceHash('Hello there.')]: { vi: 'Xin chào.', source: 'edited' },
    });
    const translation = fakeTranslator('ready');
    setup(translation, cache);
    await flush();
    expect(screen.getByTestId('sl-vi-spoken').textContent).toBe('Xin chào.');
    expect(translation.translate).not.toHaveBeenCalledWith('Hello there.');
    expect(screen.getByTestId('sl-source').textContent).toBe(vi.viBadgeEdited);
  });

  it('lets the learner edit the spoken line (Enter saves, Esc cancels)', async () => {
    const { cache } = setup(fakeTranslator('ready'));
    await flush();
    fireEvent.click(screen.getByTestId('sl-vi-edit-button'));
    const box = screen.getByTestId('sl-vi-edit');
    fireEvent.change(box, { target: { value: 'Chào bạn.' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.getByTestId('sl-vi-spoken').textContent).toBe('VI(Hello there.)');
    fireEvent.click(screen.getByTestId('sl-vi-edit-button'));
    fireEvent.change(screen.getByTestId('sl-vi-edit'), { target: { value: 'Chào bạn.' } });
    fireEvent.keyDown(screen.getByTestId('sl-vi-edit'), { key: 'Enter' });
    await flush();
    expect(screen.getByTestId('sl-vi-spoken').textContent).toBe('Chào bạn.');
    expect(screen.getByTestId('sl-vi-spoken').dataset.source).toBe('edited');
    const saved = await cache.get('abc', [sentenceHash('Hello there.')]);
    expect(Object.values(saved)[0]).toEqual({ vi: 'Chào bạn.', source: 'edited' });
  });

  it('chips hide English or Vietnamese, never both', async () => {
    const { store } = setup(fakeTranslator('ready'));
    await flush();
    fireEvent.click(screen.getByTestId('sl-en-toggle'));
    expect(store.getState().showEnglish).toBe(false);
    expect(screen.queryByText('How are you today?')).toBeNull();
    fireEvent.click(screen.getByTestId('sl-vi-toggle'));
    expect(store.getState().showVietnamese).toBe(false);
    expect(store.getState().showEnglish).toBe(true);
    expect(screen.queryByTestId('sl-vi')).toBeNull();
  });

  it('disables the Vietnamese chip when the browser cannot translate', async () => {
    setup(fakeTranslator('unsupported'));
    await flush();
    const chip = screen.getByTestId('sl-vi-toggle') as HTMLButtonElement;
    expect(chip.disabled).toBe(true);
    expect(chip.title).toBe(vi.translatorUnsupported);
    expect(screen.queryByTestId('sl-vi-download')).toBeNull();
  });

  it('respects the bilingual flag', async () => {
    setFlags({ bilingual: false });
    setup(fakeTranslator('ready'));
    await flush();
    expect(screen.queryByTestId('sl-vi-toggle')).toBeNull();
    expect(screen.queryByTestId('sl-vi')).toBeNull();
  });

  it("prefers the video's human Vietnamese captions over machine lines", async () => {
    const cache = createMemoryTranslationCache();
    await cache.put('abc', {
      [sentenceHash('Hello there.')]: { vi: 'Máy dịch.', source: 'machine' },
      [sentenceHash('How are you today?')]: { vi: 'Tôi tự sửa.', source: 'edited' },
    });
    const { store } = setup(fakeTranslator('ready'), cache);
    await flush();
    act(() => {
      store
        .getState()
        .setHumanCues([cue(1000, 3000, 'Chào các bạn.'), cue(3000, 5000, 'Phụ đề gốc.')]);
    });
    await flush();
    const spoken = screen.getByTestId('sl-vi-spoken');
    expect(spoken.textContent).toBe('Chào các bạn.');
    expect(spoken.dataset.source).toBe('human');
    // The learner's own line still wins.
    expect(screen.getByTestId('sl-vi').textContent).toBe('Tôi tự sửa.');
    expect(screen.getByTestId('sl-source').textContent).toBe(vi.viBadgeHuman);
    // Human lines are not written to the device cache.
    const saved = await cache.get('abc', [sentenceHash('Hello there.')]);
    expect(Object.values(saved)[0]?.source).toBe('machine');
  });

  it('shows human Vietnamese captions even where the browser cannot translate', async () => {
    const { store } = setup(fakeTranslator('unsupported'));
    await flush();
    act(() => store.getState().setHumanCues([cue(1000, 3000, 'Chào các bạn.')]));
    await flush();
    expect((screen.getByTestId('sl-vi-toggle') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId('sl-vi-spoken').textContent).toBe('Chào các bạn.');
  });

  it('the theater bar shows the Vietnamese line under the English', () => {
    const store = createPanelStore({ theme: 'dark' });
    store.getState().setVideo('abc');
    store
      .getState()
      .setTrack(
        buildTrack({ videoId: 'abc', body: SRT, lang: 'en', kind: 'manual', source: 'player' }),
      );
    store.getState().setTime(1500);
    store
      .getState()
      .addTranslations({ [sentenceHash('Hello there.')]: { vi: 'Xin chào.', source: 'machine' } });
    render(<CaptionBar store={store} />);
    expect(screen.getByTestId('sl-bar-vi').textContent).toBe('Xin chào.');
  });
});
