import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { MIN_REGION, regionPosition, type OcrPlacement, type OcrRegion } from '../ocr';
import type { OcrState } from './store';
import { vi } from './strings';

const pill =
  'h-7 rounded-[14px] border px-2.5 text-xs whitespace-nowrap pointer-coarse:h-8 pointer-coarse:rounded-2xl pointer-coarse:px-2.5 ';
const pillOn = 'border-chip-edge bg-chip-bg font-semibold text-chip-fg';
const pillOff = 'border-chip-off bg-transparent font-medium text-secondary hover:text-fg';

const PLACEMENTS: { id: OcrPlacement; label: string }[] = [
  { id: 'auto', label: vi.ocrAuto },
  { id: 'bottom', label: vi.ocrBottom },
  { id: 'top', label: vi.ocrTop },
  { id: 'custom', label: vi.ocrCustom },
];

function status(ocr: OcrState, count: number): string {
  if (ocr.placement === 'custom') return vi.ocrReadingCustom(count);
  if (ocr.placement === 'auto') {
    return ocr.found ? vi.ocrReadingAt(regionPosition(ocr.found), count) : vi.ocrReading(count);
  }
  return vi.ocrReadingAt(ocr.placement, count);
}

/**
 * "Đang đọc chữ trên hình": count, where the subtitles sit (found automatically, near the
 * bottom or top, or a region the learner drags), and stop. UI spec: OcrDark/Light,
 * OcrRegionDark/Light.
 */
