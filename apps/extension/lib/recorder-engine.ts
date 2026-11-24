/**
 * Records the learner's voice for shadowing (only the last take is kept, in memory; it is
 * never stored or sent anywhere). Runs in an extension page: the offscreen document on Chrome,
 * the small mic window on Firefox (which gives no microphone to its background page).
 */
import { MAX_RECORDING_MS, computePeaks, type Recording } from '@shadow-lingo/core';
import { failureOf, type RecAction, type RecResponse } from '@/lib/recorder';

interface Active {
  stream: MediaStream;
  recorder: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
  stopped: Promise<void>;
  timer: ReturnType<typeof setTimeout>;
}

/** Where a take's microphone stream comes from, and what happens to it after the take. */
export interface MicSource {
  open(): Promise<MediaStream>;
  release(stream: MediaStream): void;
}

const CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true },
};

/** Chrome: a new stream for every take, closed right after it. */
export const perTakeMic: MicSource = {
  open: () => navigator.mediaDevices.getUserMedia(CONSTRAINTS),
  release(stream) {
    for (const t of stream.getTracks()) t.stop();
  },
};

/**
 * Firefox: one stream, opened while the mic window has focus and kept for the window's life.
 * Firefox answers a page's microphone request only once that page's window is focused, even
 * with the permission remembered, so a new request per take would wait behind the YouTube
 * window. Between takes the track is disabled (Firefox turns the device off meanwhile).
 */
export interface HeldMic extends MicSource {
  /** Opens the stream ahead of the first take and leaves it switched off. */
  warm(): Promise<void>;
}

export function createHeldMic(
  getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream> = (c) =>
    navigator.mediaDevices.getUserMedia(c),
): HeldMic {
  let stream: MediaStream | null = null;
  let opening: Promise<MediaStream> | null = null;
  let inUse = false;
  const enable = (s: MediaStream, on: boolean) => {
    for (const t of s.getAudioTracks()) t.enabled = on;
  };
  const acquire = async (): Promise<MediaStream> => {
    if (stream?.getAudioTracks().some((t) => t.readyState === 'live')) return stream;
    opening ??= getUserMedia(CONSTRAINTS).finally(() => {
      opening = null;
    });
    stream = await opening;
    return stream;
  };
  return {
    async open() {
      inUse = true;
      try {
        const s = await acquire();
        enable(s, true);
        return s;
      } catch (err) {
        inUse = false;
        throw err;
      }
    },
    release(s) {
      inUse = false;
      enable(s, false);
    },
    async warm() {
      const s = await acquire();
      if (!inUse) enable(s, false);
    },
  };
}

let source: MicSource = perTakeMic;

/** Picks where takes get the microphone (once, when the page starts). */
export function setMicSource(next: MicSource): void {
  source = next;
}

let active: Active | null = null;
let take: { blob: Blob; recording: Recording } | null = null;
let pending: Promise<Recording | null> | null = null;
let audio: HTMLAudioElement | null = null;
let audioUrl: string | null = null;

async function analyse(blob: Blob, fallbackMs: number): Promise<Recording> {
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    return {
      durationMs: Math.round(buf.duration * 1000),
      peaks: computePeaks(buf.getChannelData(0)),
    };
  } catch {
    return { durationMs: fallbackMs, peaks: [] };
  } finally {
    void ctx.close();
  }
}

function stopPlayback(): void {
  if (audio) {
    audio.pause();
    audio.dispatchEvent(new Event('error'));
  }
  audio = null;
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = null;
}

async function start(): Promise<RecResponse> {
  if (active) return { ok: true };
  stopPlayback();
  let stream: MediaStream;
  try {
    stream = await source.open();
  } catch (err) {
    return { ok: false, reason: failureOf(err) };
  }
  try {
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start();
    take = null;
    active = {
      stream,
      recorder,
      chunks,
      startedAt: performance.now(),
      stopped,
      timer: setTimeout(() => void finish(), MAX_RECORDING_MS),
    };
    return { ok: true };
  } catch {
    source.release(stream);
    return { ok: false, reason: 'failed' };
  }
}

/** Ends the current recording (also called by the 30 s limit). */
function finish(): Promise<Recording | null> {
  const a = active;
  if (!a) return pending ?? Promise.resolve(take?.recording ?? null);
  active = null;
  clearTimeout(a.timer);
  const elapsed = Math.round(performance.now() - a.startedAt);
  pending = (async () => {
    if (a.recorder.state !== 'inactive') a.recorder.stop();
    await a.stopped;
    source.release(a.stream);
    if (a.chunks.length === 0) return null;
    const blob = new Blob(a.chunks, { type: a.recorder.mimeType });
    const recording = await analyse(blob, elapsed);
    take = { blob, recording };
    return recording;
  })().finally(() => {
    pending = null;
  });
  return pending;
}

function play(): Promise<RecResponse> {
  stopPlayback();
  if (!take) return Promise.resolve({ ok: true, played: false });
  audioUrl = URL.createObjectURL(take.blob);
  const el = new Audio(audioUrl);
  audio = el;
  return new Promise<RecResponse>((resolve) => {
    const done = (played: boolean) => () => resolve({ ok: true, played });
    el.addEventListener('ended', done(true), { once: true });
    el.addEventListener('error', done(false), { once: true });
    el.play().catch(() => resolve({ ok: true, played: false }));
  });
}

/** Runs one recorder action (the offscreen page on Chrome, the mic window on Firefox). */
export async function handleRecAction(action: RecAction): Promise<RecResponse> {
  switch (action) {
    case 'start':
      return start();
    case 'stop':
      return { ok: true, recording: await finish() };
    case 'play':
      return play();
    case 'stop-play':
      stopPlayback();
      return { ok: true };
  }
}
