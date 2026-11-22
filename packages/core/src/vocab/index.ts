import { isDictPos, type DictPos, type DictSense } from '../dict';
import { isReviewState, type ReviewState } from './review';

export * from './review';

/** Where a saved word was met: the sentence, the words it covers and the video moment. */
export interface VocabContext {
  text: string;
  /** Indexes of the sentence words the entry covers. */
  words: number[];
  /** Sentence start in ms (0 for untimed transcripts). */
  start: number;
  /** Empty for pasted transcripts. */
  videoId: string;
  title: string;
}

/** One word in the learner's notebook ("Sổ từ vựng"), kept on the device only. */
export interface VocabEntry {
  /** The headword: one entry per word or phrase. */
  id: string;
  headword: string;
  lemma?: string;
  ipa?: string;
  pos?: DictPos;
  vi?: string;
  viFrom?: 'wiktionary' | 'machine';
  senses: DictSense[];
  context?: VocabContext;
  /** ms since epoch. */
  addedAt: number;
  /** Review schedule; absent until the first quiz ("Mới"). */
  review?: ReviewState;
}

/** The notebook on the device (IndexedDB in the extension). */
export interface VocabStore {
  list(): Promise<VocabEntry[]>;
  put(entry: VocabEntry): Promise<void>;
  remove(id: string): Promise<void>;
  /** Answers per local day ("2026-11-22" → 12), for the streak and weekly count. */
  reviewLog(): Promise<ReviewLog>;
  logReview(day: string): Promise<void>;
}

export type ReviewLog = Record<string, number>;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(v: unknown): v is string {
  return typeof v === 'string' && DAY_KEY.test(v);
}

export function isReviewLog(v: unknown): v is ReviewLog {
  return (
    isRecord(v) &&
    Object.entries(v).every(([k, n]) => isDayKey(k) && Number.isInteger(n) && (n as number) >= 0)
  );
}

/** Local calendar day of a moment, as "YYYY-MM-DD". */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayBefore(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() - days);
  return d.getTime();
}

/** Days in a row with at least one answer, ending today (or yesterday, if not yet today). */
export function streakOf(log: ReviewLog, now: number): number {
  const start = (log[dayKey(now)] ?? 0) > 0 ? 0 : 1;
  let n = 0;
  while ((log[dayKey(dayBefore(now, start + n))] ?? 0) > 0) n += 1;
  return n;
}

/** Answers in the last seven days, today included. */
export function weekCount(log: ReviewLog, now: number): number {
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += log[dayKey(dayBefore(now, i))] ?? 0;
  return sum;
}

export const VOCAB_LIMITS = {
  headword: 100,
  text: 300,
  sentence: 1000,
  title: 300,
  senses: 3,
  words: 80,
} as const;

const VIDEO_ID = /^[\w-]{0,64}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isText(v: unknown, max: number, allowEmpty = false): v is string {
  return typeof v === 'string' && v.length <= max && (allowEmpty || v.length > 0);
}

function isSense(v: unknown): v is DictSense {
  return (
    isRecord(v) &&
    isDictPos(v.pos) &&
    isText(v.gloss, VOCAB_LIMITS.text) &&
    (v.example === undefined || isText(v.example, VOCAB_LIMITS.text))
  );
}

function isContext(v: unknown): v is VocabContext {
  return (
    isRecord(v) &&
    isText(v.text, VOCAB_LIMITS.sentence) &&
    Array.isArray(v.words) &&
    v.words.length <= VOCAB_LIMITS.words &&
    v.words.every((i) => Number.isInteger(i) && (i as number) >= 0) &&
    typeof v.start === 'number' &&
    Number.isFinite(v.start) &&
    v.start >= 0 &&
    typeof v.videoId === 'string' &&
    VIDEO_ID.test(v.videoId) &&
    isText(v.title, VOCAB_LIMITS.title, true)
  );
}

/** Checks an entry from storage or a message before it is used or saved. */
export function isVocabEntry(v: unknown): v is VocabEntry {
  return (
    isRecord(v) &&
    isText(v.id, VOCAB_LIMITS.headword) &&
    v.id === v.headword &&
    (v.lemma === undefined || isText(v.lemma, VOCAB_LIMITS.headword)) &&
    (v.ipa === undefined || isText(v.ipa, VOCAB_LIMITS.text)) &&
    (v.pos === undefined || isDictPos(v.pos)) &&
    (v.vi === undefined || isText(v.vi, VOCAB_LIMITS.text)) &&
    (v.viFrom === undefined || v.viFrom === 'wiktionary' || v.viFrom === 'machine') &&
    Array.isArray(v.senses) &&
    v.senses.length <= VOCAB_LIMITS.senses &&
    v.senses.every(isSense) &&
    (v.context === undefined || isContext(v.context)) &&
    typeof v.addedAt === 'number' &&
    Number.isFinite(v.addedAt) &&
    (v.review === undefined || isReviewState(v.review))
  );
}

/** Newest first. */
export function sortVocab(entries: readonly VocabEntry[]): VocabEntry[] {
  return [...entries].sort((a, b) => b.addedAt - a.addedAt);
}

