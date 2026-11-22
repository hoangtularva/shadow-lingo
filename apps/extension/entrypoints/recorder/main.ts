/**
 * Offscreen document: records the learner's voice for shadowing. Only the last take is
 * kept, in memory; it is never stored or sent anywhere.
 */
import { MAX_RECORDING_MS, computePeaks, type Recording } from '@shadow-lingo/core';
import { failureOf, isRecOffscreenRequest, type RecAction, type RecResponse } from '@/lib/recorder';

interface Active {
  stream: MediaStream;
  recorder: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
  stopped: Promise<void>;
  timer: ReturnType<typeof setTimeout>;
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
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
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
    for (const t of stream.getTracks()) t.stop();
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
    for (const t of a.stream.getTracks()) t.stop();
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

async function handle(action: RecAction): Promise<RecResponse> {
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

browser.runtime.onMessage.addListener((message: unknown, sender) => {
  // Only the background (no tab) may drive the recorder; content scripts go through it.
  if (sender.id !== browser.runtime.id || sender.tab || !isRecOffscreenRequest(message)) {
    return undefined;
  }
  return handle(message.action).catch((): RecResponse => ({ ok: false, reason: 'failed' }));
});
