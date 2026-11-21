# Third-party notices

ShadowLingo bundles the following third-party software and assets. Each keeps its own license.

## Fonts

| Asset | License | Source |
| --- | --- | --- |
| Be Vietnam Pro | SIL Open Font License 1.1 | https://github.com/bevietnam/BeVietnamPro (via @fontsource/be-vietnam-pro) |
| Noto Sans | SIL Open Font License 1.1 | https://github.com/notofonts/latin-greek-cyrillic (via @fontsource/noto-sans) |

## Runtime libraries

| Package | License |
| --- | --- |
| React, React DOM | MIT |
| Zustand | MIT |
| WXT runtime helpers | MIT |

Development-only tools (TypeScript, Vite, Vitest, Playwright, ESLint, Prettier, Tailwind CSS) are not shipped in the extension bundle.

The full list of dependency licenses is checked in CI with `pnpm licenses:check`.
