import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PlayerAdapter, RecorderAdapter, Recording } from '../adapters';
import { canUse } from '../features';
import { PEAK_COUNT, resamplePeaks } from '../shadowing/peaks';
import { MAX_RECORDING_MS, SPEEDS, SentencePlayback } from '../shadowing/playback';
import type { Sentence } from '../types';
import type { PanelStore } from './store';
import { vi } from './strings';

/** 1 = listen to the model, 2 = shadow it, 3 = compare. */
export type ShadowStep = 1 | 2 | 3;

interface TakenRecording extends Recording {
  /** Sentence the learner was shadowing when recording started. */
  index: number;
}

export interface Shadowing {
  step: ShadowStep;
  recording: boolean;
  take: TakenRecording | null;
  rate: number;
  autoPause: boolean;
  /** Sentence the buttons act on. */
  sentence: Sentence | null;
  /** Sentence the take is compared with (the take's own, else the spoken one). */
  original: Sentence | null;
  canRecord: boolean;
  replay(): void;
  toggleRecord(): void;
  compare(): void;
  setRate(rate: number): void;
  setAutoPause(on: boolean): void;
}

interface Options {
  store: PanelStore;
  player: PlayerAdapter | null;
  recorder: RecorderAdapter | null | undefined;
  sentences: readonly Sentence[] | null;
  activeIndex: number;
}

/** State and actions of the shadowing section (also driven by the S / R / C keys). */
export function useShadowing({
  store,
  player,
  recorder,
  sentences,
  activeIndex,
}: Options): Shadowing {
  const [step, setStep] = useState<ShadowStep>(1);
  const [recording, setRecording] = useState(false);
  const [take, setTake] = useState<TakenRecording | null>(null);
  const [rate, setRateState] = useState(() => player?.getPlaybackRate() ?? 1);
  const [autoPause, setAutoPauseState] = useState(false);
  const playback = useRef<SentencePlayback | null>(null);
  const busy = useRef(false);
  const recordIndex = useRef(-1);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canRecord = !!recorder && canUse('recordCompare');

  const index = Math.max(0, activeIndex);
  const sentence = sentences?.[index] ?? null;

  useEffect(() => {
    if (!player) return;
    const p = new SentencePlayback(player);
    playback.current = p;
    return () => {
      p.dispose();
      playback.current = null;
    };
  }, [player]);

  useEffect(() => {
    playback.current?.setSentences(sentences ?? []);
  }, [sentences, player]);

  useEffect(() => {
    playback.current?.setAutoPause(autoPause && canUse('autoPause'));
  }, [autoPause, player]);

  // The player's own speed menu may change the rate too.
  useEffect(() => {
    if (!player) return;
    return player.onTimeUpdate(() => setRateState(player.getPlaybackRate()));
  }, [player]);

  const recordingRef = useRef(false);
  const takeRef = useRef<TakenRecording | null>(null);
  useEffect(() => {
    recordingRef.current = recording;
    takeRef.current = take;
  }, [recording, take]);

  // A new spoken sentence starts the cycle again (an ongoing recording keeps its sentence).
  useEffect(() => {
    if (recordingRef.current || takeRef.current?.index === index) return;
    setTake(null);
    setStep(1);
  }, [index]);

  const stopRecording = useCallback(async () => {
    if (!recorder) return;
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = null;
    setRecording(false);
    try {
      const rec = await recorder.stop();
      if (rec && rec.durationMs > 0) {
        setTake({ ...rec, index: recordIndex.current });
        setStep(3);
      } else {
        setStep(2);
      }
    } catch {
      store.getState().setNotice(vi.recordFailed);
    }
  }, [recorder, store]);

  // Never leave the microphone on when the panel goes away.
  useEffect(
    () => () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
      if (recordingRef.current) void recorder?.stop().catch(() => undefined);
    },
    [recorder],
  );

  const replay = useCallback(() => {
    const p = playback.current;
    if (!p || !sentence) return;
    void recorder?.stopPlayback().catch(() => undefined);
    setStep((s) => (recording ? s : 1));
    void p.playSegment(sentence).then((ended) => {
      if (ended) setStep((s) => (s === 1 ? 2 : s));
    });
  }, [sentence, recorder, recording]);

  const toggleRecord = useCallback(() => {
    if (!recorder || !canRecord || busy.current) return;
    if (recording) {
      void stopRecording();
      return;
    }
    if (!sentence) return;
    busy.current = true;
    void recorder.stopPlayback().catch(() => undefined);
    recordIndex.current = index;
    void recorder
      .start()
      .then((res) => {
        if (!res.ok) {
          store
            .getState()
            .setNotice(
              res.reason === 'permission'
                ? vi.micPermission
                : res.reason === 'no-device'
                  ? vi.micMissing
                  : vi.recordFailed,
            );
          return;
        }
        store.getState().setNotice(null);
        setRecording(true);
        setStep(2);
        stopTimer.current = setTimeout(() => void stopRecording(), MAX_RECORDING_MS);
      })
      .catch(() => store.getState().setNotice(vi.recordFailed))
      .finally(() => {
        busy.current = false;
      });
  }, [recorder, canRecord, recording, sentence, index, store, stopRecording]);

  const compare = useCallback(() => {
    const p = playback.current;
    const s = take ? sentences?.[take.index] : null;
    if (!p || !recorder || !take || !s || recording) return;
    setStep(3);
    void recorder.stopPlayback().catch(() => undefined);
    void p.playSegment(s).then((ended) => {
      if (ended) void recorder.play().catch(() => false);
    });
  }, [take, sentences, recorder, recording]);

  const setRate = useCallback(
    (r: number) => {
      if (!player) return;
      player.setPlaybackRate(r);
      setRateState(r);
    },
    [player],
  );

  return {
    step,
    recording,
    take,
    rate,
    autoPause,
    sentence,
    original: (take ? sentences?.[take.index] : null) ?? sentence,
    canRecord,
    replay,
    toggleRecord,
    compare,
    setRate,
    setAutoPause: setAutoPauseState,
  };
}

