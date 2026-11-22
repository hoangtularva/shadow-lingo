// Bundled into the script: no runtime fetch of an extension URL from the page.
import panelCss from '@/entrypoints/content/style.css?inline';
import { buildFontFaceCss } from '@shadow-lingo/core';
import { createPanelStore, vi, type Theme } from '@shadow-lingo/core/panel';
import { createRoot, type Root } from 'react-dom/client';
import { PanelFrame } from '@/components/PanelFrame';
import { TheaterBar } from '@/components/TheaterBar';
import { createYouTubeCaptions } from '@/lib/captions';
import { CaptionCollector } from '@/lib/collector';
import {
  REPLAY_MESSAGE,
  isCaptionMessage,
  isTogglePanelMessage,
  type ReplayMessage,
} from '@/lib/messages';
import { PLAYER_SELECTOR, createYouTubePlayer } from '@/lib/player';
import { createRuntimePos } from '@/lib/pos';
import { createRuntimePronunciation } from '@/lib/pronunciation';
import { createRuntimeRecorder } from '@/lib/recorder';
import { createRuntimeTranslationCache } from '@/lib/translation-cache';
import { createRuntimeDictionary } from '@/lib/dictionary';
import { createRuntimeVocabStore } from '@/lib/vocab';
import { createYouTubeAds } from '@/lib/ads';
import { createChromeTranslation } from '@/lib/translator';
import { createExtensionStorage } from '@/lib/storage';
import { videoIdFromLocation } from '@/lib/timedtext';

const ANCHOR_SELECTORS = [
  'ytd-watch-flexy #secondary-inner',
  'ytd-watch-flexy #secondary',
  '#secondary',
];
const FONT_STYLE_ID = 'shadow-lingo-fonts';

