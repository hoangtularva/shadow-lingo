/** Logo concept A: amber speech bubble, offset shadow, ‿ linking mark. */
export const LOGO_BUBBLE_PATH =
  'M34 14H86A22 22 0 0 1 108 36V66A22 22 0 0 1 86 88H54L32 108L36 88H34A22 22 0 0 1 12 66V36A22 22 0 0 1 34 14Z';
export const LOGO_SMILE_PATH = 'M40 48Q64 76 88 48';

export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden="true" focusable="false">
      <path
        d={LOGO_BUBBLE_PATH}
        transform="translate(8 8)"
        style={{ fill: 'var(--sl-logo-shadow, #3A3F48)' }}
      />
      <path d={LOGO_BUBBLE_PATH} fill="#F5B544" />
      <path
        d={LOGO_SMILE_PATH}
        fill="none"
        stroke="#3A3F48"
        strokeWidth={11}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5 select-none">
      <LogoMark size={24} />
      {/* Narrow panels keep the logo only, so the source badge stays readable. */}
      <span className="text-base font-bold tracking-[-0.3px] @max-[440px]/panel:sr-only">
        Shadow<span className="text-brand">Lingo</span>
      </span>
    </span>
  );
}
