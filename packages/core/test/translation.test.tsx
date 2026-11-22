import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi as vitestVi } from 'vitest';
import {
  createMemoryTranslationCache,
  type PlayerAdapter,
  type TranslationAdapter,
  type TranslatorState,
} from '../src/adapters';
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
