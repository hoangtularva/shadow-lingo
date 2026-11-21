# Progress

Single source of truth for project state across sessions. Newest first. Keep it short.

## Current
- **Phase:** 1 — repo, monorepo, caption panel
- **Branch:** `feat/phase-1-foundation`
- **Approved plan:** see "Phase 1 plan" below.

## Next
1. Monorepo tooling + CI (pnpm workspace, TS strict, ESLint/Prettier, GitHub Actions, Dependabot, CONTRIBUTING, THIRD_PARTY_NOTICES, issue/PR templates).
2. `packages/core`: cue/sentence types, parsers (json3, SRT, VTT, pasted text), sentence merger, time sync, adapters, `canUse`, React panel.
3. `apps/extension` (WXT MV3): MAIN-world caption capture, shadow-root panel beside player, SPA navigation, drag/resize/collapse, position persistence.
4. Tests: Vitest (merger, parsers, sync, canUse, panel) + Playwright with fixture watch page.
5. Verify end to end, then push branch; user opens PR on the web (no `gh` on this machine).

## Done
- 2026-11-22 — Caption source spike (see docs/caption-sources.md): direct timedtext fetch returns empty; passive read of the player's own caption XHR works.
- 2026-11-22 — CLAUDE.md, README (VI, product-only), SECURITY.md, .gitignore pushed to `master`. Repo is private until release.

## Open bugs / risks
- Caption capture needs captions turned on in the player (player only loads them then).
- Player may load an ad's captions first: filter by current videoId.

## Decisions
- 2026-11-22 — Captions: read only the player's own caption responses; never mint, copy or transplant PO tokens between requests. Fallback is paste transcript / open .srt/.vtt. Reason: timedtext needs a PO token; reusing tokens is out of bounds and fragile.
- 2026-11-22 — Default branch is `master` (repo was created with it).
- 2026-11-22 — Phase 4 Supabase login dropped from scope for now: conflicts with "no backend". Sync via chrome.storage.sync or file export.

## Phase 1 plan (approved 2026-11-22)
- Step 0 spike → Step A repo/CI → Step B core → Step C extension → Step D tests.
- Done when: `pnpm lint typecheck test build e2e` green; manual check on human-caption, auto-caption, 1-hour, SPA-switch and no-caption (+ .srt) videos; no network requests outside youtube.com; CI green.