const BAR_W = 4;
const BAR_GAP = 3;
const WAVE_W = PEAK_COUNT * BAR_W + (PEAK_COUNT - 1) * BAR_GAP;
const WAVE_H = 22;
const BAR_MIN_H = 3;

function Kbd({ children, onAccent }: { children: ReactNode; onAccent?: boolean }) {
  return (
    <kbd
      className={
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border px-[5px] font-sans text-[11px] leading-none font-semibold ' +
        (onAccent ? 'border-[rgba(21,23,28,0.4)] text-[#15171c]' : 'border-chip-off text-muted')
      }
    >
      {children}
    </kbd>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function StepChip({ n, label, current }: { n: number; label: string; current: boolean }) {
  return (
    <span
      className={
        'flex h-6 items-center gap-1 rounded-xl px-2.5 whitespace-nowrap ' +
        (current ? 'border border-chip-fg bg-chip-bg text-chip-fg' : 'bg-surface text-secondary')
      }
      aria-current={current ? 'step' : undefined}
      data-testid={`sl-step-${n}`}
    >
      <b className={current ? undefined : 'text-fg'}>{n}.</b>
      {label}
    </span>
  );
}

const outlineButton =
  'flex h-11 flex-none items-center gap-2 rounded-[10px] border border-chip-off bg-card px-3 text-[13px] font-medium whitespace-nowrap text-fg disabled:cursor-not-allowed disabled:opacity-50';

function speedLabel(r: number): string {
  return `${r}×`;
}

function Waveform({ take, scale }: { take: TakenRecording | null; scale: number }) {
  // Both rows share one time scale: a slower or faster take shows as a longer or shorter row.
  const bars = take
    ? resamplePeaks(
        take.peaks,
        Math.max(1, Math.min(PEAK_COUNT, Math.round((PEAK_COUNT * take.durationMs) / scale))),
      )
    : new Array<number>(PEAK_COUNT).fill(0);
  return (
    <div
      className="flex h-[22px] min-w-0 flex-1 items-center gap-[3px] overflow-hidden"
      aria-hidden="true"
      data-testid="sl-wave-you"
      data-bars={take ? bars.length : 0}
    >
      {bars.map((p, i) => (
        <div
          key={i}
          className={'w-1 flex-none rounded-sm ' + (take ? 'bg-link' : 'bg-chip-off')}
          style={{ height: `${Math.round(BAR_MIN_H + p * (WAVE_H - BAR_MIN_H))}px` }}
        />
      ))}
    </div>
  );
}

/** The "record and compare" section at the bottom of the panel (UI spec). */
export function ShadowingSection({
  sh,
  collapsed = false,
  onCollapsedChange,
}: {
  sh: Shadowing;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const steps = [vi.stepListen, vi.stepShadow, vi.stepCompare] as const;
  const originalMs = sh.original ? Math.max(0, sh.original.end - sh.original.start) : 0;
  const scale = Math.max(originalMs, sh.take?.durationMs ?? 0, 1);
  const originalW = Math.max(BAR_W, Math.round((WAVE_W * originalMs) / scale));
  return (
    <section
      className={
        'flex shrink-0 flex-col gap-3 border-t border-line bg-shadow-bg px-4 ' +
        (collapsed ? 'py-2.5' : 'pt-3.5 pb-4')
      }
      aria-label={vi.shadowingLabel}
      data-testid="sl-shadowing"
      data-collapsed={collapsed ? 'true' : undefined}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-1.5 text-xs"
          aria-label={vi.stepsLabel(sh.step)}
          data-testid="sl-steps"
          data-step={sh.step}
        >
          {steps.map((label, i) => (
            <span key={label} className="contents">
              {i > 0 && (
                <span aria-hidden="true" className="text-arrow">
                  →
                </span>
              )}
              <StepChip n={i + 1} label={label} current={sh.step === i + 1} />
            </span>
          ))}
        </div>
        {onCollapsedChange && (
          <button
            type="button"
            className="ml-auto flex size-7 flex-none items-center justify-center rounded-lg text-secondary hover:bg-surface hover:text-fg"
            aria-label={collapsed ? vi.shadowingExpand : vi.shadowingCollapse}
            aria-expanded={!collapsed}
            title={collapsed ? vi.shadowingExpand : vi.shadowingCollapse}
            onClick={() => onCollapsedChange(!collapsed)}
            data-testid="sl-shadowing-toggle"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d={collapsed ? 'M4 10 L8 6 L12 10' : 'M4 6 L8 10 L12 6'}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
      {!collapsed && (
        <>
          <div className="flex items-center gap-2">
            <div className="w-16 flex-none text-[11px] text-secondary">{vi.original}</div>
            <div className="flex h-[22px] min-w-0 flex-1 items-center" aria-hidden="true">
              <div
                className="h-1.5 max-w-full rounded-[3px] bg-subtle"
                style={{ width: `${originalW}px` }}
                data-testid="sl-wave-original"
              />
            </div>
          </div>
          {sh.canRecord && (
            <div className="flex items-center gap-2">
              <div className="w-16 flex-none text-[11px] text-secondary">{vi.yourVoice}</div>
              <Waveform take={sh.take} scale={scale} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={outlineButton}
              aria-label={vi.replayLabel}
              title={vi.replayLabel}
              onClick={sh.replay}
              disabled={!sh.sentence}
              data-testid="sl-replay"
            >
              <Icon>
                <path d="M3 12a9 9 0 1 0 3-6.7" />
                <path d="M3 4v5h5" />
              </Icon>
              <span>{vi.replay}</span>
              <Kbd>S</Kbd>
            </button>
            {sh.canRecord && (
              <button
                type="button"
                className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-[10px] border-none bg-accent text-sm font-semibold whitespace-nowrap text-[#15171c] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={sh.recording ? vi.stopLabel : vi.recordLabel}
                aria-pressed={sh.recording}
                title={sh.recording ? vi.stopLabel : vi.recordLabel}
                onClick={sh.toggleRecord}
                disabled={!sh.sentence}
                data-testid="sl-record"
              >
                <Icon>
                  {sh.recording ? (
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  ) : (
                    <>
                      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
                      <path d="M5 11a7 7 0 0 0 14 0" />
                      <path d="M12 18v3" />
                    </>
                  )}
                </Icon>
                <span>{sh.recording ? vi.stop : vi.record}</span>
                <Kbd onAccent>R</Kbd>
              </button>
            )}
            {sh.canRecord && (
              <button
                type="button"
                className={outlineButton}
                aria-label={vi.compareLabel}
                title={vi.compareLabel}
                onClick={sh.compare}
                disabled={!sh.take || sh.recording}
                data-testid="sl-compare"
              >
                <Icon>
                  <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
                  <rect x="3" y="14" width="4" height="7" rx="1.5" />
                  <rect x="17" y="14" width="4" height="7" rx="1.5" />
                </Icon>
                <span>{vi.compare}</span>
                <Kbd>C</Kbd>
              </button>
            )}
          </div>
          {(canUse('playbackSpeed') || canUse('autoPause')) && (
            <div className="flex items-center gap-2">
              {canUse('playbackSpeed') && (
                <>
                  <span className="text-xs whitespace-nowrap text-secondary">{vi.speed}</span>
                  <div className="flex gap-1.5">
                    {SPEEDS.map((r) => {
                      const on = Math.abs(sh.rate - r) < 0.001;
                      return (
                        <button
                          key={r}
                          type="button"
                          aria-pressed={on}
                          onClick={() => sh.setRate(r)}
                          data-testid={`sl-speed-${r}`}
                          className={
                            'h-[30px] rounded-[15px] border px-2.5 text-xs whitespace-nowrap ' +
                            (on
                              ? 'border-chip-fg bg-chip-bg font-semibold text-chip-fg'
                              : 'border-chip-off bg-transparent font-medium text-secondary hover:text-fg')
                          }
                        >
                          {speedLabel(r)}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {canUse('autoPause') && (
                <label className="ml-auto flex items-center gap-2 text-xs whitespace-nowrap text-secondary">
                  <input
                    type="checkbox"
                    className="size-4 accent-chip-fg"
                    checked={sh.autoPause}
                    onChange={(e) => sh.setAutoPause(e.target.checked)}
                    data-testid="sl-auto-pause"
                  />
                  {vi.autoPause}
                </label>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
