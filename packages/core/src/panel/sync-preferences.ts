import type { StorageAdapter } from '../adapters';
import {
  preferencesOf,
  sanitizePreferences,
  type PanelPreferences,
  type PanelStore,
} from './store';

export const PREFS_KEY = 'panelPrefs';

function same(a: PanelPreferences, b: PanelPreferences): boolean {
  return (Object.keys(a) as (keyof PanelPreferences)[]).every((k) => a[k] === b[k]);
}

/**
 * Loads saved display toggles (IPA, linking, POS, auto-pause) into the store, then saves
 * every later change. Nothing is written before the load finishes, so defaults never
 * overwrite what was saved. Returns a function that stops saving.
 */
export function syncPreferences(store: PanelStore, area: StorageAdapter): () => void {
  let stopped = false;
  let unsubscribe: (() => void) | null = null;
  void area.get<unknown>(PREFS_KEY).then((raw) => {
    if (stopped) return;
    let last = sanitizePreferences(raw);
    store.getState().setPreferences(last);
    unsubscribe = store.subscribe((s) => {
      const next = preferencesOf(s);
      if (same(next, last)) return;
      last = next;
      void area.set(PREFS_KEY, next);
    });
  });
  return () => {
    stopped = true;
    unsubscribe?.();
  };
}
