import { PARTS_OF_SPEECH, type PartOfSpeech, type PosAdapter } from '@shadow-lingo/core';

/** Content script → background: tag sentences with parts of speech. */
export const POS_TAG = 'shadow-lingo:pos-tag';
/** Bounds per request; the panel asks for a few sentences at a time. */
export const MAX_SENTENCES = 20;
export const MAX_SENTENCE_LENGTH = 1000;

export interface PosTagRequest {
  type: typeof POS_TAG;
  sentences: string[];
}

export type PosTagResponse =
  { ok: true; result: Record<string, (PartOfSpeech | null)[]> } | { ok: false };

const POS_SET: ReadonlySet<string> = new Set(PARTS_OF_SPEECH);

export function isPosTagRequest(v: unknown): v is PosTagRequest {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    r.type === POS_TAG &&
    Array.isArray(r.sentences) &&
    r.sentences.length <= MAX_SENTENCES &&
    r.sentences.every((s) => typeof s === 'string' && s.length <= MAX_SENTENCE_LENGTH)
  );
}

function isTagList(v: unknown): v is (PartOfSpeech | null)[] {
  return (
    Array.isArray(v) && v.every((p) => p === null || (typeof p === 'string' && POS_SET.has(p)))
  );
}

function isTagResponse(v: unknown): v is PosTagResponse {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (r.ok === false) return true;
  if (r.ok !== true || typeof r.result !== 'object' || r.result === null) return false;
  return Object.values(r.result).every(isTagList);
}

/** Background side: runs the tagger (injected so tests need no NLP library). */
export function createPosHandler(tag: (text: string) => (PartOfSpeech | null)[]) {
  return (req: PosTagRequest): PosTagResponse => {
    try {
      const result: Record<string, (PartOfSpeech | null)[]> = {};
      for (const s of req.sentences) result[s] = tag(s);
      return { ok: true, result };
    } catch {
      return { ok: false };
    }
  };
}

type Send = (message: PosTagRequest) => Promise<unknown>;

/** Content side: asks the background, caching every sentence for the page's lifetime. */
export function createRuntimePos(send: Send): PosAdapter {
  const cache = new Map<string, (PartOfSpeech | null)[]>();
  return {
    async tag(sentences) {
      const missing = [...new Set(sentences)].filter(
        (s) => !cache.has(s) && s.length <= MAX_SENTENCE_LENGTH,
      );
      for (let i = 0; i < missing.length; i += MAX_SENTENCES) {
        const chunk = missing.slice(i, i + MAX_SENTENCES);
        const res = await send({ type: POS_TAG, sentences: chunk });
        if (!isTagResponse(res) || !res.ok) throw new Error('POS tagging failed');
        for (const s of chunk) cache.set(s, res.result[s] ?? []);
      }
      const out: Record<string, (PartOfSpeech | null)[]> = {};
      for (const s of sentences) {
        const tags = cache.get(s);
        if (tags) out[s] = tags;
      }
      return out;
    },
  };
}
