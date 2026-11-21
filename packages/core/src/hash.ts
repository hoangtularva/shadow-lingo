/** 32-bit FNV-1a hash as an 8-char hex string. Not cryptographic; used for cache keys. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Normalizes a sentence for hashing: lowercase, single spaces, trimmed. */
export function normalizeForHash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function sentenceHash(text: string): string {
  return fnv1a(normalizeForHash(text));
}
