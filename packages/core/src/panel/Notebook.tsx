import { useMemo, useRef, useState } from 'react';
import type { DictPos } from '../dict';
import {
  canQuiz,
  DISTRACTORS,
  isDue,
  markContext,
  quizzable,
  reviewQueue,
  statusOf,
  videoLink,
  vocabToAnki,
  vocabToCsv,
  streakOf,
  weekCount,
  type ReviewLog,
  type VocabEntry,
  type VocabStatus,
} from '../vocab';
import { formatTimestamp } from '../parsers/text-utils';
import { canUse } from '../features';
import { vi } from './strings';

/** Word colour by class, as in the word card. */
const HEAD_COLOUR: Partial<Record<DictPos, string>> = {
  noun: 'text-pos-noun',
  verb: 'text-pos-verb',
  adj: 'text-pos-adjective',
  adv: 'text-pos-adverb',
  pron: 'text-pos-pronoun',
};

type Filter = 'all' | 'due' | 'learning' | 'known';

const STATUS_DOT: Record<VocabStatus, string> = {
  new: 'bg-subtle',
  due: 'bg-accent',
  learning: 'bg-pos-noun',
  known: 'bg-ok-fg',
};

export interface NotebookProps {
  entries: readonly VocabEntry[] | null;
  /** The video open in the page, for the "Video này" filter and in-page jumps. */
  videoId: string | null;
  onRemove(id: string): void;
  /** Jump to the sentence in the open video; returns false when it is another video. */
  onJump(entry: VocabEntry): boolean;
  /** Starts today's review; undefined hides the review banner. */
  onStartReview?: (queue: VocabEntry[]) => void;
  /** Answers per day, for the streak and the weekly count (with review on). */
  reviewLog?: ReviewLog;
  /** Backup file text; undefined hides backup. */
  onBackup?: () => string;
  /** Text of a backup file the learner picked. */
  onRestore?: (text: string) => void;
  /** Clock for statuses (tests). */
  now?: number;
}

function posLabel(pos: DictPos, headword: string): string {
  return pos === 'verb' && headword.includes(' ') ? vi.phrasalVerb : vi.dictPos[pos];
}

/** Saves text as a file through a temporary link (nothing leaves the device). */
function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function matches(e: VocabEntry, q: string): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  return e.headword.includes(s) || (e.vi ?? '').toLowerCase().includes(s);
}

