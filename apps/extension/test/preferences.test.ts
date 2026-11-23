import type { StorageAdapter } from '@shadow-lingo/core';
import { createPanelStore } from '@shadow-lingo/core/panel';
import { describe, expect, it } from 'vitest';
import { PREFS_KEY, syncPreferences } from '@/lib/preferences';

function memoryStorage(initial: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(initial));
  const writes: unknown[] = [];
  const storage: StorageAdapter = {
    get: <T>(key: string) => Promise.resolve(data.get(key) as T | undefined),
    set: <T>(key: string, value: T) => {
      data.set(key, value);
      writes.push(value);
      return Promise.resolve();
    },
    remove: (key: string) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
  return { storage, data, writes };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('syncPreferences', () => {
  it('loads saved toggles into the store without writing them back', async () => {
    const { storage, writes } = memoryStorage({
      [PREFS_KEY]: { showIpa: false, showLinking: true, showPos: false, autoPause: true },
    });
    const store = createPanelStore();
    syncPreferences(store, storage);
    await flush();
    const s = store.getState();
    expect([s.showIpa, s.showLinking, s.showPos, s.autoPause]).toEqual([false, true, false, true]);
    expect(writes).toEqual([]);
  });

  it('saves toggle changes, not unrelated state', async () => {
    const { storage, data, writes } = memoryStorage();
    const store = createPanelStore();
    syncPreferences(store, storage);
    await flush();
    store.getState().setTime(1000);
    expect(writes).toHaveLength(0);
    store.getState().setShowLinking(false);
    expect(data.get(PREFS_KEY)).toEqual({
      showIpa: true,
      showLinking: false,
      showPos: true,
      autoPause: false,
      showEnglish: true,
      showVietnamese: true,
    });
    expect(writes).toHaveLength(1);
  });

  it('does not overwrite saved values when a toggle changes before the load', async () => {
    const { storage, data } = memoryStorage({ [PREFS_KEY]: { showPos: false } });
    const store = createPanelStore();
    syncPreferences(store, storage);
    store.getState().setShowIpa(false);
    expect(data.get(PREFS_KEY)).toEqual({ showPos: false });
    await flush();
    expect(store.getState().showPos).toBe(false);
    // The toggle flipped during the load is kept, and saved with the others.
    expect(store.getState().showIpa).toBe(false);
    expect(data.get(PREFS_KEY)).toMatchObject({ showPos: false, showIpa: false });
  });

  it('stops saving after cleanup', async () => {
    const { storage, writes } = memoryStorage();
    const store = createPanelStore();
    const stop = syncPreferences(store, storage);
    await flush();
    stop();
    store.getState().setShowPos(false);
    expect(writes).toHaveLength(0);
  });
});