export function OcrStrip({
  count,
  ocr,
  onChange,
  onStop,
}: {
  count: number;
  ocr: OcrState;
  onChange(ocr: Partial<OcrState>): void;
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
        {status(ocr, count)}
      </span>
      <button
        type="button"
        className={pill + pillOff + ' ml-auto'}
        onClick={onStop}
        data-testid="sl-ocr-stop"
      >
        {vi.ocrStop}
      </button>
      <div
        role="group"
        aria-label={vi.ocrPlacementGroup}
        className="flex w-full items-center gap-2"
      >
        <span className="text-xs text-secondary @max-[350px]/panel:hidden">{vi.ocrBandLabel}</span>
        {PLACEMENTS.map(({ id, label }) => {
          const on =
            id === 'custom'
              ? ocr.placement === 'custom' || ocr.editing
              : ocr.placement === id && !ocr.editing;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              {...(id === 'custom' ? { 'aria-expanded': ocr.editing } : {})}
              className={pill + (on ? pillOn : pillOff)}
              onClick={() =>
                id === 'custom'
                  ? onChange({ editing: !ocr.editing })
                  : onChange({ placement: id, editing: false })
              }
              data-testid={`sl-ocr-${id}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {ocr.editing ? (
        <RegionEditor
          initial={ocr.placement === 'custom' ? ocr.region : (ocr.found ?? ocr.region)}
          onDone={(region) => onChange({ placement: 'custom', region, editing: false })}
          onCancel={() => onChange({ editing: false })}
        />
      ) : (
        <p className="w-full text-[11px] text-subtle">{vi.ocrNote}</p>
      )}
    </div>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Moves one edge of `r` to `y` (0–1), keeping the region at least MIN_REGION tall. */
export function moveEdge(r: OcrRegion, edge: 'from' | 'to', y: number): OcrRegion {
  return edge === 'from'
    ? { from: clamp(y, 0, r.to - MIN_REGION), to: r.to }
    : { from: r.from, to: clamp(y, r.from + MIN_REGION, 1) };
}

/**
 * "Chọn vùng": a sketch of the video frame (no picture of it) with a band the learner drags to
 * cover the subtitles they see in the video beside the panel. Nothing is drawn over the video.
 */
function RegionEditor({
  initial,
  onDone,
  onCancel,
}: {
  initial: OcrRegion;
  onDone(region: OcrRegion): void;
  onCancel(): void;
}) {
  const [draft, setDraft] = useState<OcrRegion>(initial);
  const sketch = useRef<HTMLDivElement>(null);
  const drag = useRef<{ edge: 'from' | 'to' | 'band'; offset: number } | null>(null);

  const yAt = (clientY: number) => {
    const r = sketch.current?.getBoundingClientRect();
    return r && r.height > 0 ? (clientY - r.top) / r.height : 0;
  };
  const start = (e: PointerEvent<HTMLElement>) => {
    const edge = e.currentTarget.dataset.edge;
    if (edge !== 'from' && edge !== 'to' && edge !== 'band') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { edge, offset: yAt(e.clientY) - draft.from };
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const y = yAt(e.clientY);
    if (d.edge === 'band') {
      const h = draft.to - draft.from;
      const from = clamp(y - d.offset, 0, 1 - h);
      setDraft({ from, to: from + h });
    } else setDraft((r) => moveEdge(r, d.edge as 'from' | 'to', y));
  };
  const end = () => {
    drag.current = null;
  };
  const keys = (edge: 'from' | 'to') => (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const delta = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    if (!delta) return;
    e.preventDefault();
    e.stopPropagation();
    setDraft((r) => moveEdge(r, edge, r[edge] + delta));
  };

  const handle =
    'absolute left-1/2 flex h-5 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize touch-none items-center justify-center rounded-[10px] border border-chip-edge bg-accent p-0 pointer-coarse:h-7 pointer-coarse:w-14';
  const grip = (
    <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden="true">
      <path d="M2 2h14M2 6h14" stroke="#15171c" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

  return (
    <div className="mt-1 flex w-full flex-col gap-2.5" data-testid="sl-ocr-region">
      <p className="text-xs leading-normal text-secondary">
        {vi.ocrRegionHint}
        {/* Touch screens have no arrow keys. */}
        <span className="pointer-coarse:hidden"> {vi.ocrRegionKeys}</span>
      </p>
      <div
        ref={sketch}
        aria-label={vi.ocrRegionSketch}
        className="relative aspect-video w-full max-w-[406px] overflow-hidden rounded-[10px] border border-chip-off bg-sketch"
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <span className="absolute top-2.5 left-3 text-[11px] text-subtle">{vi.ocrRegionFrame}</span>
        <div
          className="absolute inset-x-0 flex cursor-grab touch-none items-center justify-center border-y-2 border-chip-edge bg-band"
          style={{ top: pct(draft.from), height: pct(draft.to - draft.from) }}
          onPointerDown={start}
          data-edge="band"
          data-testid="sl-ocr-band"
        >
          {/* A thin band has no room between its two handles for the label. */}
          {draft.to - draft.from >= 0.16 && (
            <span className="text-[11px] font-semibold text-chip-fg">{vi.ocrRegionBand}</span>
          )}
        </div>
        <button
          type="button"
          role="slider"
          aria-orientation="vertical"
          aria-label={vi.ocrRegionTopEdge}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(draft.from * 100)}
          aria-valuetext={vi.ocrRegionEdgeAt(Math.round(draft.from * 100))}
          className={handle}
          style={{ top: pct(draft.from) }}
          onPointerDown={start}
          data-edge="from"
          onKeyDown={keys('from')}
          data-testid="sl-ocr-edge-top"
        >
          {grip}
        </button>
        <button
          type="button"
          role="slider"
          aria-orientation="vertical"
          aria-label={vi.ocrRegionBottomEdge}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(draft.to * 100)}
          aria-valuetext={vi.ocrRegionEdgeAt(Math.round(draft.to * 100))}
          className={handle}
          style={{ top: pct(draft.to) }}
          onPointerDown={start}
          data-edge="to"
          onKeyDown={keys('to')}
          data-testid="sl-ocr-edge-bottom"
        >
          {grip}
        </button>
      </div>
      <p className="text-[11px] leading-normal text-subtle">{vi.ocrRegionNote}</p>
      <div className="flex gap-2">
        <button
          type="button"
          className="h-8 rounded-2xl bg-accent px-4 text-[13px] font-semibold text-[#15171c]"
          onClick={() => onDone(draft)}
          data-testid="sl-ocr-region-done"
        >
          {vi.ocrRegionDone}
        </button>
        <button
          type="button"
          className="h-8 rounded-2xl border border-chip-off px-3.5 text-[13px] font-medium text-secondary hover:text-fg"
          onClick={onCancel}
          data-testid="sl-ocr-region-cancel"
        >
          {vi.ocrRegionCancel}
        </button>
      </div>
    </div>
  );
}