function findAnchor(): Element | null {
  for (const sel of ANCHOR_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function pageTheme(): Theme {
  return document.documentElement.hasAttribute('dark') ? 'dark' : 'light';
}

/** @font-face is ignored inside shadow roots, so fonts are declared on the page. */
function injectFonts(): void {
  if (document.getElementById(FONT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = FONT_STYLE_ID;
  style.textContent = buildFontFaceCss((file) => browser.runtime.getURL(`/fonts/${file}` as '/'));
  (document.head ?? document.documentElement).append(style);
}

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'manual',
  async main(ctx) {
    injectFonts();
    const store = createPanelStore({ theme: pageTheme() });
    // Follow YouTube's theme (html[dark]); set up before any await so no change is missed.
    const themeObserver = new MutationObserver(() => store.getState().setTheme(pageTheme()));
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['dark'],
    });
    ctx.onInvalidated(() => themeObserver.disconnect());
    const collector = new CaptionCollector();
    const player = createYouTubePlayer(document);
    const storage = createExtensionStorage(browser.storage.local);
    // After the extension is reloaded or updated, this old script can no longer reach the
    // background: say so plainly instead of reporting each feature as broken.
    const updatedNotice = () => store.getState().setNotice(vi.extensionUpdated);
    ctx.onInvalidated(updatedNotice);
    const send = <T,>(message: T): Promise<unknown> => {
      if (ctx.isInvalid) {
        updatedNotice();
        return Promise.reject(new Error('extension context invalidated'));
      }
      return browser.runtime.sendMessage(message).catch((err: unknown) => {
        if (ctx.isInvalid || !browser.runtime?.id) updatedNotice();
        throw err;
      });
    };
    // The dictionary lives in the background; the content script only asks for words.
    const pronunciation = createRuntimePronunciation(send);
    const pos = createRuntimePos(send);
    // The microphone is opened by the extension's offscreen page, never by youtube.com.
    const recorder = createRuntimeRecorder(send);
    const captions = createYouTubeCaptions(document);
    // Chrome's on-device translator; captions are never sent to any server.
    const translation = createChromeTranslation();
    const translationCache = createRuntimeTranslationCache(send);
    const dictionary = createRuntimeDictionary(send);
    const vocab = createRuntimeVocabStore(send);
    const ads = createYouTubeAds(document);
    // Saved with each word in the notebook (on this device only).
    const getVideoTitle = () =>
      document.querySelector('ytd-watch-metadata h1')?.textContent?.trim() ||
      document.title.replace(/ - YouTube$/, '').trim();
    const getPlayerRect = () => {
      const el = document.querySelector(PLAYER_SELECTOR);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    };

    const onPlayerResize = (cb: () => void) => {
      const el = document.querySelector(PLAYER_SELECTOR);
      if (!el) return () => undefined;
      const ro = new ResizeObserver(() => cb());
      ro.observe(el);
      return () => ro.disconnect();
    };

    const ui = await createShadowRootUi<Root>(ctx, {
      name: 'shadow-lingo-panel',
      position: 'inline',
      anchor: findAnchor,
      append: 'first',
      isolateEvents: true,
      // Our own reset (style.css) replaces WXT's !important one, which blocks positioning.
      inheritStyles: true,
      css: panelCss,
      onMount(container, _shadow, host) {
        const root = createRoot(container);
        root.render(
          <PanelFrame
            store={store}
            player={player}
            storage={storage}
            host={host}
            getPlayerRect={getPlayerRect}
            pronunciation={pronunciation}
            pos={pos}
            recorder={recorder}
            captions={captions}
            translation={translation}
            translationCache={translationCache}
            dictionary={dictionary}
            vocab={vocab}
            getVideoTitle={getVideoTitle}
            ads={ads}
            onPlayerResize={onPlayerResize}
          />,
        );
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    // Theater mode: the spoken sentence as a bar over the top edge of the video.
    const bar = await createShadowRootUi<Root>(ctx, {
      name: 'shadow-lingo-bar',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      isolateEvents: true,
      inheritStyles: true,
      css: panelCss,
      onMount(container, _shadow, host) {
        const root = createRoot(container);
        root.render(
          <TheaterBar
            store={store}
            host={host}
            getPlayerRect={getPlayerRect}
            isTheater={() => document.querySelector('ytd-watch-flexy[theater]') !== null}
            isAdShowing={() => document.querySelector(`${PLAYER_SELECTOR}.ad-showing`) !== null}
            onAdChange={(l) => ads.onChange(l)}
            onPlayerResize={onPlayerResize}
          />,
        );
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    bar.mount();

    const isMounted = () => ui.mounted !== undefined && ui.shadowHost.isConnected;

    // YouTube renders #secondary lazily; mount once it exists.
    let waiting: MutationObserver | null = null;
    const ensureMounted = () => {
      if (isMounted() || waiting) return;
      const tryMount = () => {
        if (!findAnchor()) return false;
        if (ui.mounted !== undefined) ui.remove();
        ui.mount();
        return true;
      };
      if (tryMount()) return;
      waiting = new MutationObserver(() => {
        if (tryMount()) {
          waiting?.disconnect();
          waiting = null;
        }
      });
      waiting.observe(document.documentElement, { childList: true, subtree: true });
    };

    const syncVideo = () => {
      const videoId = videoIdFromLocation(location.href);
      collector.setVideo(videoId);
      store.getState().setVideo(videoId);
      if (!videoId) {
        waiting?.disconnect();
        waiting = null;
        if (ui.mounted !== undefined) ui.remove();
        return;
      }
      ensureMounted();
      const current = store.getState().track;
      const best = collector.preferred();
      if (best && !current) store.getState().setTrack(best);
      store.getState().setHumanCues(collector.vietnameseCues());
    };

    const onMessage = (e: MessageEvent<unknown>) => {
      if (e.origin !== location.origin || !isCaptionMessage(e.data)) return;
      // The URL may lag behind the player during SPA navigation: re-read it first.
      syncVideo();
      const best = collector.add(e.data);
      const current = store.getState().track;
      if (best && best !== current && (!current || current.source === 'player')) {
        store.getState().setTrack(best);
      }
      store.getState().setHumanCues(collector.vietnameseCues());
    };
    window.addEventListener('message', onMessage);

    // Toolbar icon click (via the background): reopen a closed panel, or close it.
    const onRuntimeMessage = (message: unknown, sender: { id?: string }) => {
      if (sender.id !== browser.runtime.id || !isTogglePanelMessage(message)) return undefined;
      const s = store.getState();
      s.setHidden(!s.hidden);
      if (s.hidden) ensureMounted();
      return undefined;
    };
    browser.runtime.onMessage.addListener(onRuntimeMessage);
    ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(onRuntimeMessage));
    ctx.onInvalidated(() => window.removeEventListener('message', onMessage));

    document.addEventListener('yt-navigate-finish', syncVideo);
    ctx.onInvalidated(() => document.removeEventListener('yt-navigate-finish', syncVideo));
    ctx.addEventListener(window, 'wxt:locationchange', syncVideo);

    ctx.onInvalidated(() => waiting?.disconnect());

    // The theme may have changed while the UI CSS was loading.
    store.getState().setTheme(pageTheme());
    syncVideo();
    // Ask the MAIN-world hook for captions it saw before this script loaded.
    const replay: ReplayMessage = { source: REPLAY_MESSAGE };
    window.postMessage(replay, location.origin);
  },
});
