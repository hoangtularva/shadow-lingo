import { TOGGLE_PANEL_MESSAGE, type TogglePanelMessage } from '@/lib/messages';
import { tagSentence } from '@shadow-lingo/core/pos-tagger';
import { createPosHandler, isPosTagRequest } from '@/lib/pos';
import { DICT_PATH, createLookupHandler, isIpaLookupRequest } from '@/lib/pronunciation';
import { MIC_PERMISSION_PATH, RECORDER_PATH, createRecHandler, isRecRequest } from '@/lib/recorder';

let creatingOffscreen: Promise<void> | null = null;

/** The offscreen recorder page owns the microphone; create it on first use. */
async function ensureOffscreen(): Promise<void> {
  const url = browser.runtime.getURL(RECORDER_PATH as '/');
  const open = await browser.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url],
  });
  if (open.length > 0) return;
  creatingOffscreen ??= browser.offscreen
    .createDocument({
      url,
      reasons: ['USER_MEDIA'],
      justification: 'Records the learner voice for shadowing and plays it back, on device only.',
    })
    .finally(() => {
      creatingOffscreen = null;
    });
  await creatingOffscreen;
}

export default defineBackground(() => {
  const handle = createLookupHandler(async () => {
    const res = await fetch(browser.runtime.getURL(DICT_PATH as '/'));
    if (!res.ok) throw new Error(`dictionary: HTTP ${res.status}`);
    return res.text();
  });

  const tagPos = createPosHandler(tagSentence);

  const record = createRecHandler({
    ensureOffscreen,
    forward: (m) => browser.runtime.sendMessage(m),
    openPermissionPage: async () => {
      await browser.tabs.create({ url: browser.runtime.getURL(MIC_PERMISSION_PATH as '/') });
    },
  });

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    // Only our own content scripts may ask; never answer other extensions.
    if (sender.id !== browser.runtime.id) return undefined;
    if (isIpaLookupRequest(message)) return handle(message);
    if (isPosTagRequest(message)) return Promise.resolve(tagPos(message));
    // Recorder requests come from the panel (a tab); the offscreen page answers the background.
    if (isRecRequest(message) && sender.tab) return record(message);
    return undefined;
  });

  // Toolbar icon: show or hide the panel in that tab (the content script only runs on youtube.com).
  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    const msg: TogglePanelMessage = { type: TOGGLE_PANEL_MESSAGE };
    browser.tabs.sendMessage(tab.id, msg).catch(() => undefined);
  });
});
