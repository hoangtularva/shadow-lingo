import { describe, expect, it, vi } from 'vitest';
import {
  REC,
  REC_OFFSCREEN,
  createRecHandler,
  createRuntimeRecorder,
  failureOf,
  isRecOffscreenRequest,
  isRecRequest,
  isRecResponse,
} from '@/lib/recorder';

describe('recorder messages', () => {
  it('accepts only known actions', () => {
    expect(isRecRequest({ type: REC, action: 'start' })).toBe(true);
    expect(isRecRequest({ type: REC, action: 'upload' })).toBe(false);
    expect(isRecRequest({ type: REC_OFFSCREEN, action: 'start' })).toBe(false);
    expect(isRecOffscreenRequest({ type: REC_OFFSCREEN, action: 'stop-play' })).toBe(true);
    expect(isRecOffscreenRequest(null)).toBe(false);
  });

  it('validates responses', () => {
    expect(isRecResponse({ ok: true })).toBe(true);
    expect(isRecResponse({ ok: true, recording: { durationMs: 1200, peaks: [0, 1] } })).toBe(true);
    expect(isRecResponse({ ok: true, recording: null })).toBe(true);
    expect(isRecResponse({ ok: true, recording: { durationMs: -1, peaks: [] } })).toBe(false);
    expect(isRecResponse({ ok: true, recording: { durationMs: 1, peaks: [2] } })).toBe(false);
    expect(isRecResponse({ ok: true, played: 'yes' })).toBe(false);
    expect(isRecResponse({ ok: false, reason: 'permission' })).toBe(true);
    expect(isRecResponse({ ok: false, reason: 'other' })).toBe(false);
  });

  it('maps media errors to what the learner is told', () => {
    expect(failureOf(new DOMException('x', 'NotAllowedError'))).toBe('permission');
    expect(failureOf(new DOMException('x', 'NotFoundError'))).toBe('no-device');
    expect(failureOf(new Error('x'))).toBe('failed');
    expect(failureOf('x')).toBe('failed');
  });
});

describe('background handler', () => {
  it('forwards to the offscreen page and opens the permission page when needed', async () => {
    const deps = {
      ensureOffscreen: vi.fn(() => Promise.resolve()),
      forward: vi.fn(() => Promise.resolve({ ok: false, reason: 'permission' })),
      openPermissionPage: vi.fn(() => Promise.resolve()),
    };
    const handle = createRecHandler(deps);
    await expect(handle({ type: REC, action: 'start' })).resolves.toEqual({
      ok: false,
      reason: 'permission',
    });
    expect(deps.ensureOffscreen).toHaveBeenCalled();
    expect(deps.forward).toHaveBeenCalledWith({ type: REC_OFFSCREEN, action: 'start' });
    expect(deps.openPermissionPage).toHaveBeenCalledTimes(1);
  });

  it('turns bad answers and errors into a failure', async () => {
    const bad = createRecHandler({
      ensureOffscreen: () => Promise.resolve(),
      forward: () => Promise.resolve({ ok: 'maybe' }),
      openPermissionPage: () => Promise.resolve(),
    });
    await expect(bad({ type: REC, action: 'stop' })).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
    const broken = createRecHandler({
      ensureOffscreen: () => Promise.reject(new Error('no offscreen')),
      forward: () => Promise.resolve({ ok: true }),
      openPermissionPage: () => Promise.resolve(),
    });
    await expect(broken({ type: REC, action: 'start' })).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
  });
});

describe('content recorder adapter', () => {
  it('maps answers to the RecorderAdapter', async () => {
    const recording = { durationMs: 900, peaks: [0.5, 1] };
    const send = vi.fn((m: { action: string }) => {
      if (m.action === 'stop') return Promise.resolve({ ok: true, recording });
      if (m.action === 'play') return Promise.resolve({ ok: true, played: true });
      return Promise.resolve({ ok: true });
    });
    const rec = createRuntimeRecorder(send);
    await expect(rec.start()).resolves.toEqual({ ok: true });
    await expect(rec.stop()).resolves.toEqual(recording);
    await expect(rec.play()).resolves.toBe(true);
    await rec.stopPlayback();
    expect(send).toHaveBeenLastCalledWith({ type: REC, action: 'stop-play' });
  });

  it('fails safely when the background is gone', async () => {
    const rec = createRuntimeRecorder(() => Promise.reject(new Error('gone')));
    await expect(rec.start()).resolves.toEqual({ ok: false, reason: 'failed' });
    await expect(rec.stop()).resolves.toBeNull();
    await expect(rec.play()).resolves.toBe(false);
  });
});
