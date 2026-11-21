const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

function fromCodePoint(code: number, fallback: string): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return fallback;
  return String.fromCodePoint(code);
}

/** Decodes the HTML entities that show up in caption files. Output is plain text. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    const lower = name.toLowerCase();
    if (lower.startsWith('#x')) return fromCodePoint(parseInt(lower.slice(2), 16), match);
    if (lower.startsWith('#')) return fromCodePoint(parseInt(lower.slice(1), 10), match);
    return ENTITIES[lower] ?? match;
  });
}

/** Removes markup such as <i>, <c.color>, <00:00:01.000> and {\an8}. Never parses HTML. */
export function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '');
}

/** Strips tags, decodes entities and collapses whitespace (including line breaks). */
export function cleanText(text: string): string {
  return decodeEntities(stripTags(text)).replace(/\s+/g, ' ').trim();
}

/**
 * Parses "hh:mm:ss.mmm", "mm:ss.mmm", "hh:mm:ss,mmm", "m:ss" or "h:mm:ss" into milliseconds.
 * Returns NaN when the input is not a timestamp.
 */
export function parseTimestamp(raw: string): number {
  const m = /^(?:(\d+):)?(\d{1,3}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(raw.trim());
  if (!m) return NaN;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2]);
  const s = Number(m[3]);
  const ms = Number((m[4] ?? '0').padEnd(3, '0'));
  if (s > 59 || (m[1] !== undefined && min > 59)) return NaN;
  return ((h * 60 + min) * 60 + s) * 1000 + ms;
}

/** Formats milliseconds as m:ss or h:mm:ss for display. */
export function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
