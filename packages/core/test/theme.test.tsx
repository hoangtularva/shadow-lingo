import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { PlayerAdapter } from '../src/adapters';
import { Panel } from '../src/panel/Panel';
import {
  createPanelStore,
  preferencesOf,
  resolveTheme,
  sanitizePreferences,
  type ThemeMode,
} from '../src/panel/store';
import { vi } from '../src/panel/strings';
import { ThemeMenu } from '../src/panel/ThemeMenu';

describe('theme mode', () => {
  it('follows the page unless the learner forces light or dark', () => {
    const store = createPanelStore({ theme: 'dark' });
    expect(store.getState().theme).toBe('dark');
    store.getState().setThemeMode('light');
    expect(store.getState().theme).toBe('light');
    // The page changes theme: a forced choice stays.
    store.getState().setTheme('dark');
    expect(store.getState().theme).toBe('light');
    store.getState().setThemeMode('auto');
    expect(store.getState().theme).toBe('dark');
    store.getState().setTheme('light');
    expect(store.getState().theme).toBe('light');
  });

  it('is a saved preference, and junk falls back to auto', () => {
    const store = createPanelStore({ theme: 'light' });
    store.getState().setPreferences({ themeMode: 'dark' });
    expect(store.getState().theme).toBe('dark');
    expect(preferencesOf(store.getState()).themeMode).toBe('dark');
    expect(sanitizePreferences({ themeMode: 'blue' }).themeMode).toBe('auto');
    expect(sanitizePreferences({ themeMode: 'light' }).themeMode).toBe('light');
    expect(resolveTheme('auto', 'dark')).toBe('dark');
    expect(resolveTheme('dark', 'light')).toBe('dark');
  });
});

function Harness({ initial }: { initial: ThemeMode }) {
  const [mode, setMode] = useState<ThemeMode>(initial);
  return (
    <div>
      <ThemeMenu mode={mode} onChange={setMode} autoLabel="Theo YouTube" />
      <span data-testid="outside">outside</span>
    </div>
  );
}

describe('ThemeMenu', () => {
  it('opens a menu of three choices, ticks the current one and picks another', () => {
    render(<Harness initial="auto" />);
    const button = screen.getByTestId('sl-theme');
    expect(button.getAttribute('aria-label')).toBe(vi.themeAria('Theo YouTube'));
    expect(screen.queryByTestId('sl-theme-menu')).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((i) => i.textContent)).toEqual(['Theo YouTube', vi.themeLight, vi.themeDark]);
    expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    fireEvent.click(screen.getByTestId('sl-theme-dark'));
    expect(screen.queryByTestId('sl-theme-menu')).toBeNull();
    expect(button.dataset.mode).toBe('dark');
    expect(document.activeElement).toBe(button);
  });

  it('closes with Esc or a click elsewhere, without changing the choice', () => {
    render(<Harness initial="light" />);
    const button = screen.getByTestId('sl-theme');
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByTestId('sl-theme-menu'), { key: 'Escape' });
    expect(screen.queryByTestId('sl-theme-menu')).toBeNull();
    fireEvent.click(button);
    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('sl-theme-menu')).toBeNull();
    expect(button.dataset.mode).toBe('light');
  });
});

describe('panel header', () => {
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

  it('shows the theme button only when asked, and recolours the panel', () => {
    const store = createPanelStore({ theme: 'dark' });
    const { unmount } = render(<Panel store={store} player={player} />);
    expect(screen.queryByTestId('sl-theme')).toBeNull();
    unmount();
    render(<Panel store={store} player={player} themeFollowLabel={vi.themeFollowYouTube} />);
    fireEvent.click(screen.getByTestId('sl-theme'));
    fireEvent.click(screen.getByTestId('sl-theme-light'));
    expect(screen.getByTestId('sl-panel').getAttribute('data-theme')).toBe('light');
    // Collapsed: the header only keeps expand and close.
    act(() => store.getState().setCollapsed(true));
    expect(screen.queryByTestId('sl-theme')).toBeNull();
  });
});
