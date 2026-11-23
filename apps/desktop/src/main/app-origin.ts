import { normalize, sep } from 'node:path';

/**
 * The app's pages are served at the project's own site address (intercepted locally, never
 * fetched), so the YouTube embed gets a real https origin and Referer, as the YouTube API
 * terms require for embedded players.
 */
export const APP_ORIGIN = 'https://hoangtularva.github.io';
export const APP_BASE = `${APP_ORIGIN}/shadow-lingo/app/`;

/**
 * The file under `root` for an app URL, or null when the URL is not an app page or tries
 * to leave the folder ("../").
 */
export function appFile(url: string, root: string): string | null {
  if (!url.startsWith(APP_BASE)) return null;
  let path: string;
  try {
    path = decodeURIComponent(new URL(url).pathname.slice(new URL(APP_BASE).pathname.length));
  } catch {
    return null;
  }
  if (path === '' || path.endsWith('/')) path += 'index.html';
  const full = normalize(`${root}${sep}${path}`);
  const base = normalize(root.endsWith(sep) ? root : root + sep);
  return full.startsWith(base) ? full : null;
}

export { isExternalLink } from '@shadow-lingo/shell/links';
