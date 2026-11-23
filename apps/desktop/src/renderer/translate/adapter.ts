import type { TranslationAdapter, TranslatorState } from '@shadow-lingo/core';
import { isWorkerReply, MODEL_PROBE, type WorkerReply } from './protocol';

/** The bits of a Worker the adapter uses (a fake one in tests). */
export interface WorkerLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (e: MessageEvent) => void): void;
  terminate(): void;
}

export interface OfflineTranslatorOptions {
  /** Address of the app pages; the model and runtime files live under it. */
  base: string;
  createWorker: () => WorkerLike;
  /** True when the model files are in this build. */
  hasModel?: () => Promise<boolean>;
}

/**
 * English → Vietnamese with the model shipped inside the app (OPUS-MT en-vi). Runs in a worker
 * on this device; captions never leave it. Nothing to download: state is "ready" when the
 * build has the model, and the model loads on first use.
 */
export function createOfflineTranslator(options: OfflineTranslatorOptions): TranslationAdapter {
  const { base, createWorker } = options;
  const hasModel =
    options.hasModel ??
    (() =>
      fetch(new URL(MODEL_PROBE, base))
        .then((r) => r.ok)
        .catch(() => false));
  let worker: WorkerLike | null = null;
  let nextId = 1;
  const waiting = new Map<number, (reply: WorkerReply) => void>();
  let present: Promise<boolean> | null = null;
  let loaded: Promise<boolean> | null = null;

  const send = (msg: { kind: 'load' } | { kind: 'translate'; text: string }) => {
    if (!worker) {
      worker = createWorker();
      worker.addEventListener('message', (e) => {
        if (!isWorkerReply(e.data)) return;
        const done = waiting.get(e.data.id);
        waiting.delete(e.data.id);
        done?.(e.data);
      });
    }
    const id = nextId++;
    const reply = new Promise<WorkerReply>((resolve) => waiting.set(id, resolve));
    worker.postMessage({ ...msg, id, base });
    return reply;
  };

  const load = () => {
    loaded ??= send({ kind: 'load' }).then((r) => {
      if (!r.ok) loaded = null;
      return r.ok;
    });
    return loaded;
  };

  const state = async (): Promise<TranslatorState> => {
    present ??= hasModel();
    return (await present) ? 'ready' : 'unsupported';
  };

  return {
    state,
    async prepare(onProgress) {
      if ((await state()) !== 'ready') return false;
      const ok = await load();
      if (ok) onProgress?.(1);
      return ok;
    },
    async translate(text) {
      if (!(await load())) throw new Error('translator not available');
      const reply = await send({ kind: 'translate', text });
      if (!reply.ok || reply.vi === undefined) throw new Error('translation failed');
      return reply.vi;
    },
  };
}
