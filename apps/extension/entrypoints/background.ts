import { TOGGLE_PANEL_MESSAGE, type TogglePanelMessage } from '@/lib/messages';
import { tagSentence } from '@shadow-lingo/core/pos-tagger';
import { createDictionary } from '@shadow-lingo/core';
import { createDictHandler, isDictLookupRequest, shardPath } from '@/lib/dictionary';
import { createPosHandler, isPosTagRequest } from '@/lib/pos';
import { DICT_PATH, createLookupHandler, isIpaLookupRequest } from '@/lib/pronunciation';
import { MIC_PERMISSION_PATH, RECORDER_PATH, createRecHandler, isRecRequest } from '@/lib/recorder';
import { createOcrHandler, isOcrReadRequest } from '@/lib/ocr';

import { createDexieVocabStore, openDb } from '@/lib/db';
import { createDexieTranslationCache } from '@/lib/translation-db';
import { createVocabHandler, isVocabRequest } from '@/lib/vocab';
import {
  createTranslationCacheHandler,
  isTrGetRequest,
  isTrPutRequest,
} from '@/lib/translation-cache';

let creatingOffscreen: Promise<void> | null = null;

/** The offscreen page owns the microphone and the OCR worker; create it on first use. */
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
      reasons: ['USER_MEDIA', 'WORKERS'],
      justification:
        'Records the learner voice for shadowing and reads subtitles in video frames, on device only.',
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

  // Wiktionary definitions, one first-letter shard at a time.
  const lookUpWord = createDictHandler(
    createDictionary(async (name) => {
      const path = shardPath(name);
      if (!path) throw new Error('dictionary: bad shard');
      const res = await fetch(browser.runtime.getURL(path as '/'));
      if (!res.ok) throw new Error(`dictionary: HTTP ${res.status}`);
      return res.text();
    }),
  );

  const tagPos = createPosHandler(tagSentence);
  // Vietnamese lines live in the extension's IndexedDB, never in youtube.com's storage.
  const db = openDb();
  const translations = createTranslationCacheHandler(createDexieTranslationCache(db));
  // The learner's notebook, on this device only.
  const vocab = createVocabHandler(createDexieVocabStore(db));

  const record = createRecHandler({
    ensureOffscreen,
    forward: (m) => browser.runtime.sendMessage(m),
    openPermissionPage: async () => {
      await browser.tabs.create({ url: browser.runtime.getURL(MIC_PERMISSION_PATH as '/') });
    },
  });

  const readSubtitles = createOcrHandler({
    ensureOffscreen,
    forward: (m) => browser.runtime.sendMessage(m),
  });

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    // Only our own content scripts may ask; never answer other extensions.
    if (sender.id !== browser.runtime.id) return undefined;
    if (isIpaLookupRequest(message)) return handle(message);
    if (isPosTagRequest(message)) return Promise.resolve(tagPos(message));
    if (isDictLookupRequest(message) && sender.tab) return lookUpWord(message);
    // Recorder requests come from the panel (a tab); the offscreen page answers the background.
    if (isRecRequest(message) && sender.tab) return record(message);
    if (isTrGetRequest(message) && sender.tab) return translations.get(message);
    if (isTrPutRequest(message) && sender.tab) return translations.put(message);
    if (isVocabRequest(message) && sender.tab) return vocab(message);
    if (isOcrReadRequest(message) && sender.tab) return readSubtitles(message);
    return undefined;
  });

  // Toolbar icon: show or hide the panel in that tab (the content script only runs on youtube.com).
  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    const msg: TogglePanelMessage = { type: TOGGLE_PANEL_MESSAGE };
    browser.tabs.sendMessage(tab.id, msg).catch(() => undefined);
  });
});
