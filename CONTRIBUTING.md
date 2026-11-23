# Contributing to ShadowLingo

Thanks for helping Vietnamese learners speak better English. Dev docs are in English; the product UI is Vietnamese only.

## Setup

Requirements: Node.js 22+, pnpm 10+, desktop Chrome 138+ or Edge.

```bash
pnpm install
pnpm dev         # extension with hot reload (opens a Chrome profile)
pnpm test        # unit tests (Vitest)
pnpm e2e         # end-to-end tests (Playwright, builds the extension first)
pnpm lint && pnpm typecheck
pnpm demos       # remake the README clips and store screenshots (after UI changes)
```

To try a build by hand: `pnpm build`, then load `apps/extension/.output/chrome-mv3` from `chrome://extensions` → Developer mode → Load unpacked.

## Layout

- `packages/core` — platform-agnostic logic and React panel. Never calls Chrome or Electron APIs; talks to the platform through adapters in `src/adapters.ts`.
- `packages/shell` — the app shell shared by the desktop and mobile apps (link field, home, embedded player, offline translation, OCR).
- `apps/extension` — WXT (Manifest V3) entrypoints and adapter implementations.
- `apps/desktop` — Electron app (Windows, macOS, Linux).
- `apps/mobile` — Capacitor app (Android, iOS).
- `docs/` — notes on caption sources (`caption-sources.md`), reading burned-in subtitles (`ocr.md`) and the store listing (`store/`).

## Rules

- TypeScript strict, no `any`. Every module has unit tests.
- No `innerHTML`, `eval` or remote code. Captions render as text.
- In `packages/core`, do not name anything `storage`: the extension build auto-imports WXT's `storage` for that name (lint checks it).
- No network requests outside youtube.com, no analytics, no backend.
- Only openly licensed dependencies and data; credit them in `THIRD_PARTY_NOTICES.md`.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), subject ≤ 72 chars.
- One branch and PR per task; CI must be green before merge.
- Update `docs/PROGRESS.md` when you finish a task.