/** In-memory notebook (tests, and hosts without storage). */
export function createMemoryVocabStore(
  initial: readonly VocabEntry[] = [],
  initialLog: ReviewLog = {},
): VocabStore {
  const rows = new Map(initial.map((e) => [e.id, e]));
  const log: ReviewLog = { ...initialLog };
  return {
    reviewLog: () => Promise.resolve({ ...log }),
    logReview(day) {
      log[day] = (log[day] ?? 0) + 1;
      return Promise.resolve();
    },
    list: () => Promise.resolve(sortVocab([...rows.values()])),
    put(entry) {
      rows.set(entry.id, entry);
      return Promise.resolve();
    },
    remove(id) {
      rows.delete(id);
      return Promise.resolve();
    },
  };
}

/** The video moment of a saved word, as a YouTube link (null for pasted transcripts). */
export function videoLink(context: VocabContext | undefined): string | null {
  if (!context?.videoId) return null;
  const t = Math.floor(context.start / 1000);
  return `https://www.youtube.com/watch?v=${encodeURIComponent(context.videoId)}${t > 0 ? `&t=${t}s` : ''}`;
}

/** The context sentence split around the saved words: [before, marked, after]. */
export function markContext(context: VocabContext): [string, string, string] {
  const words = context.text.split(/\s+/).filter(Boolean);
  const idx = context.words.filter((i) => i < words.length);
  if (idx.length === 0) return [context.text, '', ''];
  const first = Math.min(...idx);
  const last = Math.max(...idx);
  return [
    words.slice(0, first).join(' ') + (first > 0 ? ' ' : ''),
    words.slice(first, last + 1).join(' '),
    (last + 1 < words.length ? ' ' : '') + words.slice(last + 1).join(' '),
  ];
}

function csvCell(v: string): string {
  // Leading = + - @ would run as a formula in spreadsheets.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV for spreadsheets (UTF-8 with BOM so Excel shows Vietnamese correctly). */
export function vocabToCsv(entries: readonly VocabEntry[]): string {
  const head = [
    'word',
    'ipa',
    'part_of_speech',
    'vietnamese',
    'definition',
    'example',
    'sentence',
    'video',
    'added',
  ];
  const rows = entries.map((e) => [
    e.headword,
    e.ipa ?? '',
    e.pos ?? '',
    e.vi ?? '',
    e.senses[0]?.gloss ?? '',
    e.senses[0]?.example ?? '',
    e.context?.text ?? '',
    videoLink(e.context) ?? '',
    new Date(e.addedAt).toISOString().slice(0, 10),
  ]);
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tsvCell(s: string): string {
  return s.replace(/[\t\r\n]+/g, ' ');
}

/**
 * Anki import file (File › Import): tab-separated, HTML fields. Front = the word and the
 * sentence it was met in; back = Vietnamese, IPA and the definition.
 */
export function vocabToAnki(entries: readonly VocabEntry[]): string {
  const lines = ['#separator:tab', '#html:true', '#tags column:3'];
  for (const e of entries) {
    const ctx = e.context ? markContext(e.context) : null;
    const front =
      `<b>${escapeHtml(e.headword)}</b>` +
      (ctx
        ? `<br><i>${escapeHtml(ctx[0])}<u>${escapeHtml(ctx[1])}</u>${escapeHtml(ctx[2])}</i>`
        : '');
    const sense = e.senses[0];
    const back = [
      e.vi ? escapeHtml(e.vi) : '',
      e.ipa ? `/${escapeHtml(e.ipa)}/` : '',
      sense ? escapeHtml(sense.gloss) : '',
      sense?.example ? `<i>${escapeHtml(sense.example)}</i>` : '',
    ]
      .filter(Boolean)
      .join('<br>');
    lines.push([tsvCell(front), tsvCell(back), 'shadowlingo'].join('\t'));
  }
  return lines.join('\n') + '\n';
}

/** Backup file of the notebook (kept on the device; the learner chooses where). */
export interface VocabBackup {
  app: 'shadowlingo';
  kind: 'vocab';
  version: 1;
  exportedAt: number;
  entries: VocabEntry[];
  reviewLog: ReviewLog;
}

export function vocabToBackup(entries: readonly VocabEntry[], log: ReviewLog, now: number): string {
  const backup: VocabBackup = {
    app: 'shadowlingo',
    kind: 'vocab',
    version: 1,
    exportedAt: now,
    entries: [...entries],
    reviewLog: log,
  };
  return JSON.stringify(backup, null, 1);
}

/** Largest backup file read (about 20,000 words). */
export const MAX_BACKUP_BYTES = 30_000_000;

/** Reads a backup file; invalid words are skipped, a file that is not a backup gives null. */
export function parseBackup(text: string): { entries: VocabEntry[]; reviewLog: ReviewLog } | null {
  if (text.length > MAX_BACKUP_BYTES) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.app !== 'shadowlingo' || data.kind !== 'vocab') return null;
  if (!Array.isArray(data.entries)) return null;
  return {
    entries: data.entries.filter(isVocabEntry),
    reviewLog: isReviewLog(data.reviewLog) ? data.reviewLog : {},
  };
}

/** Words from a backup that should be saved: new ones, or ones reviewed more than ours. */
export function entriesToRestore(
  current: readonly VocabEntry[],
  incoming: readonly VocabEntry[],
): VocabEntry[] {
  const have = new Map(current.map((e) => [e.id, e]));
  return incoming.filter((e) => {
    const old = have.get(e.id);
    return !old || (e.review?.reps ?? 0) > (old.review?.reps ?? 0);
  });
}
