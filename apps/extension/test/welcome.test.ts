import { describe, expect, it, vi } from 'vitest';
import { WELCOME_PATH, openWelcomeOnInstall, shouldOpenWelcome } from '@/lib/welcome';

describe('welcome page', () => {
  it('opens only on a fresh install', () => {
    expect(shouldOpenWelcome('install')).toBe(true);
    for (const reason of ['update', 'chrome_update', 'browser_update', 'shared_module_update']) {
      expect(shouldOpenWelcome(reason)).toBe(false);
    }
  });

  it('opens the packaged page once on install', async () => {
    const open = vi.fn(async () => undefined);
    expect(await openWelcomeOnInstall('install', open)).toBe(true);
    expect(open).toHaveBeenCalledExactlyOnceWith(WELCOME_PATH);
  });

  it('does nothing on update', async () => {
    const open = vi.fn(async () => undefined);
    expect(await openWelcomeOnInstall('update', open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('swallows a failing tab', async () => {
    const open = vi.fn(async () => {
      throw new Error('no tabs');
    });
    expect(await openWelcomeOnInstall('install', open)).toBe(false);
  });
});
