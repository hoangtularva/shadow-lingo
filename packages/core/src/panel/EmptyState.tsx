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
}

function useCaptionsState(captions: CaptionsAdapter | null | undefined): CaptionsState {
  const [state, setState] = useState<CaptionsState>(() => captions?.getState() ?? 'unknown');
  useEffect(() => captions?.onChange(setState), [captions]);
  return state;
}

/** Reminds the learner to turn on the player's captions, with a button that does it. */
function CaptionsReminder({ captions }: { captions: CaptionsAdapter | null | undefined }) {
  const state = useCaptionsState(captions);
  if (!captions || state === 'unknown') return null;
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

export function EmptyState({ status, onText, captions }: EmptyStateProps) {
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
      <div>
        <p className="text-sm font-semibold">{vi.waitingTitle}</p>
        <p className="mt-1 text-sm text-muted">
          {status === 'waiting' ? vi.waitingHint : vi.idleHint}
        </p>
      </div>
      {status === 'waiting' && <CaptionsReminder captions={captions} />}
      {canUse('pasteTranscript') && (
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
      {canUse('openSubtitleFile') && (
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
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
