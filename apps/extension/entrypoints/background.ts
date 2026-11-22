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
});
