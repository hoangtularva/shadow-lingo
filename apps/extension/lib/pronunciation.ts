import {
  isPhone,
  normalizeWord,
  parseCmuDict,
  type PronunciationAdapter,
  type PronunciationDict,
  type Pronunciations,
} from '@shadow-lingo/core';

/** Content script → background: look up word keys in the bundled CMU Dict. */
export const IPA_LOOKUP = 'shadow-lingo:ipa-lookup';
/** Path of the generated dictionary inside the extension package. */
export const DICT_PATH = '/ipa/cmudict.txt';
/** Upper bound per request; the panel batches below this. */
export const MAX_KEYS = 5000;

export interface IpaLookupRequest {
  type: typeof IPA_LOOKUP;
  keys: string[];
}

export type IpaLookupResponse =
  { ok: true; result: Record<string, Pronunciations | null> } | { ok: false };

export function isIpaLookupRequest(v: unknown): v is IpaLookupRequest {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    r.type === IPA_LOOKUP &&
    Array.isArray(r.keys) &&
    r.keys.length <= MAX_KEYS &&
    r.keys.every((k) => typeof k === 'string' && k.length > 0 && k.length <= 64)
  );
}

function isPronunciations(v: unknown): v is Pronunciations {
  return (
    Array.isArray(v) &&
    v.every((p) => Array.isArray(p) && p.every((ph) => typeof ph === 'string' && isPhone(ph)))
  );
}

function isLookupResponse(v: unknown): v is IpaLookupResponse {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (r.ok === false) return true;
  if (r.ok !== true || typeof r.result !== 'object' || r.result === null) return false;
  return Object.values(r.result).every((p) => p === null || isPronunciations(p));
}

/**
 * Background side: loads the dictionary once per service-worker lifetime and answers
 * lookups. `load` fetches the data file; injected for tests.
 */
export function createLookupHandler(load: () => Promise<string>) {
  let dict: Promise<PronunciationDict> | null = null;
  return async (req: IpaLookupRequest): Promise<IpaLookupResponse> => {
    try {
      dict ??= load().then(parseCmuDict);
      const d = await dict;
      const result: Record<string, Pronunciations | null> = {};
      for (const k of req.keys) result[k] = d.lookup(k);
      return { ok: true, result };
    } catch {
      dict = null; // retry on the next request
      return { ok: false };
    }
  };
}

type Send = (message: IpaLookupRequest) => Promise<unknown>;

/** Content side: asks the background, caching every answer for the page's lifetime. */
export function createRuntimePronunciation(send: Send): PronunciationAdapter {
  const cache = new Map<string, Pronunciations | null>();
  return {
    async lookup(keys) {
      const missing = [...new Set(keys.map(normalizeWord).filter(Boolean))].filter(
        (k) => !cache.has(k),
      );
      for (let i = 0; i < missing.length; i += MAX_KEYS) {
        const chunk = missing.slice(i, i + MAX_KEYS);
        const res = await send({ type: IPA_LOOKUP, keys: chunk });
        if (!isLookupResponse(res) || !res.ok) throw new Error('IPA lookup failed');
        for (const k of chunk) cache.set(k, res.result[k] ?? null);
      }
      const out: Record<string, Pronunciations | null> = {};
      for (const k of keys) out[k] = cache.get(normalizeWord(k)) ?? null;
      return out;
    },
  };
}