/** "Sổ từ vựng" tab (UI spec: VocabDark / VocabLight). */
export function Notebook({
  entries,
  videoId,
  onRemove,
  onJump,
  onStartReview,
  reviewLog,
  onBackup,
  onRestore,
  now: nowProp,
}: NotebookProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Statuses are read when the tab opens (it remounts each time).
  const [openedAt] = useState(() => Date.now());
  const now = nowProp ?? openedAt;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [onlyVideo, setOnlyVideo] = useState(false);
  const [menu, setMenu] = useState(false);
  const all = useMemo(() => entries ?? [], [entries]);
  const inVideo = useMemo(
    () => all.filter((e) => !!videoId && e.context?.videoId === videoId),
    [all, videoId],
  );
  const reviewing = !!onStartReview;
  const count = (st: VocabStatus) => all.filter((e) => statusOf(e, now) === st).length;
  const dueList = all.filter((e) => isDue(e, now));
  const queue = reviewing ? reviewQueue(all, now) : [];
  const quizReady = canQuiz(all);
  const streak = reviewLog ? streakOf(reviewLog, now) : 0;
  const week = reviewLog ? weekCount(reviewLog, now) : 0;
  const missing = DISTRACTORS + 1 - new Set(quizzable(all).map((e) => e.vi)).size;
  const base =
    filter === 'due'
      ? dueList
      : filter === 'learning' || filter === 'known'
        ? all.filter((e) => statusOf(e, now) === filter)
        : all;
  const shown = base
    .filter((e) => !onlyVideo || (!!videoId && e.context?.videoId === videoId))
    .filter((e) => matches(e, query.trim()));
  const segments: { id: Filter; label: string; n: number }[] = [
    { id: 'all', label: vi.vocabSegAll, n: all.length },
    { id: 'due', label: vi.vocabStatus.due, n: dueList.length },
    { id: 'learning', label: vi.vocabStatus.learning, n: count('learning') },
    { id: 'known', label: vi.vocabStatus.known, n: count('known') },
  ];

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="sl-notebook"
      // The export menu closes on a click elsewhere or on Esc.
      onPointerDownCapture={(e) => {
        if (menu && !menuRef.current?.contains(e.target as Node)) setMenu(false);
      }}
      onKeyDown={(e) => {
        if (menu && e.key === 'Escape') {
          e.stopPropagation();
          setMenu(false);
        }
      }}
    >
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-line px-4 py-3">
        {reviewing && all.length > 0 && quizReady && queue.length > 0 && (
          <div
            className="flex items-center gap-3 rounded-xl border border-chip-edge bg-chip-bg px-3.5 py-3"
            data-testid="sl-review-banner"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-fg">{vi.vocabDue(queue.length)}</div>
              <div className="text-xs text-secondary">
                {vi.vocabDueTime(Math.max(1, Math.ceil((queue.length * 15) / 60)))}
                {streak >= 2 ? ` · ${vi.vocabStreak(streak)}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onStartReview(queue)}
              className="h-9 rounded-[10px] bg-accent px-4 text-[13px] font-semibold whitespace-nowrap text-[#15171c] hover:brightness-105"
              data-testid="sl-review-start"
            >
              {vi.startReview}
            </button>
          </div>
        )}
        {reviewing && all.length > 0 && !quizReady && (
          <p className="text-xs leading-normal text-secondary" data-testid="sl-review-need-more">
            {vi.vocabNeedMore(missing)}
          </p>
        )}
        <div className="flex items-center gap-2">
          <label className="flex h-[34px] min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-chip-off bg-bg px-3 text-subtle">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={vi.vocabSearch}
              aria-label={vi.vocabSearch}
              className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-fg outline-none placeholder:text-subtle"
              data-testid="sl-vocab-search"
            />
          </label>
          {canUse('vocabExport') && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenu(!menu)}
                aria-expanded={menu}
                aria-haspopup="menu"
                disabled={all.length === 0 && !onRestore}
                className="flex h-[34px] items-center gap-1.5 rounded-[10px] border border-chip-off px-3 text-xs font-medium whitespace-nowrap text-fg hover:bg-surface disabled:opacity-50"
                data-testid="sl-vocab-export"
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
                  <path d="M12 4v11" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M5 20h14" />
                </svg>
                {vi.vocabExport}
              </button>
              {menu && (
                <div
                  role="menu"
                  className="absolute top-[38px] right-0 z-10 flex w-56 flex-col rounded-xl border border-edge bg-card p-1 shadow-panel"
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={all.length === 0}
                    className="rounded-lg px-3 py-2 text-left text-[13px] hover:bg-surface disabled:opacity-50"
                    onClick={() => {
                      setMenu(false);
                      download(`shadowlingo-tu-vung-${today()}.csv`, vocabToCsv(all), 'text/csv');
                    }}
                    data-testid="sl-vocab-export-csv"
                  >
                    {vi.vocabExportCsv}
                    <span className="block text-[11px] text-subtle">{vi.vocabExportCsvHint}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={all.length === 0}
                    className="rounded-lg px-3 py-2 text-left text-[13px] hover:bg-surface disabled:opacity-50"
                    onClick={() => {
                      setMenu(false);
                      download(`shadowlingo-anki-${today()}.txt`, vocabToAnki(all), 'text/plain');
                    }}
                    data-testid="sl-vocab-export-anki"
                  >
                    {vi.vocabExportAnki}
                    <span className="block text-[11px] text-subtle">{vi.vocabExportAnkiHint}</span>
                  </button>
                  {onBackup && (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={all.length === 0}
                      className="rounded-lg border-t border-line px-3 py-2 text-left text-[13px] hover:bg-surface disabled:opacity-50"
                      onClick={() => {
                        setMenu(false);
                        download(
                          `shadowlingo-sao-luu-${today()}.json`,
                          onBackup(),
                          'application/json',
                        );
                      }}
                      data-testid="sl-vocab-backup"
                    >
                      {vi.backupExport}
                      <span className="block text-[11px] text-subtle">{vi.backupExportHint}</span>
                    </button>
                  )}
                  {onRestore && (
                    <button
                      type="button"
                      role="menuitem"
                      className="rounded-lg px-3 py-2 text-left text-[13px] hover:bg-surface"
                      onClick={() => {
                        setMenu(false);
                        fileRef.current?.click();
                      }}
                      data-testid="sl-vocab-restore"
                    >
                      {vi.backupRestore}
                      <span className="block text-[11px] text-subtle">{vi.backupRestoreHint}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {reviewing && (
          <div
            className="flex rounded-[10px] border border-chip-off p-0.5"
            role="group"
            aria-label={vi.vocabFilterLabel}
          >
            {segments.map((seg) => (
              <button
                key={seg.id}
                type="button"
                aria-pressed={filter === seg.id}
                onClick={() => setFilter(seg.id)}
                className={
                  'flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1.5 text-xs whitespace-nowrap transition-colors duration-150 ' +
                  (filter === seg.id
                    ? 'bg-chip-bg font-semibold text-chip-fg'
                    : 'font-medium text-secondary hover:text-fg')
                }
                data-testid={`sl-vocab-${seg.id}`}
              >
                {seg.label} <span className="text-[11px] tabular-nums opacity-70">{seg.n}</span>
              </button>
            ))}
          </div>
        )}
        {videoId && inVideo.length > 0 && inVideo.length < all.length && (
          <label className="flex items-center gap-2 self-start text-xs text-secondary">
            <input
              type="checkbox"
              checked={onlyVideo}
              onChange={(e) => setOnlyVideo(e.target.checked)}
              className="size-4 accent-[#f5b544]"
              data-testid="sl-vocab-video"
            />
            {vi.vocabThisVideo(inVideo.length)}
          </label>
        )}
      </div>

      <ul
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3"
        aria-label={vi.vocabListLabel}
        data-testid="sl-vocab-list"
      >
        {entries === null && <li className="text-[13px] text-secondary">{vi.vocabLoading}</li>}
        {entries !== null && all.length === 0 && (
          <li className="text-[13px] leading-normal text-secondary" data-testid="sl-vocab-empty">
            {vi.vocabEmpty}
          </li>
        )}
        {all.length > 0 && shown.length === 0 && (
          <li className="text-[13px] text-secondary">{vi.vocabNoMatch}</li>
        )}
        {shown.map((e) => {
          const ctx = e.context ? markContext(e.context) : null;
          const link = videoLink(e.context);
          return (
            <li
              key={e.id}
              className="flex flex-col gap-1 rounded-xl border border-edge bg-card px-3.5 py-3"
              data-testid="sl-vocab-item"
              data-id={e.id}
            >
              <div className="flex items-baseline gap-2">
                <span
                  className={
                    'text-[16px] leading-[22px] font-bold ' +
                    ((e.pos && HEAD_COLOUR[e.pos]) || 'text-fg')
                  }
                >
                  {e.headword}
                </span>
                {e.ipa && <span className="font-ipa text-[12px] text-ipa">/{e.ipa}/</span>}
                {e.pos && (
                  <span className="text-[11px] text-secondary">{posLabel(e.pos, e.headword)}</span>
                )}
                <span
                  className="ml-auto flex items-center gap-[5px] text-[11px] whitespace-nowrap text-secondary"
                  data-testid="sl-vocab-status"
                >
                  <span
                    className={'size-2 rounded-full ' + STATUS_DOT[statusOf(e, now)]}
                    aria-hidden="true"
                  />
                  {vi.vocabStatus[statusOf(e, now)]}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(e.id)}
                  aria-label={vi.vocabRemove(e.headword)}
                  title={vi.vocabRemoveTitle}
                  className="flex size-7 flex-none items-center justify-center self-center rounded-lg text-subtle hover:bg-surface hover:text-fg"
                  data-testid="sl-vocab-remove"
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
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M6 6l1 14h10l1-14" />
                  </svg>
                </button>
              </div>
              {e.vi && (
                <div className="text-[13px] text-fg" lang="vi">
                  {e.vi}
                </div>
              )}
              {ctx && (
                <div className="text-[12.5px] leading-normal text-muted" lang="en">
                  “{ctx[0]}
                  <b className="font-semibold text-fg">{ctx[1]}</b>
                  {ctx[2]}”
                </div>
              )}
              {link && e.context && (
                <a
                  href={link}
                  onClick={(ev) => {
                    if (e.context && onJump(e)) ev.preventDefault();
                  }}
                  className="flex items-center gap-1.5 self-start text-[11px] text-link no-underline hover:underline"
                  data-testid="sl-vocab-jump"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M3 2 L10 6 L3 10 Z" fill="currentColor" />
                  </svg>
                  <span className="truncate">
                    {formatTimestamp(e.context.start)}
                    {e.context.title ? ` · ${e.context.title}` : ''}
                  </span>
                </a>
              )}
            </li>
          );
        })}
      </ul>

      {onRestore && (
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => onRestore(String(reader.result ?? ''));
            reader.readAsText(file);
          }}
          data-testid="sl-vocab-restore-file"
        />
      )}
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-4 py-2 text-[11px] leading-4 text-secondary">
        <span data-testid="sl-vocab-count">
          {reviewing ? vi.vocabCountKnown(all.length, count('known')) : vi.vocabCount(all.length)}
          {reviewing && week > 0 ? ` · ${vi.vocabWeek(week)}` : ''}
        </span>
        <span>{vi.vocabLocalOnly}</span>
      </footer>
    </div>
  );
}
