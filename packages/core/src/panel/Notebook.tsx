import { useMemo, useState } from 'react';
import type { DictPos } from '../dict';
import { markContext, videoLink, vocabToAnki, vocabToCsv, type VocabEntry } from '../vocab';
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

type Filter = 'all' | 'video';

export interface NotebookProps {
  entries: readonly VocabEntry[] | null;
  /** The video open in the page, for the "Video này" filter and in-page jumps. */
  videoId: string | null;
  onRemove(id: string): void;
  /** Jump to the sentence in the open video; returns false when it is another video. */
  onJump(entry: VocabEntry): boolean;
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
export function Notebook({ entries, videoId, onRemove, onJump }: NotebookProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [menu, setMenu] = useState(false);
  const all = useMemo(() => entries ?? [], [entries]);
  const inVideo = useMemo(
    () => all.filter((e) => !!videoId && e.context?.videoId === videoId),
    [all, videoId],
  );
  const shown = (filter === 'video' ? inVideo : all).filter((e) => matches(e, query.trim()));

  const chip = (on: boolean) =>
    'h-7 rounded-[14px] border px-2.5 text-xs whitespace-nowrap transition-colors duration-150 ' +
    (on
      ? 'border-chip-edge bg-chip-bg font-semibold text-chip-fg'
      : 'border-chip-off bg-transparent font-medium text-secondary hover:text-fg');

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="sl-notebook">
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-line px-4 py-3">
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
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenu(!menu)}
                aria-expanded={menu}
                aria-haspopup="menu"
                disabled={all.length === 0}
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
                    className="rounded-lg px-3 py-2 text-left text-[13px] hover:bg-surface"
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
                    className="rounded-lg px-3 py-2 text-left text-[13px] hover:bg-surface"
                    onClick={() => {
                      setMenu(false);
                      download(`shadowlingo-anki-${today()}.txt`, vocabToAnki(all), 'text/plain');
                    }}
                    data-testid="sl-vocab-export-anki"
                  >
                    {vi.vocabExportAnki}
                    <span className="block text-[11px] text-subtle">{vi.vocabExportAnkiHint}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={filter === 'all'}
            className={chip(filter === 'all')}
            onClick={() => setFilter('all')}
            data-testid="sl-vocab-all"
          >
            {vi.vocabAll(all.length)}
          </button>
          {videoId && (
            <button
              type="button"
              aria-pressed={filter === 'video'}
              className={chip(filter === 'video')}
              onClick={() => setFilter('video')}
              data-testid="sl-vocab-video"
            >
              {vi.vocabThisVideo(inVideo.length)}
            </button>
          )}
        </div>
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
                <span className="ml-auto flex items-center gap-[5px] text-[11px] whitespace-nowrap text-secondary">
                  <span className="size-2 rounded-full bg-subtle" aria-hidden="true" />
                  {vi.vocabNew}
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

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-4 py-2 text-[11px] leading-4 text-secondary">
        <span data-testid="sl-vocab-count">{vi.vocabCount(all.length)}</span>
        <span>{vi.vocabLocalOnly}</span>
      </footer>
    </div>
  );
}
