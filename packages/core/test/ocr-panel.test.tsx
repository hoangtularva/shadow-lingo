import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi as vitestVi } from 'vitest';
import type { PlayerAdapter } from '../src/adapters';
import type { OcrAdapter, OcrReading } from '../src/ocr';
import { Panel } from '../src/panel/Panel';
import { createPanelStore } from '../src/panel/store';
import { vi } from '../src/panel/strings';
import { OCR_INTERVAL_MS } from '../src/panel/useOcr';

function playingPlayer() {
  let time = 0;
  const player: PlayerAdapter = {
    getCurrentTime: () => time,
    seekTo: (ms) => {
      time = ms;
    },
    play: () => undefined,
    pause: () => undefined,
    isPaused: () => false,
    getPlaybackRate: () => 1,
    setPlaybackRate: () => undefined,
    onTimeUpdate: () => () => undefined,
  };
  return { player, at: (ms: number) => (time = ms) };
}

/** Returns the scripted reading for the current time. */
function scriptedOcr(at: () => number, script: [number, string][]) {
  const bands: string[] = [];
  const ocr: OcrAdapter = {
    read(band) {
      bands.push(band);
      const t = at();
      const line = [...script].reverse().find(([from]) => t >= from)?.[1] ?? '';
      const reading: OcrReading = { text: line, confidence: line ? 90 : 0 };
      return Promise.resolve(reading);
    },
  };
  return { ocr, bands };
}

describe('Đọc chữ trên hình', () => {
  beforeEach(() => vitestVi.useFakeTimers());
  afterEach(() => vitestVi.useRealTimers());

  it('starts from "Dùng nguồn khác", reads as the video plays, stops on demand', async () => {
    const store = createPanelStore({ theme: 'dark' });
    store.getState().setVideo('abc');
    const { player, at } = playingPlayer();
    let now = 0;
    const { ocr, bands } = scriptedOcr(
      () => now,
      [
        [0, 'So what do we do now?'],
        [2000, 'I think we should figure it out together.'],
        [4000, ''],
      ],
    );
    render(<Panel store={store} player={player} ocr={ocr} />);
    fireEvent.click(screen.getByTestId('sl-empty-other'));
    fireEvent.click(screen.getByTestId('sl-ocr-start'));
    expect(screen.getByTestId('sl-ocr-waiting').textContent).toBe(vi.ocrWaiting);
    for (let t = 0; t <= 5000; t += OCR_INTERVAL_MS) {
      now = t;
      at(t);
      await act(async () => {
        vitestVi.advanceTimersByTime(OCR_INTERVAL_MS);
        await Promise.resolve();
      });
    }
    expect(screen.getByTestId('sl-ocr-count').textContent).toBe(vi.ocrReading(2));
    expect(screen.getAllByTestId('sl-sentence').map((s) => s.dataset.text)).toEqual([
      'So what do we do now?',
      'I think we should figure it out together.',
    ]);
    expect(screen.getByTestId('sl-source').textContent).toBe(vi.sourceOcr);
    fireEvent.click(screen.getByTestId('sl-ocr-top'));
    await act(async () => {
      vitestVi.advanceTimersByTime(OCR_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(bands.at(-1)).toBe('top');
    fireEvent.click(screen.getByTestId('sl-ocr-stop'));
    expect(screen.queryByTestId('sl-ocr')).toBeNull();
    // What was read stays.
    expect(screen.getAllByTestId('sl-sentence')).toHaveLength(2);
  });

  it('a protected video says so and stops', async () => {
    const store = createPanelStore({ theme: 'dark' });
    store.getState().setVideo('abc');
    const { player } = playingPlayer();
    const ocr: OcrAdapter = { read: () => Promise.resolve('blocked') };
    render(<Panel store={store} player={player} ocr={ocr} />);
    fireEvent.click(screen.getByTestId('sl-empty-other'));
    fireEvent.click(screen.getByTestId('sl-ocr-start'));
    await act(async () => {
      vitestVi.advanceTimersByTime(OCR_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(store.getState().ocr.active).toBe(false);
    expect(store.getState().notice).toBe(vi.ocrBlocked);
  });

  it('no OCR option without a platform reader', () => {
    const store = createPanelStore({ theme: 'dark' });
    store.getState().setVideo('abc');
    render(<Panel store={store} player={playingPlayer().player} />);
    fireEvent.click(screen.getByTestId('sl-empty-other'));
    expect(screen.queryByTestId('sl-ocr-start')).toBeNull();
  });
});
