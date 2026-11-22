import {
  isDictPos,
  type DictEntry,
  type DictionaryAdapter,
  type WordLookup,
} from '@shadow-lingo/core';

/** Content script → background: look a clicked word up in its sentence. */
export const DICT_LOOKUP = 'shadow-lingo:dict-lookup';
/** Shards of the bundled Wiktionary definitions inside the extension package. */
export const DICT_DIR = '/dict';
export const MAX_WORDS = 80;
const MAX_WORD_LENGTH = 64;
const SHARD = /^[a-z_]$/;

export interface DictLookupRequest {
  type: typeof DICT_LOOKUP;
  words: string[];
  index: number;
}

export type DictLookupResponse = { ok: true; result: WordLookup | null } | { ok: false };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function isDictLookupRequest(v: unknown): v is DictLookupRequest {
  return (
    isRecord(v) &&
    v.type === DICT_LOOKUP &&
    Array.isArray(v.words) &&
    v.words.length > 0 &&
    v.words.length <= MAX_WORDS &&
    v.words.every((w) => typeof w === 'string' && w.length <= MAX_WORD_LENGTH) &&
    typeof v.index === 'number' &&
    Number.isInteger(v.index) &&
    v.index >= 0 &&
    v.index < v.words.length
  );
}

const isString = (v: unknown): v is string => typeof v === 'string';

function isEntry(v: unknown): v is DictEntry {
  return (
    isRecord(v) &&
    isString(v.headword) &&
    (v.lemma === undefined || isString(v.lemma)) &&
    Array.isArray(v.vi) &&
    v.vi.every(isString) &&
    Array.isArray(v.senses) &&
    v.senses.every(
      (s) =>
        isRecord(s) &&
        isDictPos(s.pos) &&
        isString(s.gloss) &&
        (s.example === undefined || isString(s.example)),
    )
  );
}

function isLookupResponse(v: unknown): v is DictLookupResponse {
  if (!isRecord(v)) return false;
  if (v.ok === false) return true;
  if (v.ok !== true) return false;
  if (v.result === null) return true;
  const r = v.result;
  return (
    isRecord(r) &&
    Array.isArray(r.words) &&
    r.words.every((i) => Number.isInteger(i)) &&
    isEntry(r.entry)
  );
}

/** The URL path of one shard, or null for a name that is not a shard. */
export function shardPath(name: string): string | null {
  return SHARD.test(name) ? `${DICT_DIR}/${name}.txt` : null;
}

/** Background side: answers lookups from the dictionary. */
export function createDictHandler(dict: DictionaryAdapter) {
  return async (req: DictLookupRequest): Promise<DictLookupResponse> => {
    try {
      return { ok: true, result: await dict.lookup(req.words, req.index) };
    } catch {
      return { ok: false };
    }
  };
}

type Send = (message: DictLookupRequest) => Promise<unknown>;

/** Content side: the panel's DictionaryAdapter, over runtime messages. */
export function createRuntimeDictionary(send: Send): DictionaryAdapter {
  return {
    async lookup(words, index) {
      // Long sentences: send the words around the click only.
      const from = Math.max(0, Math.min(index - MAX_WORDS / 2, words.length - MAX_WORDS));
      const slice = words.slice(from, from + MAX_WORDS).map((w) => w.slice(0, MAX_WORD_LENGTH));
      const res = await send({ type: DICT_LOOKUP, words: slice, index: index - from });
      if (!isLookupResponse(res) || !res.ok) throw new Error('dictionary lookup failed');
      if (!res.result) return null;
      return { ...res.result, words: res.result.words.map((i) => i + from) };
    },
  };
}
