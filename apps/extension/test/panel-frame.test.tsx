import type { PlayerAdapter, StorageAdapter } from '@shadow-lingo/core';
import { createPanelStore } from '@shadow-lingo/core/panel';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PanelFrame } from '@/components/PanelFrame';
import { DEFAULT_LAYOUT, LAYOUT_KEY } from '@/lib/layout';

const player: PlayerAdapter = {
  getCurrentTime: () => 0,
  seekTo: () => undefined,
  play: () => undefined,
  pause: () => undefined,
  isPaused: () => true,
  getPlaybackRate: () => 1,
  setPlaybackRate: () => undefined,
  onTimeUpdate: () => () => undefined,
};

/** Storage whose first read of the saved layout answers only when the test says so. */
function slowStorage(saved: unknown) {
  const data = new Map<string, unknown>();
  let answer: (() => void) | null = null;
  const storage: StorageAdapter = {
    get: <T,>(key: string) =>
      key === LAYOUT_KEY
        ? new Promise<T | undefined>((resolve) => {
            answer = () => resolve(saved as T);
          })
        : Promise.resolve(data.get(key) as T | undefined),
    set: <T,>(key: string, value: T) => {
      data.set(key, value);
      return Promise.resolve();
    },
    remove: (key: string) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
  return { storage, data, load: () => answer?.() };
}

function setup(saved: unknown) {
  const store = createPanelStore({ theme: 'dark' });
  const slow = slowStorage(saved);
  const host = document.createElement('div');
  document.body.append(host);
  render(
    <PanelFrame
      store={store}
      player={player}
      storage={slow.storage}
      host={host}
      getPlayerRect={() => null}
    />,
  );
  return { store, ...slow };
}

describe('PanelFrame while the saved layout is still loading', () => {
  it('keeps a drag to a floating spot when the saved (docked) layout arrives late', async () => {
    const { data, load } = setup({ ...DEFAULT_LAYOUT, mode: 'docked' });
    const header = screen.getByTestId('sl-header');
    // jsdom has no PointerEvent: mouse events with pointer types carry the coordinates.
    const pointer = (target: EventTarget, type: string, x: number, y: number) =>
      act(() => {
        target.dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: x,
            clientY: y,
          }),
        );
      });
    pointer(header, 'pointerdown', 40, 10);
    pointer(window, 'pointermove', 240, 60);
    pointer(window, 'pointerup', 240, 60);
    expect(screen.getByTestId('sl-frame').dataset.mode).toBe('floating');
    await act(async () => {
      load();
      await Promise.resolve();
    });
    // The learner's drag wins over the late saved layout, and is saved.
    expect(screen.getByTestId('sl-frame').dataset.mode).toBe('floating');
    expect((data.get(LAYOUT_KEY) as { mode?: string } | undefined)?.mode).toBe('floating');
  });

  it('still applies the saved layout when nothing was changed meanwhile', async () => {
    const { store, load } = setup({ ...DEFAULT_LAYOUT, collapsed: true });
    await act(async () => {
      load();
      await Promise.resolve();
    });
    expect(store.getState().collapsed).toBe(true);
  });
});
