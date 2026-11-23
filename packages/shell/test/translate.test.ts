import { describe, expect, it } from 'vitest';
import { createOfflineTranslator, type WorkerLike } from '../src/translate/adapter';
import { isWorkerReply, MAX_CHARS, type WorkerRequest } from '../src/translate/protocol';

const BASE = 'https://hoangtularva.github.io/shadow-lingo/app/';

/** A worker that answers like the real one: load once, then "translate". */
function fakeWorker(opts: { failLoads?: number } = {}) {
  let failLoads = opts.failLoads ?? 0;
  const seen: WorkerRequest[] = [];
  let listener: ((e: MessageEvent) => void) | null = null;
  let created = 0;
  const create = (): WorkerLike => {
    created += 1;
    return {
      postMessage(message) {
        const req = message as WorkerRequest;
        seen.push(req);
        const reply =
          req.kind === 'load'
            ? failLoads-- > 0
              ? { id: req.id, ok: false }
              : { id: req.id, ok: true }
            : { id: req.id, ok: true, vi: `VI(${req.text})` };
        queueMicrotask(() => listener?.({ data: reply } as MessageEvent));
      },
      addEventListener(_type, l) {
        listener = l;
      },
      terminate() {},
    };
  };
  return { create, seen, created: () => created };
}

describe('offline translator', () => {
  it('is ready when the build has the model, and translates in the worker', async () => {
    const w = fakeWorker();
    const t = createOfflineTranslator({
      base: BASE,
      createWorker: w.create,
      hasModel: () => Promise.resolve(true),
    });
    expect(await t.state()).toBe('ready');
    const progress: number[] = [];
    expect(await t.prepare((p) => progress.push(p))).toBe(true);
    expect(progress).toEqual([1]);
    expect(await t.translate('Hello there.')).toBe('VI(Hello there.)');
    expect(await t.translate('Again.')).toBe('VI(Again.)');
    // One worker, one model load, every request carries the app address.
    expect(w.created()).toBe(1);
    expect(w.seen.filter((r) => r.kind === 'load')).toHaveLength(1);
    expect(w.seen.every((r) => r.base === BASE)).toBe(true);
  });

  it('says unsupported without the model and never starts a worker', async () => {
    const w = fakeWorker();
    const t = createOfflineTranslator({
      base: BASE,
      createWorker: w.create,
      hasModel: () => Promise.resolve(false),
    });
    expect(await t.state()).toBe('unsupported');
    expect(await t.prepare()).toBe(false);
    expect(w.created()).toBe(0);
  });

  it('retries loading after a failure', async () => {
    const w = fakeWorker({ failLoads: 1 });
    const t = createOfflineTranslator({
      base: BASE,
      createWorker: w.create,
      hasModel: () => Promise.resolve(true),
    });
    await expect(t.translate('Hi.')).rejects.toThrow();
    expect(await t.translate('Hi.')).toBe('VI(Hi.)');
  });

  it('accepts only well-formed worker replies', () => {
    expect(isWorkerReply({ id: 1, ok: true, vi: 'xin chào' })).toBe(true);
    expect(isWorkerReply({ id: 1, ok: false })).toBe(true);
    expect(isWorkerReply({ id: '1', ok: true })).toBe(false);
    expect(isWorkerReply({ id: 1, ok: true, vi: 3 })).toBe(false);
    expect(isWorkerReply(null)).toBe(false);
    expect(MAX_CHARS).toBeGreaterThan(200);
  });
});
