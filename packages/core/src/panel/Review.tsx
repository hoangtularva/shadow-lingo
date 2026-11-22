import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { DictPos } from '../dict';
import { formatTimestamp } from '../parsers/text-utils';
import { formatInterval, makeQuiz, markContext, type VocabEntry } from '../vocab';
import { vi } from './strings';

const HEAD_COLOUR: Partial<Record<DictPos, string>> = {
  noun: 'text-pos-noun',
  verb: 'text-pos-verb',
  adj: 'text-pos-adjective',
  adv: 'text-pos-adverb',
  pron: 'text-pos-pronoun',
};

export interface ReviewProps {
  /** Today's queue, fixed when the session starts. */
  queue: readonly VocabEntry[];
  /** Every saved word: meanings to choose from. */
  pool: readonly VocabEntry[];
  /** Saves the answer; returns how long until the word is asked again (ms). */
  onAnswer(entry: VocabEntry, correct: boolean): number;
  onExit(): void;
  onProgress(done: number, total: number): void;
  /** Plays the sentence the word was met in; undefined hides the button. */
  onPlaySentence?: (entry: VocabEntry) => void;
  /** Reads the word aloud on the device; undefined hides the button. */
  onSpeak?: (text: string) => void;
  random?: () => number;
}

interface Answered {
  choice: number;
  correct: boolean;
  nextInMs: number;
}

function posLabel(pos: DictPos, headword: string): string {
  return pos === 'verb' && headword.includes(' ') ? vi.phrasalVerb : vi.dictPos[pos];
}

