import { TOGGLE_PANEL_MESSAGE, type TogglePanelMessage } from '@/lib/messages';
import { tagSentence } from '@shadow-lingo/core/pos-tagger';
import { createPosHandler, isPosTagRequest } from '@/lib/pos';
import { DICT_PATH, createLookupHandler, isIpaLookupRequest } from '@/lib/pronunciation';

export default defineBackground(() => {
  const handle = createLookupHandler(async () => {
    const res = await fetch(browser.runtime.getURL(DICT_PATH as '/'));
    if (!res.ok) throw new Error(`dictionary: HTTP ${res.status}`);
    return res.text();
  });

  const tagPos = createPosHandler(tagSentence);

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    // Only our own content scripts may ask; never answer other extensions.
    if (sender.id !== browser.runtime.id) return undefined;
    if (isIpaLookupRequest(message)) return handle(message);
    if (isPosTagRequest(message)) return Promise.resolve(tagPos(message));
    return undefined;
  });

  // Toolbar icon: show or hide the panel in that tab (the content script only runs on youtube.com).
  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    const msg: TogglePanelMessage = { type: TOGGLE_PANEL_MESSAGE };
    browser.tabs.sendMessage(tab.id, msg).catch(() => undefined);
  });
});
