import { useEffect, useId, useState, type ChangeEvent } from 'react';
import type { CaptionsAdapter, CaptionsState } from '../adapters';
import { canUse } from '../features';
import { vi } from './strings';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Reads a user-picked file as text (FileReader fallback for older engines). */
export function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsText(file);
  });
}

export interface EmptyStateProps {
  status: 'idle' | 'waiting';
  /** Returns an error message (Vietnamese) or null on success. */
  onText(text: string, source: 'paste' | 'file'): string | null;
  /** The player's CC switch, to remind the learner to turn captions on. */
  captions?: CaptionsAdapter | null;
  /** Show paste / open file right away (the user picked "Dùng nguồn khác"). */
  otherSourcesOpen?: boolean;
  /** Starts "Đọc chữ trên hình" (when the platform can read video frames). */
  onStartOcr?: () => void;
}

function useCaptionsState(captions: CaptionsAdapter | null | undefined): CaptionsState {
  const [state, setState] = useState<CaptionsState>(() => captions?.getState() ?? 'unknown');
  useEffect(() => captions?.onChange(setState), [captions]);
  return state;
}

/** Reminds the learner to turn on the player's captions, with a button that does it. */
function CaptionsReminder({ captions }: { captions: CaptionsAdapter | null | undefined }) {
  const state = useCaptionsState(captions);
  if (!captions || state === 'unknown') {
    return <p className="text-sm text-muted">{vi.waitingHint}</p>;
  }
  if (state === 'on') {
    return (
      <p className="text-xs text-secondary" data-testid="sl-cc-waiting">
        {vi.ccOnWaiting}
      </p>
    );
  }
  return (
    <div
      className="flex flex-col items-start gap-2.5 rounded-[10px] bg-tip-bg px-3 py-2.5"
      role="status"
      data-testid="sl-cc-off"
    >
      <p className="text-[12.5px] leading-normal text-tip-fg">{vi.ccOff}</p>
      <button
        type="button"
        className="h-9 rounded-lg bg-accent px-3 text-sm font-semibold text-[#15171c] hover:brightness-105 active:brightness-95"
        onClick={() => captions.turnOn()}
        data-testid="sl-cc-on"
      >
        {vi.ccTurnOn}
      </button>
    </div>
  );
}

export function EmptyState({
  status,
  onText,
  captions,
  otherSourcesOpen,
  onStartOcr,
}: EmptyStateProps) {
  const [open, setOpen] = useState(status === 'idle' || otherSourcesOpen === true);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileId = useId();

  const submit = () => {
    if (!text.trim()) return setError(vi.emptyPaste);
    const err = onText(text, 'paste');
    setError(err);
    if (!err) setText('');
  };

  const openFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return setError(vi.fileTooLarge);
    try {
      setError(onText(await readFileText(file), 'file'));
    } catch {
      setError(vi.parseFailed);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4" data-testid="sl-empty">
      <p className="text-sm font-semibold">{vi.waitingTitle}</p>
      {status === 'waiting' ? (
        <CaptionsReminder captions={captions} />
      ) : (
        <p className="text-sm text-muted">{vi.idleHint}</p>
      )}
      {!open && (canUse('pasteTranscript') || canUse('openSubtitleFile')) && (
        <button
          type="button"
          className="self-start rounded-md px-2 py-1 text-xs text-secondary hover:bg-surface hover:text-fg"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          data-testid="sl-empty-other"
        >
          {vi.useOtherSource}
        </button>
      )}
      {open && canUse('pasteTranscript') && (
        <>
          <textarea
            className="h-28 w-full resize-y rounded-lg border border-line bg-surface p-3 text-sm text-fg outline-none placeholder:text-muted focus:border-accent"
            placeholder={vi.pastePlaceholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            data-testid="sl-paste"
          />
          <button
            type="button"
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-[#171A20] hover:brightness-105 active:brightness-95"
            onClick={submit}
            data-testid="sl-paste-submit"
          >
            {vi.pasteSubmit}
          </button>
        </>
      )}
      {open && canUse('openSubtitleFile') && (
        <label
          htmlFor={fileId}
          className="cursor-pointer rounded-lg border border-line px-3 py-2 text-center text-sm font-medium hover:border-accent"
        >
          {vi.openFile}
          <input
            id={fileId}
            type="file"
            accept=".srt,.vtt,.txt,text/vtt,application/x-subrip,text/plain"
            className="sr-only"
            onChange={(e) => void openFile(e)}
            data-testid="sl-file"
          />
        </label>
      )}
      {open && onStartOcr && canUse('ocr') && (
        <button
          type="button"
          className="flex items-start gap-2.5 rounded-[10px] border border-chip-edge bg-chip-bg px-3.5 py-2.5 text-left text-chip-fg hover:brightness-105"
          onClick={onStartOcr}
          data-testid="sl-ocr-start"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M7 15h10" />
            <path d="M9 12h6" />
          </svg>
          <span className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold">
              {vi.ocrOption}{' '}
              <span className="font-medium text-secondary">{vi.ocrExperimental}</span>
            </span>
            <span className="text-xs leading-normal text-secondary">{vi.ocrOptionHint}</span>
          </span>
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
