/** Welcome page: loads the bundled fonts and drops copy that does not apply to this browser. */
import { buildFontFaceCss } from '@shadow-lingo/core';

const fonts = document.createElement('style');
fonts.textContent = buildFontFaceCss((file) => browser.runtime.getURL(`/fonts/${file}` as '/'));
document.head.append(fonts);

// Firefox has no built-in translator for extensions: no language pack to download there.
if (import.meta.env.FIREFOX) {
  document.querySelector('[data-testid="sl-welcome-translator"]')?.remove();
}
