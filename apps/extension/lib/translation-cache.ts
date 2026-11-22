import type { Translation, TranslationCache, TranslationSource } from '@shadow-lingo/core';

/**
 * Vietnamese lines kept on the device, in the extension's own IndexedDB (in the
 * background, never in youtube.com's storage). Content scripts reach it by message.
 */
export const TR_GET = 'shadow-lingo:tr-get';
export const TR_PUT = 'shadow-lingo:tr-put';

export const MAX_GET_HASHES = 5000;
export const MAX_PUT_ENTRIES = 50;
export const MAX_VI_LENGTH = 2000;

export interface TrGetRequest {
  type: typeof TR_GET;
  videoId: string;
  hashes: string[];
}

export interface TrPutRequest {
  type: typeof TR_PUT;
  videoId: string;
  entries: Record<string, Translation>;
}

export type TrGetResponse = { ok: true; result: Record<string, Translation> } | { ok: false };

const SOURCES: ReadonlySet<string> = new Set<TranslationSource>(['machine', 'human', 'edited']);
const VIDEO_ID = /^[\w-]{1,64}$/;
const HASH = /^[0-9a-f]{8}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function isTranslation(v: unknown): v is Translation {
  return (
    isRecord(v) &&
    typeof v.vi === 'string' &&
    v.vi.length > 0 &&
    v.vi.length <= MAX_VI_LENGTH &&
    typeof v.source === 'string' &&
    SOURCES.has(v.source)
  );
}

export function isTrGetRequest(v: unknown): v is TrGetRequest {
  return (
    isRecord(v) &&
    v.type === TR_GET &&
    typeof v.videoId === 'string' &&
    VIDEO_ID.test(v.videoId) &&
    Array.isArray(v.hashes) &&
    v.hashes.length <= MAX_GET_HASHES &&
    v.hashes.every((h) => typeof h === 'string' && HASH.test(h))
  );
}

export function isTrPutRequest(v: unknown): v is TrPutRequest {
  if (!isRecord(v) || v.type !== TR_PUT || typeof v.videoId !== 'string') return false;
  if (!VIDEO_ID.test(v.videoId) || !isRecord(v.entries)) return false;
  const entries = Object.entries(v.entries);
  return (
    entries.length <= MAX_PUT_ENTRIES && entries.every(([h, t]) => HASH.test(h) && isTranslation(t))
  );
}

function isGetResponse(v: unknown): v is TrGetResponse {
  if (!isRecord(v)) return false;
  if (v.ok === false) return true;
  return v.ok === true && isRecord(v.result) && Object.values(v.result).every(isTranslation);
}

/** Background side: answers the content script's requests. */
export function createTranslationCacheHandler(cache: TranslationCache) {
  return {
    async get(req: TrGetRequest): Promise<TrGetResponse> {
      try {
        return { ok: true, result: await cache.get(req.videoId, req.hashes) };
      } catch {
        return { ok: false };
      }
    },
    async put(req: TrPutRequest): Promise<{ ok: boolean }> {
      try {
        await cache.put(req.videoId, req.entries);
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
  };
}

type Send = (message: TrGetRequest | TrPutRequest) => Promise<unknown>;

/** Content side: the panel's TranslationCache, over runtime messages. */
export function createRuntimeTranslationCache(send: Send): TranslationCache {
  return {
    async get(videoId, hashes) {
      if (!VIDEO_ID.test(videoId)) return {};
      const out: Record<string, Translation> = {};
      for (let i = 0; i < hashes.length; i += MAX_GET_HASHES) {
        const res = await send({
          type: TR_GET,
          videoId,
          hashes: hashes.slice(i, i + MAX_GET_HASHES),
        });
        if (!isGetResponse(res) || !res.ok) throw new Error('translation cache failed');
        Object.assign(out, res.result);
      }
      return out;
    },
    async put(videoId, entries) {
      // Pasted transcripts have no video id: nothing to key them by, keep them in memory only.
      if (!VIDEO_ID.test(videoId)) return;
      const list = Object.entries(entries).filter(([h, t]) => HASH.test(h) && isTranslation(t));
      for (let i = 0; i < list.length; i += MAX_PUT_ENTRIES) {
        await send({
          type: TR_PUT,
          videoId,
          entries: Object.fromEntries(list.slice(i, i + MAX_PUT_ENTRIES)),
        });
      }
    },
  };
}
