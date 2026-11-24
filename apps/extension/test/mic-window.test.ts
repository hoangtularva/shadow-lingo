import { describe, expect, it, vi } from 'vitest';
import {
  MIC_WINDOW_READY,
  createMicWindow,
  isMicWindowReady,
  micStateAfter,
  type MicWindowDeps,
} from '@/lib/mic-window';
import { createHeldMic } from '@/lib/recorder-engine';

function deps(over: Partial<MicWindowDeps> = {}) {
  const open = new Set<number>();
  let next = 1;
  const d = {
    create: vi.fn(async () => {
      const id = next++;
      open.add(id);
      return id;
    }),
    exists: vi.fn(async (id: number) => open.has(id)),
    focus: vi.fn(async () => undefined),
    timeoutMs: 50,
    ...over,
  };
  return { d, close: (id: number) => open.delete(id) };
}

describe('mic window', () => {
  it('opens once and waits for its page', async () => {
    const { d } = deps();
    const win = createMicWindow(d);
    const a = win.ensure();
    const b = win.ensure();
    win.ready();
    await Promise.all([a, b]);
    expect(d.create).toHaveBeenCalledTimes(1);
    await win.ensure();
    expect(d.create).toHaveBeenCalledTimes(1);
  });

  it('opens a new window after the learner closed it', async () => {
    const { d, close } = deps();
    const win = createMicWindow(d);
    const first = win.ensure();
    win.ready();
    await first;
    close(1);
    win.removed(1);
    const again = win.ensure();
    await vi.waitFor(() => expect(d.create).toHaveBeenCalledTimes(2));
    win.ready();
    await again;
  });

  it('notices a closed window even without the removed event', async () => {
    const { d, close } = deps();
    const win = createMicWindow(d);
    const first = win.ensure();
    win.ready();
    await first;
    close(1);
    const again = win.ensure();
    await vi.waitFor(() => expect(d.create).toHaveBeenCalledTimes(2));
    win.ready();
    await again;
  });

  it('gives up when the page never says it is ready', async () => {
    const { d } = deps();
    await expect(createMicWindow(d).ensure()).rejects.toThrow(/not ready/);
  });

  it('ignores other windows closing and focuses its own', async () => {
    const { d } = deps();
    const win = createMicWindow(d);
    await win.focus();
    expect(d.focus).not.toHaveBeenCalled();
    const first = win.ensure();
    win.ready();
    await first;
    win.removed(99);
    await win.focus();
    expect(d.focus).toHaveBeenCalledWith(1);
  });

  it('checks the ready message shape', () => {
    expect(isMicWindowReady({ type: MIC_WINDOW_READY })).toBe(true);
    expect(isMicWindowReady({ type: 'other' })).toBe(false);
    expect(isMicWindowReady(null)).toBe(false);
  });

  it('shows what the last action did', () => {
    expect(micStateAfter('start', { ok: true })).toBe('recording');
    expect(micStateAfter('stop', { ok: true, recording: null })).toBe('ready');
    expect(micStateAfter('play', { ok: true, played: true })).toBeNull();
    expect(micStateAfter('start', { ok: false, reason: 'permission' })).toBe('blocked');
    expect(micStateAfter('start', { ok: false, reason: 'no-device' })).toBe('ready');
  });
});

describe('held microphone (Firefox mic window)', () => {
  function fakeStream() {
    const track = { enabled: true, readyState: 'live' as MediaStreamTrackState };
    const stream = { getAudioTracks: () => [track] } as unknown as MediaStream;
    return { stream, track };
  }

  it('asks once, keeps the stream and only enables it during a take', async () => {
    const { stream, track } = fakeStream();
    const gum = vi.fn(async () => stream);
    const mic = createHeldMic(gum);
    await mic.warm();
    expect(track.enabled).toBe(false);
    const s = await mic.open();
    expect(track.enabled).toBe(true);
    mic.release(s);
    expect(track.enabled).toBe(false);
    await mic.open();
    expect(gum).toHaveBeenCalledTimes(1);
  });

  it('does not switch off a take that started while it was warming up', async () => {
    const { stream, track } = fakeStream();
    let resolve: (s: MediaStream) => void = () => undefined;
    const gum = vi.fn(() => new Promise<MediaStream>((r) => (resolve = r)));
    const mic = createHeldMic(gum);
    const warm = mic.warm();
    const take = mic.open();
    resolve(stream);
    await Promise.all([warm, take]);
    expect(gum).toHaveBeenCalledTimes(1);
    expect(track.enabled).toBe(true);
  });

  it('asks again once the stream has ended, and passes refusals on', async () => {
    const first = fakeStream();
    const gum = vi
      .fn<(c: MediaStreamConstraints) => Promise<MediaStream>>()
      .mockResolvedValueOnce(first.stream)
      .mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'));
    const mic = createHeldMic(gum);
    await mic.warm();
    first.track.readyState = 'ended';
    await expect(mic.open()).rejects.toThrow();
    expect(gum).toHaveBeenCalledTimes(2);
  });
});
