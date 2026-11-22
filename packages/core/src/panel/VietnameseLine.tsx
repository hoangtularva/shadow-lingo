import { useState, type KeyboardEvent } from 'react';
import type { Translation, TranslatorState } from '../adapters';
import { vi } from './strings';

export interface VietnameseLineProps {
  translation: Translation | undefined;
  translator: TranslatorState;
  progress: number | null;
  onDownload(): void;
  /** Saves the learner's own Vietnamese; without it there is no pencil. */
  onEdit?: (vi: string) => void;
}

function Pencil() {
  return (
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

/**
 * The Vietnamese line of the spoken sentence (UI spec): 15px under the words, with a
 * pencil to correct it. Before the first use it offers to download the language pack.
 */
export function VietnameseLine({
  translation,
  translator,
  progress,
  onDownload,
  onEdit,
}: VietnameseLineProps) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft !== null && onEdit) {
    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        setDraft(null);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (draft.trim()) onEdit(draft);
        setDraft(null);
      }
    };
    return (
      <div className="flex flex-col gap-1">
        <textarea
          className="min-h-[44px] w-full resize-y rounded-lg border border-accent bg-surface px-2.5 py-2 text-[15px] leading-[22px] text-fg outline-none"
          aria-label={vi.editTranslationLabel}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setDraft(null)}
          autoFocus
          rows={2}
          data-testid="sl-vi-edit"
        />
        <span className="text-[11px] leading-4 text-subtle">{vi.editTranslationHint}</span>
      </div>
    );
  }

  if (translation) {
    return (
      <div className="flex items-start gap-2">
        <p
          className="min-w-0 flex-1 text-[15px] leading-[22px] text-fg"
          lang="vi"
          data-testid="sl-vi-spoken"
          data-source={translation.source}
        >
          {translation.vi}
        </p>
        {onEdit && (
          <button
            type="button"
            className="flex size-7 flex-none items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-fg"
            aria-label={vi.editTranslation}
            title={vi.editTranslation}
            onClick={() => setDraft(translation.vi)}
            data-testid="sl-vi-edit-button"
          >
            <Pencil />
          </button>
        )}
      </div>
    );
  }

  if (translator === 'needs-download') {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          className="h-8 rounded-lg border border-chip-off bg-transparent px-3 text-xs font-medium text-fg hover:border-accent"
          onClick={onDownload}
          data-testid="sl-vi-download"
        >
          {vi.downloadTranslator}
        </button>
        <span className="text-[11px] leading-4 text-subtle">{vi.downloadTranslatorHint}</span>
      </div>
    );
  }

  if (translator === 'downloading') {
    return (
      <p className="text-xs text-secondary" role="status" data-testid="sl-vi-downloading">
        {vi.translatorDownloading(Math.round((progress ?? 0) * 100))}
      </p>
    );
  }

  return null;
}
