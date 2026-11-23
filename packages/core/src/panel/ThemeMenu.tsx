import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { ThemeMode } from './store';
import { vi } from './strings';

function ThemeIcon({ mode, size }: { mode: ThemeMode; size: number }) {
  if (mode === 'light') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (mode === 'dark') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
    </svg>
  );
}

const MODES: readonly ThemeMode[] = ['auto', 'light', 'dark'];

export interface ThemeMenuProps {
  mode: ThemeMode;
  onChange(mode: ThemeMode): void;
  /** Name of the "follow" choice: "Theo YouTube" on YouTube, "Theo hệ thống" in the apps. */
  autoLabel: string;
  /**
   * "panel": 32px icon button in the panel header; "bar": 40px bordered button in a top bar;
   * "touch": 44px borderless button in a phone's top bar.
   */
  variant?: 'panel' | 'bar' | 'touch';
  /**
   * "sheet": the menu rises from the bottom of the screen instead of dropping down, so it never
   * covers a video player right under the button (phones).
   */
  placement?: 'below' | 'sheet';
}

/** Light / dark / follow button with its menu (UI spec: ThemeMenuDark/Light). */
export function ThemeMenu({
  mode,
  onChange,
  autoLabel,
  variant = 'panel',
  placement = 'below',
}: ThemeMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const label = (m: ThemeMode) =>
    m === 'auto' ? autoLabel : m === 'light' ? vi.themeLight : vi.themeDark;

  // Close on a click anywhere else (inside a shadow root too: composedPath sees through it).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !e.composedPath().includes(root.current)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    }
  };

  const choose = (m: ThemeMode) => {
    onChange(m);
    setOpen(false);
    button.current?.focus();
  };

  const bar = variant === 'bar';
  return (
    <div className="relative" ref={root} onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        className={
          'flex shrink-0 items-center justify-center ' +
          (bar
            ? 'size-10 rounded-xl border '
            : variant === 'touch'
              ? 'size-11 rounded-xl '
              : 'size-8 rounded-lg ') +
          (open
            ? 'border-chip-edge bg-chip-bg text-chip-fg'
            : bar
              ? 'border-chip-off text-secondary hover:bg-surface hover:text-fg'
              : 'text-secondary hover:bg-surface hover:text-fg')
        }
        aria-label={vi.themeAria(label(mode))}
        title={vi.themeButton}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        data-testid="sl-theme"
        data-mode={mode}
      >
        <ThemeIcon mode={mode} size={variant === 'panel' ? 16 : 18} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={vi.themeTitle}
          className={
            'z-30 flex flex-col rounded-xl border border-edge bg-card p-1.5 shadow-panel ' +
            (placement === 'sheet'
              ? 'fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))]'
              : 'absolute top-full right-0 mt-2 w-[220px]')
          }
          data-testid="sl-theme-menu"
        >
          <div className="px-2.5 pt-2 pb-1.5 text-xs font-semibold text-secondary">
            {vi.themeTitle}
          </div>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="menuitemradio"
              aria-checked={m === mode}
              className={
                'flex h-11 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium text-fg ' +
                (m === mode ? 'bg-surface' : 'hover:bg-surface')
              }
              onClick={() => choose(m)}
              data-testid={`sl-theme-${m}`}
            >
              <ThemeIcon mode={m} size={18} />
              <span className="flex-1">{label(m)}</span>
              {m === mode && (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-chip-edge"
                  aria-hidden="true"
                >
                  <path d="M5 12l5 5L19 8" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
