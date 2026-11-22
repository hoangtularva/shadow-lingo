/** Bars in the "Giọng bạn" waveform (UI spec). */
export const PEAK_COUNT = 40;

/**
 * Loudness per slice (max absolute sample), normalized so the loudest slice is 1.
 * Silence (or an empty buffer) gives all zeros.
 */
export function computePeaks(samples: ArrayLike<number>, count: number = PEAK_COUNT): number[] {
  const out = new Array<number>(count).fill(0);
  const n = samples.length;
  if (n === 0 || count <= 0) return out;
  for (let b = 0; b < count; b++) {
    const from = Math.floor((b * n) / count);
    const to = Math.max(from + 1, Math.floor(((b + 1) * n) / count));
    let max = 0;
    for (let i = from; i < to && i < n; i++) {
      const v = Math.abs(samples[i] ?? 0);
      if (v > max) max = v;
    }
    out[b] = max;
  }
  const top = Math.max(...out);
  if (top < 1e-4) return out.fill(0);
  return out.map((v) => Math.round((v / top) * 1000) / 1000);
}

/** Squeezes or stretches peaks to `n` bars (max of the covered slices). */
export function resamplePeaks(peaks: readonly number[], n: number): number[] {
  if (n <= 0) return [];
  if (peaks.length === 0) return new Array<number>(n).fill(0);
  const out: number[] = [];
  for (let b = 0; b < n; b++) {
    const from = Math.floor((b * peaks.length) / n);
    const to = Math.max(from + 1, Math.floor(((b + 1) * peaks.length) / n));
    let max = 0;
    for (let i = from; i < to && i < peaks.length; i++) max = Math.max(max, peaks[i] ?? 0);
    out.push(max);
  }
  return out;
}

/** True for a well-formed peaks array (used to validate messages). */
export function isPeaks(v: unknown, max: number = PEAK_COUNT): v is number[] {
  return (
    Array.isArray(v) &&
    v.length <= max &&
    v.every((p) => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1)
  );
}
