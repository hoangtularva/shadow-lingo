import {
  computePeaks,
  MAX_RECORDING_MS,
  type Recording,
  type RecorderAdapter,
  type RecorderStartResult,
} from '@shadow-lingo/core';

/**
 * The learner's voice for shadowing, recorded in the app window. Only the last take is kept,
 * in memory; it is never stored or sent anywhere.
 */
export function createMediaRecorder(): RecorderAdapter {
  let active: {
    stream: MediaStream;
    recorder: MediaRecorder;
    chunks: Blob[];
    startedAt: number;
    stopped: Promise<void>;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  let take: { blob: Blob; recording: Recording } | null = null;
  let pending: Promise<Recording | null> | null = null;
  let audio: HTMLAudioElement | null = null;
  let audioUrl: string | null = null;

  const analyse = async (blob: Blob, fallbackMs: number): Promise<Recording> => {
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
  };

  const stopAudio = () => {
    if (audio) {
      audio.pause();
      audio.dispatchEvent(new Event('error'));
    }
    audio = null;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = null;
  };

  const finish = (): Promise<Recording | null> => {
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
  };

  return {
    async start(): Promise<RecorderStartResult> {
      if (active) return { ok: true };
      stopAudio();
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch (err) {
        const name = err instanceof DOMException || err instanceof Error ? err.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError')
          return { ok: false, reason: 'permission' };
        if (
          name === 'NotFoundError' ||
          name === 'OverconstrainedError' ||
          name === 'NotReadableError'
        ) {
          return { ok: false, reason: 'no-device' };
        }
        return { ok: false, reason: 'failed' };
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
    },
    stop: () => finish(),
    play() {
      stopAudio();
      if (!take) return Promise.resolve(false);
      audioUrl = URL.createObjectURL(take.blob);
      const el = new Audio(audioUrl);
      audio = el;
      return new Promise<boolean>((resolve) => {
        el.addEventListener('ended', () => resolve(true), { once: true });
        el.addEventListener('error', () => resolve(false), { once: true });
        el.play().catch(() => resolve(false));
      });
    },
    stopPlayback() {
      stopAudio();
      return Promise.resolve();
    },
  };
}
