import '@/entrypoints/content/style.css';
import { buildFontFaceCss } from '@shadow-lingo/core';
import { createPanelStore, type Theme } from '@shadow-lingo/core/panel';
import { createRoot, type Root } from 'react-dom/client';
import { PanelFrame } from '@/components/PanelFrame';
import { CaptionCollector } from '@/lib/collector';
import { REPLAY_MESSAGE, isCaptionMessage, type ReplayMessage } from '@/lib/messages';
import { PLAYER_SELECTOR, createYouTubePlayer } from '@/lib/player';
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
  cssInjectionMode: 'ui',
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
    const getPlayerRect = () => {
      const el = document.querySelector(PLAYER_SELECTOR);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    };

    const ui = await createShadowRootUi<Root>(ctx, {
      name: 'shadow-lingo-panel',
      position: 'inline',
      anchor: findAnchor,
      append: 'first',
      isolateEvents: true,
      onMount(container, _shadow, host) {
        const root = createRoot(container);
        root.render(
          <PanelFrame
            store={store}
            player={player}
            storage={storage}
            host={host}
            getPlayerRect={getPlayerRect}
          />,
        );
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

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
    };
    window.addEventListener('message', onMessage);
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
