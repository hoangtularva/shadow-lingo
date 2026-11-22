import { describe, expect, it } from 'vitest';
import {
  createPanelStore,
  DEFAULT_PREFERENCES,
  preferencesOf,
  sanitizePreferences,
} from '../src/panel/store';

describe('panel preferences', () => {
  it('falls back to defaults for missing or invalid values', () => {
    expect(sanitizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences('x')).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences({ showIpa: 'no', autoPause: 1 })).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps valid saved values', () => {
    const saved = {
      showIpa: false,
      showLinking: false,
      showPos: false,
      autoPause: true,
      showEnglish: false,
      showVietnamese: true,
    };
    expect(sanitizePreferences({ ...saved, extra: 1 })).toEqual(saved);
  });

  it('applies to and reads back from the store', () => {
    const store = createPanelStore();
    expect(preferencesOf(store.getState())).toEqual(DEFAULT_PREFERENCES);
    store.getState().setPreferences({ showPos: false, autoPause: true });
    expect(preferencesOf(store.getState())).toEqual({
      ...DEFAULT_PREFERENCES,
      showPos: false,
      autoPause: true,
    });
  });

  it('survives a video change', () => {
    const store = createPanelStore();
    store.getState().setShowLinking(false);
    store.getState().setVideo('abc');
    expect(store.getState().showLinking).toBe(false);
  });
});
