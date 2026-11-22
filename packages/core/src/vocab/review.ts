import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs';
import type { VocabEntry } from './index';

/** FSRS memory state of a saved word, as stored (dates in ms since epoch). */
export interface ReviewState {
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  /** 0 new, 1 learning, 2 review, 3 relearning. */
  state: 0 | 1 | 2 | 3;
  lastReview?: number;
}

/** "Mới", "Cần ôn", "Đang học", "Đã thuộc". */
export type VocabStatus = 'new' | 'due' | 'learning' | 'known';

/** A word counts as learnt once its next review is three weeks or more away. */
const KNOWN_DAYS = 21;
/** Words in one review session. */
export const SESSION_SIZE = 20;
/** A quiz needs this many other meanings to choose from. */
export const DISTRACTORS = 3;

// No same-day learning steps: a 4-choice quiz is easy, minutes-apart repeats would nag.
const scheduler = fsrs({ enable_fuzz: false, enable_short_term: false });

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function isReviewState(v: unknown): v is ReviewState {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    isNum(r.due) &&
    isNum(r.stability) &&
    isNum(r.difficulty) &&
    isNum(r.elapsedDays) &&
    isNum(r.scheduledDays) &&
    isNum(r.reps) &&
    isNum(r.lapses) &&
    (r.state === 0 || r.state === 1 || r.state === 2 || r.state === 3) &&
    (r.lastReview === undefined || isNum(r.lastReview))
  );
}

function toCard(r: ReviewState): Card {
  return {
    due: new Date(r.due),
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: r.elapsedDays,
    scheduled_days: r.scheduledDays,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state,
    ...(r.lastReview !== undefined ? { last_review: new Date(r.lastReview) } : {}),
  };
}

function fromCard(c: Card): ReviewState {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as ReviewState['state'],
    ...(c.last_review ? { lastReview: c.last_review.getTime() } : {}),
  };
}

/** Needs review now: never reviewed, or its review date has come. */
export function isDue(entry: VocabEntry, now: number): boolean {
  return !entry.review || entry.review.due <= now;
}

export function statusOf(entry: VocabEntry, now: number): VocabStatus {
  const r = entry.review;
  if (!r) return 'new';
  if (r.due <= now) return 'due';
  return r.state === 2 && r.scheduledDays >= KNOWN_DAYS ? 'known' : 'learning';
}

/** Words that can be quizzed: they have a Vietnamese meaning to choose. */
export function quizzable(entries: readonly VocabEntry[]): VocabEntry[] {
  return entries.filter((e) => !!e.vi);
}

/** Today's session: overdue words first (oldest due first), then new ones (oldest saved). */
export function reviewQueue(entries: readonly VocabEntry[], now: number): VocabEntry[] {
  const due = quizzable(entries).filter((e) => isDue(e, now));
  const old = due
    .filter((e) => e.review)
    .sort((a, b) => (a.review?.due ?? 0) - (b.review?.due ?? 0));
  const fresh = due.filter((e) => !e.review).sort((a, b) => a.addedAt - b.addedAt);
  return [...old, ...fresh].slice(0, SESSION_SIZE);
}

/** Can a quiz be made: enough other meanings to choose from. */
export function canQuiz(entries: readonly VocabEntry[]): boolean {
  return new Set(quizzable(entries).map((e) => e.vi)).size > DISTRACTORS;
}

/** The answer schedules the word: right = Good, wrong = Again. */
export function scheduleAnswer(
  entry: VocabEntry,
  correct: boolean,
  now: number,
): { entry: VocabEntry; nextInMs: number } {
  const card = entry.review ? toCard(entry.review) : createEmptyCard(new Date(now));
  const next = scheduler.next(card, new Date(now), correct ? Rating.Good : Rating.Again).card;
  const review = fromCard(next);
  return { entry: { ...entry, review }, nextInMs: Math.max(0, review.due - now) };
}

export interface Quiz {
  choices: string[];
  answer: number;
}

/** Four Vietnamese meanings: the word's own and three from other saved words. */
export function makeQuiz(
  target: VocabEntry,
  pool: readonly VocabEntry[],
  random: () => number = Math.random,
): Quiz | null {
  if (!target.vi) return null;
  const others = [...new Set(quizzable(pool).map((e) => e.vi ?? ''))].filter(
    (v) => v && v !== target.vi,
  );
  if (others.length < DISTRACTORS) return null;
  const shuffle = <T>(list: T[]): T[] => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j] as T, a[i] as T];
    }
    return a;
  };
  const choices = shuffle([target.vi, ...shuffle(others).slice(0, DISTRACTORS)]);
  return { choices, answer: choices.indexOf(target.vi) };
}

/** "1 phút", "10 phút", "3 giờ", "2 ngày", "4 tháng", "1 năm". */
export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} phút`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ngày`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} tháng`;
  return `${Math.round(days / 365)} năm`;
}
