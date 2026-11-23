import type { OcrBand } from '../ocr';
import { vi } from './strings';

const pill = 'h-7 rounded-[14px] border px-2.5 text-xs whitespace-nowrap ';
const pillOn = 'border-chip-edge bg-chip-bg font-semibold text-chip-fg';
const pillOff = 'border-chip-off bg-transparent font-medium text-secondary hover:text-fg';

/** "Đang đọc chữ trên hình": count, where the subtitles sit, and stop (UI spec: OcrDark/Light). */
export function OcrStrip({
  count,
  band,
  onBand,
  onStop,
}: {
  count: number;
  band: OcrBand;
  onBand(band: OcrBand): void;
  onStop(): void;
}) {
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-shadow-bg px-4 py-2.5"
      role="status"
      aria-label={vi.ocrStripLabel}
      data-testid="sl-ocr"
    >
      <span
        className="size-2 rounded-full bg-accent motion-safe:animate-pulse"
        aria-hidden="true"
      />
      <span className="text-xs text-fg" data-testid="sl-ocr-count">
        {vi.ocrReading(count)}
      </span>
      <span className="ml-auto text-xs text-secondary @max-[440px]/panel:hidden">
        {vi.ocrBandLabel}
      </span>
      {/* Narrow panels: the buttons alone, so they stay on the first row. */}
      {(['bottom', 'top'] as const).map((b) => (
        <button
          key={b}
          type="button"
          aria-pressed={band === b}
          className={
            pill +
            (band === b ? pillOn : pillOff) +
            (b === 'bottom' ? ' @max-[440px]/panel:ml-auto' : '')
          }
          onClick={() => onBand(b)}
          data-testid={`sl-ocr-${b}`}
        >
          {b === 'bottom' ? vi.ocrBottom : vi.ocrTop}
        </button>
      ))}
      <button type="button" className={pill + pillOff} onClick={onStop} data-testid="sl-ocr-stop">
        {vi.ocrStop}
      </button>
      <p className="w-full text-[11px] text-subtle">{vi.ocrNote}</p>
    </div>
  );
}
