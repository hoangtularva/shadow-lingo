/** Messages between the panel and the translation worker. */
export type WorkerRequest =
  | { id: number; kind: 'load'; base: string }
  | { id: number; kind: 'translate'; base: string; text: string };

export type WorkerReply = { id: number; ok: true; vi?: string } | { id: number; ok: false };

/** Where the bundled model lives, relative to the app pages. */
export const MODEL_NAME = 'opus-mt-en-vi';
export const MODEL_PROBE = `models/${MODEL_NAME}/config.json`;

/** Longest sentence sent to the model; longer ones are cut (the model handles ~512 tokens). */
export const MAX_CHARS = 1000;

export function isWorkerReply(v: unknown): v is WorkerReply {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== 'number' || typeof r.ok !== 'boolean') return false;
  return r.vi === undefined || typeof r.vi === 'string';
}
