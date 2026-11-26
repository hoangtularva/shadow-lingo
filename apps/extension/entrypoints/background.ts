import { TOGGLE_PANEL_MESSAGE, type TogglePanelMessage } from '@/lib/messages';
import { tagSentence } from '@shadow-lingo/core/pos-tagger';
import { createDictionary } from '@shadow-lingo/core';
import { createDictHandler, isDictLookupRequest, shardPath } from '@/lib/dictionary';
import { createPosHandler, isPosTagRequest } from '@/lib/pos';
import { DICT_PATH, createLookupHandler, isIpaLookupRequest } from '@/lib/pronunciation';
import { MIC_PERMISSION_PATH, RECORDER_PATH, createRecHandler, isRecRequest } from '@/lib/recorder';
import { createOcrHandler, isOcrReadRequest } from '@/lib/ocr';
import {
  MIC_WINDOW_PATH,
  MIC_WINDOW_SIZE,
  createMicWindow,
  isMicWindowReady,
} from '@/lib/mic-window';
import { YOUTUBE_TABS, addPanelToOpenTabs, hasContentMark } from '@/lib/open-tabs';

import { createDexieVocabStore, openDb } from '@/lib/db';
import { createDexieTranslationCache } from '@/lib/translation-db';
import { createVocabHandler, isVocabRequest } from '@/lib/vocab';
import { openWelcomeOnInstall } from '@/lib/welcome';
import {
  createTranslationCacheHandler,
  isTrGetRequest,
  isTrPutRequest,
} from '@/lib/translation-cache';

/** Firefox: how long a start may take before its mic window is brought forward. */
const PROMPT_HINT_MS = 1200;

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

  // Firefox has no offscreen documents. Its background page has a DOM, so the OCR engine runs
  // right here, but it gets no microphone: the recorder lives in a small extension window
  // (decided at build time; Chrome keeps the offscreen page for both).
  const firefox = import.meta.env.FIREFOX;
  const noOffscreen = () => Promise.resolve();
  const micWindowUrl = browser.runtime.getURL(MIC_WINDOW_PATH as '/');
  const micWindow = createMicWindow({
    async create() {
      const win = await browser.windows.create({
        url: micWindowUrl,
        type: 'popup',
        ...MIC_WINDOW_SIZE,
        focused: true,
      });
      if (win?.id === undefined) throw new Error('mic window: no id');
      return win.id;
    },
    async exists(id) {
      try {
        await browser.windows.get(id);
        return true;
      } catch {
        return false;
      }
    },
    async focus(id) {
      await browser.windows.update(id, { focused: true, state: 'normal' });
    },
  });
  if (firefox) browser.windows.onRemoved.addListener((id) => micWindow.removed(id));

  const record = createRecHandler({
    ensureOffscreen: firefox ? () => micWindow.ensure() : ensureOffscreen,
    forward: firefox
      ? (m) => {
          const sent = browser.runtime.sendMessage(m);
          if (m.action !== 'start') return sent;
          // A start that takes long is waiting on Firefox's prompt: show the mic window.
          const prompt = setTimeout(() => void micWindow.focus(), PROMPT_HINT_MS);
          return sent.finally(() => clearTimeout(prompt));
        }
      : (m) => browser.runtime.sendMessage(m),
    openPermissionPage: firefox
      ? () => micWindow.focus()
      : async () => {
          await browser.tabs.create({ url: browser.runtime.getURL(MIC_PERMISSION_PATH as '/') });
        },
  });

  const readSubtitles = createOcrHandler({
    ensureOffscreen: firefox ? noOffscreen : ensureOffscreen,
    forward: firefox
      ? (m) => import('./recorder/ocr-engine').then((e) => e.recognize(m.image))
      : (m) => browser.runtime.sendMessage(m),
  });

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    // Only our own content scripts may ask; never answer other extensions.
    if (sender.id !== browser.runtime.id) return undefined;
    // Firefox's mic window says it can record now (checked by its exact page address).
    if (firefox && isMicWindowReady(message) && sender.url === micWindowUrl) {
      micWindow.ready();
      return undefined;
    }
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

  // YouTube tabs open before install or update get the panel without a reload.
  browser.runtime.onInstalled.addListener(({ reason }) => {
    // A fresh install also gets the "how to start" tab (never on updates).
    void openWelcomeOnInstall(reason, (path) =>
      browser.tabs.create({ url: browser.runtime.getURL(path as '/') }),
    );
    if (reason !== 'install' && reason !== 'update') return;
    void addPanelToOpenTabs({
      query: () => browser.tabs.query({ url: YOUTUBE_TABS }),
      async hasPanel(tabId) {
        const [res] = await browser.scripting.executeScript({
          target: { tabId },
          func: hasContentMark,
        });
        return res?.result === true;
      },
      async inject(tabId, file, world) {
        await browser.scripting.executeScript({ target: { tabId }, files: [file], world });
      },
    });
  });

  // Toolbar icon: show or hide the panel in that tab (the content script only runs on youtube.com).
  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    const msg: TogglePanelMessage = { type: TOGGLE_PANEL_MESSAGE };
    browser.tabs.sendMessage(tab.id, msg).catch(() => undefined);
  });
});
