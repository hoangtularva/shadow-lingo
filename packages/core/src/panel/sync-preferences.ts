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
 * overwrite what was saved; a toggle flipped during the load is kept and saved. Returns a function that stops saving.
 */
export function syncPreferences(store: PanelStore, area: StorageAdapter): () => void {
  let stopped = false;
  let unsubscribe: (() => void) | null = null;
  const before = preferencesOf(store.getState());
  void area.get<unknown>(PREFS_KEY).then((raw) => {
    if (stopped) return;
    const saved = sanitizePreferences(raw);
    // A toggle the learner flipped while the saved ones were loading keeps their choice.
    const now = preferencesOf(store.getState());
    const kept: Partial<PanelPreferences> = {};
    for (const k of Object.keys(now) as (keyof PanelPreferences)[]) {
      if (now[k] !== before[k]) Object.assign(kept, { [k]: now[k] });
    }
    let last: PanelPreferences = { ...saved, ...kept };
    store.getState().setPreferences(last);
    if (!same(last, saved)) void area.set(PREFS_KEY, last);
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
