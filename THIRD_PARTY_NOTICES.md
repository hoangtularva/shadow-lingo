# Third-party notices

ShadowLingo bundles the following third-party software and assets. Each keeps its own license.

## Fonts

| Asset          | License                   | Source                                                                        |
| -------------- | ------------------------- | ----------------------------------------------------------------------------- |
| Be Vietnam Pro | SIL Open Font License 1.1 | https://github.com/bevietnam/BeVietnamPro (via @fontsource/be-vietnam-pro)    |
| Noto Sans      | SIL Open Font License 1.1 | https://github.com/notofonts/latin-greek-cyrillic (via @fontsource/noto-sans) |

## Data

| Data                             | License      | Source                                                                 |
| -------------------------------- | ------------ | ---------------------------------------------------------------------- |
| CMU Pronouncing Dictionary (IPA) | BSD-2-Clause | https://github.com/cmusphinx/cmudict (commit 74790861f652, re-encoded) |

`packages/core/data/cmudict.txt` is generated from CMUdict by `packages/core/scripts/build-cmudict.mjs`
(one character per ARPAbet phone). Its license text is in `packages/core/data/CMUDICT-LICENSE` and is
shipped next to the data in the extension (`ipa/CMUDICT-LICENSE`).

## Runtime libraries

| Package             | License    |
| ------------------- | ---------- |
| React, React DOM    | MIT        |
| Zustand             | MIT        |
| WXT runtime helpers | MIT        |
| compromise (NLP)    | MIT        |
| Dexie (IndexedDB)   | Apache-2.0 |

Development-only tools (TypeScript, Vite, Vitest, Playwright, ESLint, Prettier, Tailwind CSS) are not shipped in the extension bundle.

The full list of dependency licenses is checked in CI with `pnpm licenses:check`.
