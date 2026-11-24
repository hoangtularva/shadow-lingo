/**
 * Firefox only: the small extension window that holds the microphone (Firefox refuses it to the
 * background page). The background opens it on the first recorder action, waits until its page
 * says it is ready, then forwards recorder actions to it.
 */
import type { RecAction, RecResponse } from './recorder';

export const MIC_WINDOW_PATH = '/mic-window.html';
export const MIC_WINDOW_READY = 'shadow-lingo:mic-window-ready';
/** Popup size from the UI spec (380×260 content plus the window frame). */
export const MIC_WINDOW_SIZE = { width: 400, height: 300 } as const;
export const MIC_WINDOW_TIMEOUT_MS = 15_000;

export interface MicWindowReady {
  type: typeof MIC_WINDOW_READY;
}

export function isMicWindowReady(v: unknown): v is MicWindowReady {
  return typeof v === 'object' && v !== null && (v as { type?: unknown }).type === MIC_WINDOW_READY;
}

export interface MicWindowDeps {
  /** Opens the popup window; resolves to its id. */
  create(): Promise<number>;
  /** True while a window with this id is still open. */
  exists(id: number): Promise<boolean>;
  focus(id: number): Promise<void>;
  timeoutMs?: number;
}

export interface MicWindow {
  /** Opens the window if needed and resolves once its page can take recorder actions. */
  ensure(): Promise<void>;
  /** The window's page said it is ready (call only for our own mic-window page). */
  ready(): void;
  /** A browser window closed. */
  removed(id: number): void;
  /** Brings the window forward so the learner sees Firefox's microphone prompt. */
  focus(): Promise<void>;
}

export function createMicWindow(deps: MicWindowDeps): MicWindow {
  const timeoutMs = deps.timeoutMs ?? MIC_WINDOW_TIMEOUT_MS;
  let id: number | null = null;
  let isReady = false;
  let opening: Promise<void> | null = null;
  let waiters: Array<() => void> = [];

  const whenReady = (): Promise<void> =>
    new Promise((resolve, reject) => {
      if (isReady) return resolve();
      const timer = setTimeout(() => {
        waiters = waiters.filter((w) => w !== done);
        reject(new Error('mic window: not ready'));
      }, timeoutMs);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      waiters.push(done);
    });

  const open = async (): Promise<void> => {
    if (id !== null && (await deps.exists(id))) return whenReady();
    id = null;
    isReady = false;
    id = await deps.create();
    return whenReady();
  };

  return {
    ensure() {
      opening ??= open().finally(() => {
        opening = null;
      });
      return opening;
    },
    ready() {
      isReady = true;
      const list = waiters;
      waiters = [];
      for (const w of list) w();
    },
    removed(closed) {
      if (closed !== id) return;
      id = null;
      isReady = false;
    },
    async focus() {
      if (id !== null) await deps.focus(id).catch(() => undefined);
    },
  };
}

export type MicState = 'ready' | 'recording' | 'blocked';

/** What the window shows after a recorder action (null: leave it as it is). */
export function micStateAfter(action: RecAction, res: RecResponse): MicState | null {
  if (!res.ok) return res.reason === 'permission' ? 'blocked' : 'ready';
  if (action === 'start') return 'recording';
  if (action === 'stop') return 'ready';
  return null;
}
