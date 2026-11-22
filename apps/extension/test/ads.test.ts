import { describe, expect, it, vi } from 'vitest';
import { createYouTubeAds } from '@/lib/ads';

describe('createYouTubeAds', () => {
  it('reports the player’s ad-showing class, also on a replaced player', async () => {
    const el = document.createElement('div');
    el.id = 'movie_player';
    document.body.replaceChildren(el);
    const ads = createYouTubeAds(document);
    const seen = vi.fn();
    const stop = ads.onChange(seen);
    const player = () => document.querySelector('#movie_player') as HTMLElement;
    player().classList.add('ad-showing');
    await Promise.resolve();
    expect(ads.isShowing()).toBe(true);
    expect(seen).toHaveBeenLastCalledWith(true);
    player().classList.remove('ad-showing');
    await Promise.resolve();
    expect(seen).toHaveBeenLastCalledWith(false);
    stop();
    player().classList.add('ad-showing');
    await Promise.resolve();
    expect(seen).toHaveBeenCalledTimes(2);
  });
});
