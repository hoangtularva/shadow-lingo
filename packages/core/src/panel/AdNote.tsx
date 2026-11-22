import { vi } from './strings';

export interface AdNoteProps {
  /** Words due for review; 0 hides the button. */
  dueCount: number;
  onReview?: () => void;
}

/** Shown while the player plays an ad (UI spec: AdNoteDark / AdNoteLight). */
export function AdNote({ dueCount, onReview }: AdNoteProps) {
  return (
    <div
      role="status"
      className="mx-4 mt-3.5 flex shrink-0 gap-3 rounded-[14px] border border-dashed border-chip-edge bg-chip-bg p-3.5"
      data-testid="sl-ad-note"
    >
      <div className="flex size-11 flex-none items-center justify-center rounded-xl bg-card text-chip-fg">
        <svg
          width="28"
          height="28"
          viewBox="0 0 32 32"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M8 13 L10.5 28 H21.5 L24 13" />
          <path d="M13 13 L14 28" />
          <path d="M19 13 L18 28" />
          <path d="M8 13a3 3 0 0 1 1-5.6A3.5 3.5 0 0 1 15.5 5a3.5 3.5 0 0 1 6 1.6A3 3 0 0 1 24 13z" />
        </svg>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-[14px] font-bold text-fg">
          {vi.adTitle}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="flex-none text-accent"
            aria-hidden="true"
          >
            <path d="M12 2l2.2 6.3L20.5 10l-6.3 2.2L12 18.5l-2.2-6.3L3.5 10l6.3-1.7z" />
          </svg>
        </p>
        <p className="text-[12.5px] leading-normal text-secondary">{vi.adBody}</p>
        {onReview && dueCount > 0 && (
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onReview}
              className="h-[30px] rounded-lg bg-accent px-3 text-xs font-semibold text-[#15171c] hover:brightness-105"
              data-testid="sl-ad-review"
            >
              {vi.adReview(dueCount)}
            </button>
            <span className="text-[11px] text-subtle">
              {vi.adReviewTime(Math.max(1, Math.ceil((dueCount * 15) / 60)))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
