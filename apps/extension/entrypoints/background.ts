import { TOGGLE_PANEL_MESSAGE, type TogglePanelMessage } from '@/lib/messages';
import { DICT_PATH, createLookupHandler, isIpaLookupRequest } from '@/lib/pronunciation';

export default defineBackground(() => {
  const handle = createLookupHandler(async () => {
    const res = await fetch(browser.runtime.getURL(DICT_PATH as '/'));
    if (!res.ok) throw new Error(`dictionary: HTTP ${res.status}`);
    return res.text();
  });

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    // Only our own content scripts may ask; never answer other extensions.
    if (sender.id !== browser.runtime.id || !isIpaLookupRequest(message)) return undefined;
    return handle(message);
  });

  // Toolbar icon: show or hide the panel in that tab (the content script only runs on youtube.com).
  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    const msg: TogglePanelMessage = { type: TOGGLE_PANEL_MESSAGE };
    browser.tabs.sendMessage(tab.id, msg).catch(() => undefined);
  });
});
