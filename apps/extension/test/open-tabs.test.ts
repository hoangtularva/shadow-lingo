import { describe, expect, it, vi } from 'vitest';
import {
  CAPTION_HOOK_FILE,
  CONTENT_FILE,
  CONTENT_MARK,
  addPanelToOpenTabs,
  hasContentMark,
  isYouTubePage,
  type OpenTab,
} from '@/lib/open-tabs';

describe('panel in tabs open before install', () => {
  it('adds the hook then the panel to each open YouTube tab', async () => {
    const calls: string[] = [];
    const ok = 'complete';
    const tabs: OpenTab[] = [
      { id: 1, url: 'https://www.youtube.com/watch?v=abc', status: ok },
      { id: 2, url: 'https://www.youtube.com/', discarded: true, status: ok },
      { id: 3, url: 'https://evil.example/www.youtube.com', status: ok },
      { url: 'https://www.youtube.com/feed', status: ok },
      { id: 4, url: 'https://www.youtube.com/feed', status: ok },
      { id: 5, url: 'https://www.youtube.com/watch?v=loading', status: 'loading' },
      { id: 6, url: 'https://www.youtube.com/watch?v=has', status: ok },
    ];
    const n = await addPanelToOpenTabs({
      query: async () => tabs,
      hasPanel: async (id) => id === 6,
      inject: async (id, file, world) => {
        calls.push(`${id} ${file} ${world}`);
      },
    });
    expect(n).toBe(2);
    expect(calls).toEqual([
      `1 ${CAPTION_HOOK_FILE} MAIN`,
      `1 ${CONTENT_FILE} ISOLATED`,
      `4 ${CAPTION_HOOK_FILE} MAIN`,
      `4 ${CONTENT_FILE} ISOLATED`,
    ]);
  });

  it('skips a tab that refuses and keeps going', async () => {
    const inject = vi.fn(async (id: number) => {
      if (id === 1) throw new Error('tab closed');
    });
    const n = await addPanelToOpenTabs({
      query: async () => [
        { id: 1, url: 'https://www.youtube.com/watch?v=a', status: 'complete' },
        { id: 2, url: 'https://www.youtube.com/watch?v=b', status: 'complete' },
      ],
      hasPanel: async () => false,
      inject,
    });
    expect(n).toBe(1);
    expect(inject).toHaveBeenCalledTimes(3);
  });

  it('does nothing when tabs cannot be listed', async () => {
    const inject = vi.fn(async () => undefined);
    const hasPanel = async () => false;
    const query = () => Promise.reject(new Error('no'));
    expect(await addPanelToOpenTabs({ query, hasPanel, inject })).toBe(0);
    expect(inject).not.toHaveBeenCalled();
  });

  it('the mark is seen only where the panel script set it', () => {
    expect(hasContentMark()).toBe(false);
    Object.defineProperty(globalThis, Symbol.for(CONTENT_MARK), {
      value: true,
      configurable: true,
    });
    expect(hasContentMark()).toBe(true);
    Reflect.deleteProperty(globalThis, Symbol.for(CONTENT_MARK));
  });

  it('matches only https://www.youtube.com pages', () => {
    expect(isYouTubePage('https://www.youtube.com/watch?v=a')).toBe(true);
    expect(isYouTubePage('http://www.youtube.com/')).toBe(false);
    expect(isYouTubePage('https://youtube.com.evil.example/')).toBe(false);
    expect(isYouTubePage('https://m.youtube.com/')).toBe(false);
    expect(isYouTubePage(undefined)).toBe(false);
    expect(isYouTubePage('not a url')).toBe(false);
  });
});
