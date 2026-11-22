import { isPeaks, type RecorderAdapter, type Recording } from '@shadow-lingo/core';

/**
 * Shadowing recorder messages. The microphone is only ever opened by the extension's own
 * offscreen document (recorder.html), never by youtube.com: content script → background
 * (REC) → offscreen document (REC_OFFSCREEN). Audio stays in that document's memory.
 */
export const REC = 'shadow-lingo:rec';
export const REC_OFFSCREEN = 'shadow-lingo:rec-offscreen';
export const RECORDER_PATH = '/recorder.html';
export const MIC_PERMISSION_PATH = '/mic-permission.html';

export const REC_ACTIONS = ['start', 'stop', 'play', 'stop-play'] as const;
export type RecAction = (typeof REC_ACTIONS)[number];
export type RecFailure = 'permission' | 'no-device' | 'failed';

export interface RecRequest {
  type: typeof REC;
  action: RecAction;
}

export interface RecOffscreenRequest {
  type: typeof REC_OFFSCREEN;
  action: RecAction;
}

export type RecResponse =
  { ok: true; recording?: Recording | null; played?: boolean } | { ok: false; reason: RecFailure };

const ACTIONS: ReadonlySet<string> = new Set(REC_ACTIONS);
const FAILURES: ReadonlySet<string> = new Set(['permission', 'no-device', 'failed']);
/** A take is at most 30 s; anything longer in a message is malformed. */
const MAX_DURATION_MS = 60_000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function isRecRequest(v: unknown): v is RecRequest {
  return isRecord(v) && v.type === REC && typeof v.action === 'string' && ACTIONS.has(v.action);
}

export function isRecOffscreenRequest(v: unknown): v is RecOffscreenRequest {
  return (
    isRecord(v) && v.type === REC_OFFSCREEN && typeof v.action === 'string' && ACTIONS.has(v.action)
  );
}

export function isRecording(v: unknown): v is Recording {
  return (
    isRecord(v) &&
    typeof v.durationMs === 'number' &&
    Number.isFinite(v.durationMs) &&
    v.durationMs >= 0 &&
    v.durationMs <= MAX_DURATION_MS &&
    isPeaks(v.peaks)
  );
}

export function isRecResponse(v: unknown): v is RecResponse {
  if (!isRecord(v)) return false;
  if (v.ok === false) return typeof v.reason === 'string' && FAILURES.has(v.reason);
  if (v.ok !== true) return false;
  if (v.recording !== undefined && v.recording !== null && !isRecording(v.recording)) return false;
  return v.played === undefined || typeof v.played === 'boolean';
}

/** Maps a getUserMedia / MediaRecorder error to what the panel tells the learner. */
export function failureOf(err: unknown): RecFailure {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError')
    return 'no-device';
  return 'failed';
}

export interface RecHandlerDeps {
  /** Creates the offscreen document if it is not open yet. */
  ensureOffscreen(): Promise<void>;
  forward(message: RecOffscreenRequest): Promise<unknown>;
  /** Opens the extension page that asks for the microphone once. */
  openPermissionPage(): Promise<void>;
}

/** Background side: forwards to the offscreen document and checks what comes back. */
export function createRecHandler(deps: RecHandlerDeps) {
  return async (req: RecRequest): Promise<RecResponse> => {
    try {
      await deps.ensureOffscreen();
      const res = await deps.forward({ type: REC_OFFSCREEN, action: req.action });
      if (!isRecResponse(res)) return { ok: false, reason: 'failed' };
      if (!res.ok && res.reason === 'permission') await deps.openPermissionPage();
      return res;
    } catch {
      return { ok: false, reason: 'failed' };
    }
  };
}

type Send = (message: RecRequest) => Promise<unknown>;

/** Content side: the panel's RecorderAdapter, over runtime messages. */
export function createRuntimeRecorder(send: Send): RecorderAdapter {
  const ask = async (action: RecAction): Promise<RecResponse> => {
    try {
      const res = await send({ type: REC, action });
      return isRecResponse(res) ? res : { ok: false, reason: 'failed' };
    } catch {
      return { ok: false, reason: 'failed' };
    }
  };
  return {
    async start() {
      const res = await ask('start');
      return res.ok ? { ok: true } : { ok: false, reason: res.reason };
    },
    async stop() {
      const res = await ask('stop');
      return res.ok ? (res.recording ?? null) : null;
    },
    async play() {
      const res = await ask('play');
      return res.ok && res.played === true;
    },
    async stopPlayback() {
      await ask('stop-play');
    },
  };
}
