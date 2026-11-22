import type { StorageAdapter } from '@shadow-lingo/core';
import {
  preferencesOf,
  sanitizePreferences,
  type PanelPreferences,
  type PanelStore,
} from '@shadow-lingo/core/panel';

export const PREFS_KEY = 'panelPrefs';

function same(a: PanelPreferences, b: PanelPreferences): boolean {
  return (Object.keys(a) as (keyof PanelPreferences)[]).every((k) => a[k] === b[k]);
}

/**
 * Loads saved display toggles (IPA, linking, POS, auto-pause) into the store, then saves
 * every later change. Nothing is written before the load finishes, so defaults never
 * overwrite what was saved. Returns a function that stops saving.
 */
export function syncPreferences(store: PanelStore, storage: StorageAdapter): () => void {
  let stopped = false;
  let unsubscribe: (() => void) | null = null;
  void storage.get<unknown>(PREFS_KEY).then((raw) => {
    if (stopped) return;
    let last = sanitizePreferences(raw);
    store.getState().setPreferences(last);
    unsubscribe = store.subscribe((s) => {
      const next = preferencesOf(s);
      if (same(next, last)) return;
      last = next;
      void storage.set(PREFS_KEY, next);
    });
  });
  return () => {
    stopped = true;
    unsubscribe?.();
  };
}
