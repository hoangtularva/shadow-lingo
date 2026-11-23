import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
