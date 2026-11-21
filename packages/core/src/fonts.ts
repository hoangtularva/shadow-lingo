/**
 * Bundled fonts (OFL-1.1, from @fontsource). @font-face rules do not work inside a shadow
 * root, so the host app injects the CSS from `buildFontFaceCss` into the document and serves
 * the files itself. Family names are prefixed to avoid clashing with page fonts.
 */

export const FONT_FAMILY_TEXT = 'SL Be Vietnam Pro';
export const FONT_FAMILY_IPA = 'SL Noto Sans';

const RANGES = {
  vietnamese:
    'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
} as const;

type Subset = keyof typeof RANGES;

export interface FontFile {
  family: string;
  weight: number;
  subset: Subset;
  /** Package that ships the file, e.g. "@fontsource/be-vietnam-pro". */
  pkg: string;
  /** File name inside `<pkg>/files/`; also the served file name. */
  file: string;
}

const TEXT_WEIGHTS = [400, 500, 600, 700] as const;
const TEXT_SUBSETS: Subset[] = ['vietnamese', 'latin-ext', 'latin'];

export const FONT_FILES: readonly FontFile[] = [
  ...TEXT_WEIGHTS.flatMap((weight) =>
    TEXT_SUBSETS.map((subset) => ({
      family: FONT_FAMILY_TEXT,
      weight,
      subset,
      pkg: '@fontsource/be-vietnam-pro',
      file: `be-vietnam-pro-${subset}-${weight}-normal.woff2`,
    })),
  ),
  ...(['latin-ext', 'latin'] as const).map((subset) => ({
    family: FONT_FAMILY_IPA,
    weight: 400,
    subset,
    pkg: '@fontsource/noto-sans',
    file: `noto-sans-${subset}-400-normal.woff2`,
  })),
];

function cssString(value: string): string {
  return `"${value.replace(/["\\\n]/g, '')}"`;
}

/** Builds @font-face rules; `resolveUrl` maps a file name to a URL the page can load. */
export function buildFontFaceCss(resolveUrl: (file: string) => string): string {
  return FONT_FILES.map(
    (f) =>
      `@font-face{font-family:${cssString(f.family)};font-style:normal;font-display:swap;` +
      `font-weight:${f.weight};src:url(${cssString(resolveUrl(f.file))}) format("woff2");` +
      `unicode-range:${RANGES[f.subset]};}`,
  ).join('\n');
}
