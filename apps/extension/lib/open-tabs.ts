/**
 * After install or update, YouTube tabs that were already open have no panel (browsers only
 * run content scripts on pages loaded later). The background adds the extension's own two
 * packaged scripts to those tabs; nothing else is ever injected, and only into youtube.com.
 */
export const YOUTUBE_TABS = 'https://www.youtube.com/*';
export const CAPTION_HOOK_FILE = '/content-scripts/caption-hook.js';
export const CONTENT_FILE = '/content-scripts/content.js';
/**
 * Set by the running content script in the extension's isolated world (pages cannot see or
 * fake it). A copy from before an update lives in an older world, so it does not count.
 */
export const CONTENT_MARK = 'shadow-lingo:content';

/** Runs inside the tab's isolated world: does this version's panel script run here? */
export function hasContentMark(): boolean {
  return Reflect.has(globalThis, Symbol.for('shadow-lingo:content'));
}

export interface OpenTab {
  id?: number;
  url?: string;
  discarded?: boolean;
  status?: string;
}

export interface OpenTabsDeps {
  query(): Promise<OpenTab[]>;
  /** True when the tab already runs this version's content script. */
  hasPanel(tabId: number): Promise<boolean>;
  inject(tabId: number, file: string, world: 'MAIN' | 'ISOLATED'): Promise<void>;
}

/** True for a page the content scripts match (checked again here, not only by the query). */
export function isYouTubePage(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'www.youtube.com';
  } catch {
    return false;
  }
}

/** Adds the panel to every open YouTube tab; returns how many tabs got it. */
export async function addPanelToOpenTabs(deps: OpenTabsDeps): Promise<number> {
  let tabs: OpenTab[];
  try {
    tabs = await deps.query();
  } catch {
    return 0;
  }
  let done = 0;
  for (const tab of tabs) {
    // A discarded tab reloads when the learner opens it, and a loading one gets the
    // browser's own scripts: both get the panel anyway.
    if (tab.id === undefined || tab.discarded || tab.status !== 'complete') continue;
    if (!isYouTubePage(tab.url)) continue;
    try {
      if (await deps.hasPanel(tab.id)) continue;
      // The caption hook first, so the panel's replay request finds it.
      await deps.inject(tab.id, CAPTION_HOOK_FILE, 'MAIN');
      await deps.inject(tab.id, CONTENT_FILE, 'ISOLATED');
      done++;
    } catch {
      // A tab that is loading or closing is skipped; it gets the scripts on its own.
    }
  }
  return done;
}
