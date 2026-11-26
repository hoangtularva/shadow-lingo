import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import { resetFlags, setFlags } from '../src/features';
import type { PlayerAdapter } from '../src/adapters';
import { Panel } from '../src/panel/Panel';
import { createPanelStore } from '../src/panel/store';
import { vi } from '../src/panel/strings';
import { buildTrack } from '../src/tracks';
import { createMemoryVocabStore } from '../src/vocab';

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

function storeWithTrack() {
  const store = createPanelStore();
  store.getState().setVideo('abc');
  store.getState().setTrack(
    buildTrack({
      videoId: 'abc',
      body: '1\n00:00:01,000 --> 00:00:02,000\nHello there.\n',
      lang: 'en',
      kind: 'manual',
      source: 'player',
    }),
  );
  return store;
}

describe('panel without its header (phone apps)', () => {
  it('draws the source badge into the app bar instead', () => {
    const target = document.createElement('div');
    document.body.append(target);
    render(<Panel store={storeWithTrack()} player={player} header={false} badgeTarget={target} />);
    expect(screen.queryByTestId('sl-header')).toBeNull();
    expect(target.querySelector('[data-testid="sl-source"]')).not.toBeNull();
    target.remove();
  });

  it('keeps both step labels and a second "other source" button for narrow widths', () => {
    render(<Panel store={storeWithTrack()} player={player} vocab={createMemoryVocabStore()} />);
    expect(screen.getByTestId('sl-header')).toBeTruthy();
    const step = screen.getByTestId('sl-step-1');
    expect(step.textContent).toContain(vi.stepListen);
    expect(step.textContent).toContain(vi.stepListenShort);
    expect(screen.getByTestId('sl-other-source-tabs').textContent).toBe(vi.useOtherSource);
  });
});

describe('donate button in the header', () => {
  afterEach(() => {
    resetFlags();
    vitest.restoreAllMocks();
  });

  it('opens the donation page in a new tab, only when asked to', () => {
    const open = vitest.spyOn(window, 'open').mockReturnValue(null);
    const href = 'https://example.test/#ung-ho';
    render(<Panel store={storeWithTrack()} player={player} donateHref={href} />);
    const button = screen.getByTestId('sl-donate');
    expect(button.getAttribute('aria-label')).toBe(vi.donateLabel);
    fireEvent.click(button);
    expect(open).toHaveBeenCalledExactlyOnceWith(href, '_blank', 'noopener');
  });

  it('is absent without a page, behind its flag, and when collapsed', () => {
    const { unmount } = render(<Panel store={storeWithTrack()} player={player} />);
    expect(screen.queryByTestId('sl-donate')).toBeNull();
    unmount();

    setFlags({ donate: false });
    const off = render(
      <Panel store={storeWithTrack()} player={player} donateHref="https://x.test" />,
    );
    expect(screen.queryByTestId('sl-donate')).toBeNull();
    off.unmount();
    resetFlags();

    const store = storeWithTrack();
    store.getState().setCollapsed(true);
    render(<Panel store={store} player={player} donateHref="https://x.test" />);
    expect(screen.queryByTestId('sl-donate')).toBeNull();
  });
});
