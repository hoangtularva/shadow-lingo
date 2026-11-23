/** The OCR engine is closed after this long without reading (it takes memory). */
export const ENGINE_IDLE_MS = 120_000;

/**
 * Wraps each use of a resource; once nothing has used it for `ms`, runs `close` (never while
 * a use is still running). The next use starts it again.
 */
export function closeWhenIdle(
  ms: number,
  close: () => void,
): <T>(job: () => Promise<T>) => Promise<T> {
  let running = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return async (job) => {
    running++;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    try {
      return await job();
    } finally {
      running--;
      if (running === 0) timer = setTimeout(close, ms);
    }
  };
}
