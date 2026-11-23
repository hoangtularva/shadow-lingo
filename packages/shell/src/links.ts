/** Links the apps may open outside themselves (system browser or the YouTube app). */
const EXTERNAL_HOSTS = [
  'www.youtube.com',
  'youtube.com',
  'm.youtube.com',
  'youtu.be',
  'dictionary.cambridge.org',
  'github.com',
  'en.wiktionary.org',
];

export function isExternalLink(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.protocol === 'https:' && EXTERNAL_HOSTS.includes(u.hostname);
}