/** Multiple-choice review (UI spec: Review / ReviewAnswer boards). */
export function Review({
  queue,
  pool,
  onAnswer,
  onExit,
  onProgress,
  onPlaySentence,
  onSpeak,
  random = Math.random,
}: ReviewProps) {
  // A word answered wrong comes back once at the end of the session.
  const [order, setOrder] = useState(() => queue.map((e) => e.id));
  const [at, setAt] = useState(0);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [right, setRight] = useState(0);
  const [asked, setAsked] = useState(0);
  const requeued = useRef(new Set<string>());
  const rootRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(queue.map((e) => [e.id, e])), [queue]);
  // Choices come from the notebook as it was when the session started.
  const [choicesFrom] = useState(pool);
  const entry = byId.get(order[at] ?? '');
  const done = at >= order.length;
  // A new quiz for each question, also when a word comes back (same entry, new position).
  const quiz = useMemo(
    () => (entry && at >= 0 ? makeQuiz(entry, choicesFrom, random) : null),
    [entry, at, choicesFrom, random],
  );

  useEffect(() => {
    onProgress(Math.min(at, order.length), order.length);
  }, [at, order.length, onProgress]);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const choose = (i: number) => {
    if (!entry || !quiz || answered) return;
    const correct = i === quiz.answer;
    const nextInMs = onAnswer(entry, correct);
    setAnswered({ choice: i, correct, nextInMs });
    setAsked((n) => n + 1);
    if (correct) setRight((n) => n + 1);
    else if (!requeued.current.has(entry.id)) {
      requeued.current.add(entry.id);
      setOrder((o) => [...o, entry.id]);
    }
  };

  const next = () => {
    setAnswered(null);
    setAt((n) => n + 1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement) return;
    // Keys belong to the quiz here, not to the player.
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onExit();
    } else if (!answered && /^[1-4]$/.test(e.key)) {
      e.preventDefault();
      choose(Number(e.key) - 1);
    } else if (answered && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      next();
    }
  };

  const total = order.length;
  const progress = total === 0 ? 0 : Math.min(at, total) / total;
  const ctx = entry?.context;
  const marked = ctx ? markContext(ctx) : null;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="flex min-h-0 flex-1 flex-col outline-none"
      data-testid="sl-review"
    >
      <div className="flex shrink-0 items-center gap-2.5 px-4 py-3">
        <button
          type="button"
          onClick={onExit}
          className="h-[30px] rounded-lg border border-chip-off px-2.5 text-xs font-medium whitespace-nowrap text-fg hover:bg-surface"
          data-testid="sl-review-exit"
        >
          {vi.reviewBack}
        </button>
        <div
          className="h-1.5 flex-1 rounded-full bg-surface"
          role="progressbar"
          aria-valuenow={Math.min(at, total)}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={vi.reviewProgress(Math.min(at, total), total)}
        >
          <div
            className="h-1.5 rounded-full bg-accent transition-[width] duration-200"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="text-xs text-secondary tabular-nums" data-testid="sl-review-count">
          {Math.min(at, total)}/{total}
        </span>
      </div>

      {done || !entry ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-[15px] font-semibold text-fg" data-testid="sl-review-done">
            {vi.reviewDone(right, asked)}
          </p>
          <button
            type="button"
            onClick={onExit}
            className="h-11 rounded-xl bg-accent px-6 text-[14px] font-semibold text-[#15171c]"
          >
            {vi.reviewBack}
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-1 pb-4">
          <div className="flex flex-col gap-2.5 rounded-[14px] border border-accent bg-card p-4">
            <div className="text-[11px] text-secondary">
              {vi.reviewSeen}
              {ctx && ctx.videoId ? ` · ${formatTimestamp(ctx.start)}` : ''}
              {ctx?.title ? ` · ${ctx.title}` : ''}
            </div>
            {marked ? (
              <p
                className="text-[16px] leading-normal text-fg"
                lang="en"
                data-testid="sl-review-sentence"
              >
                {marked[0]}
                <span
                  className={
                    'font-bold underline decoration-accent underline-offset-[5px] ' +
                    ((entry.pos && HEAD_COLOUR[entry.pos]) || 'text-fg')
                  }
                >
                  {marked[1]}
                </span>
                {marked[2]}
              </p>
            ) : (
              <p className="text-[16px] font-bold text-fg">{entry.headword}</p>
            )}
            {(onPlaySentence || onSpeak) && (
              <div className="flex flex-wrap gap-2">
                {onPlaySentence && ctx?.videoId && (
                  <button
                    type="button"
                    onClick={() => onPlaySentence(entry)}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-chip-off px-3 text-xs font-medium text-fg hover:bg-surface"
                    data-testid="sl-review-play"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M3 2 L10 6 L3 10 Z" fill="currentColor" />
                    </svg>
                    {vi.playSentence}
                  </button>
                )}
                {onSpeak && (
                  <button
                    type="button"
                    onClick={() => onSpeak(entry.headword)}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-chip-off px-3 text-xs font-medium text-fg hover:bg-surface"
                    data-testid="sl-review-speak"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M11 5 6 9H2v6h4l5 4V5z" />
                      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                    </svg>
                    {vi.speakWord}
                  </button>
                )}
              </div>
            )}
          </div>

          <p className="text-[15px] font-semibold text-fg">{vi.reviewQuestion(entry.headword)}</p>
          {quiz && (
            <div
              className="flex flex-col gap-2"
              role="group"
              aria-label={vi.reviewQuestion(entry.headword)}
            >
              {quiz.choices.map((c, i) => {
                const isAnswer = i === quiz.answer;
                const state = !answered
                  ? ''
                  : isAnswer
                    ? 'ok'
                    : i === answered.choice
                      ? 'no'
                      : 'dim';
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => choose(i)}
                    disabled={!!answered}
                    lang="vi"
                    className={
                      'flex min-h-12 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-[14px] transition-colors duration-150 ' +
                      (state === 'ok'
                        ? 'border-ok-edge bg-ok-bg font-semibold text-ok-fg'
                        : state === 'no'
                          ? 'border-no-edge bg-no-bg font-semibold text-no-fg'
                          : state === 'dim'
                            ? 'border-edge bg-transparent text-subtle'
                            : 'border-chip-off bg-card text-fg hover:border-accent')
                    }
                    data-testid="sl-review-choice"
                    data-state={state || undefined}
                  >
                    <kbd className="inline-flex h-5 min-w-5 flex-none items-center justify-center rounded border border-chip-off px-1 text-[11px] font-semibold text-secondary">
                      {i + 1}
                    </kbd>
                    <span className="flex-1">{c}</span>
                    {state === 'ok' && (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M5 12l5 5L19 7" />
                      </svg>
                    )}
                    {state === 'no' && (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {answered && (
            <div
              className="flex flex-col gap-1.5 rounded-xl bg-surface px-3.5 py-3"
              data-testid="sl-review-details"
            >
              <div className="flex items-baseline gap-2.5">
                <span
                  className={
                    'text-[16px] font-bold ' + ((entry.pos && HEAD_COLOUR[entry.pos]) || 'text-fg')
                  }
                >
                  {entry.headword}
                </span>
                {entry.ipa && <span className="font-ipa text-[13px] text-ipa">/{entry.ipa}/</span>}
                {entry.pos && (
                  <span className="ml-auto text-[11px] text-secondary">
                    {posLabel(entry.pos, entry.headword)}
                  </span>
                )}
              </div>
              {entry.senses[0] && (
                <p className="text-[12.5px] leading-normal text-secondary" lang="en">
                  {entry.senses[0].gloss}
                  {entry.senses[0].example && (
                    <>
                      <br />
                      <i className="text-subtle">“{entry.senses[0].example}”</i>
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          <div className="flex-1" />
          {answered ? (
            <>
              <p
                className={
                  'text-center text-[13px] font-semibold ' +
                  (answered.correct ? 'text-ok-fg' : 'text-no-fg')
                }
                data-testid="sl-review-result"
              >
                {(answered.correct ? vi.reviewRight : vi.reviewWrong)(
                  formatInterval(answered.nextInMs),
                )}
              </p>
              <button
                type="button"
                onClick={next}
                className="flex h-[52px] items-center justify-center gap-2.5 rounded-xl bg-accent text-[15px] font-semibold text-[#15171c]"
                data-testid="sl-review-next"
              >
                {at + 1 >= order.length ? vi.reviewFinish : vi.reviewNext}
                <kbd className="inline-flex h-5 min-w-[22px] items-center justify-center rounded border border-[#15171c]/40 px-1.5 text-[11px] font-semibold">
                  Space
                </kbd>
              </button>
            </>
          ) : (
            <p className="text-center text-[11px] text-subtle">{vi.reviewHint}</p>
          )}
        </div>
      )}
    </div>
  );
}
