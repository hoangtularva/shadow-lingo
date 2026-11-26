/**
 * The welcome page: a short "how to start" tab, opened once right after a fresh install.
 * Updates, browser updates and reloads during development never open it again.
 */
export const WELCOME_PATH = '/welcome.html';

/** `reason` from runtime.onInstalled. */
export function shouldOpenWelcome(reason: string): boolean {
  return reason === 'install';
}

/** Opens the welcome page in a new tab after a fresh install; errors are ignored. */
export async function openWelcomeOnInstall(
  reason: string,
  openTab: (path: string) => Promise<unknown>,
): Promise<boolean> {
  if (!shouldOpenWelcome(reason)) return false;
  try {
    await openTab(WELCOME_PATH);
    return true;
  } catch {
    return false;
  }
}
