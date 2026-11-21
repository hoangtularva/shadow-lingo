# ShadowLingo — YouTube shadowing tool for Vietnamese learners

## Product
- Chrome/Edge extension first, then Electron desktop app (Windows/macOS/Linux, phase 7) and a Next.js landing page.
- UI language: Vietnamese only. Code, comments, commits and dev docs: English.
- 100% free: no ads, no donations, no required account. Running cost must stay $0: no backend, no paid APIs.
- Pro-ready: every feature goes through `canUse(feature)`, reading flags from a bundled config (all enabled for now).
- Logo: concept A (speech bubble #F5B544, offset shadow #3A3F48, ‿ smile/linking mark), wordmark Shadow + Lingo (accent) in Be Vietnam Pro 700: https://claude.ai/artifact/RbXyjPD6QruYsDhuWLXDGR. Export icons 16/32/48/128 px (extension) and 512/1024 px (desktop).
- UI spec: https://claude.ai/artifact/MJbVWuEfjkiShmGMirYMHb — dark #171A20 / light #FFFFFF following YouTube's theme, accent #F5B544, Be Vietnam Pro (text) + Noto Sans (IPA), radius 12–16px, ~470px panel beside the player (never over it), animations ≤200ms, keyboard shortcuts.

## Differentiators (keep these first-class)
- IPA under every word with stress marks; linking ‿, elision, weak forms /ə/.
- Warnings for sounds Vietnamese learners get wrong (/θ ð/, final consonants, /æ/ vs /e/, /iː/ vs /ɪ/, /ʃ ʒ tʃ dʒ/) with tongue-placement tips in Vietnamese.
- POS coloring; record-and-compare shadowing inside the panel; curated phrasal verb / idiom dictionary with accurate Vietnamese.

## Structure (pnpm monorepo)
- packages/core — subtitles, IPA, POS, vocab, canUse, panel UI (React); shared
- apps/extension — WXT (MV3)
- apps/desktop — Electron (phase 7)
- apps/web — Next.js static export to GitHub Pages
- core never calls Chrome/Electron APIs directly; subtitles, storage and translation go through adapters.

## Stack
TypeScript strict, React, Tailwind, Zustand, Dexie (IndexedDB), Vitest, Playwright.
Translation: Chrome Translator API (extension); Bergamot or opus-mt-en-vi offline (desktop).
IPA: CMU Dict + Wiktionary via kaikki.org (CC BY-SA). POS: wink-nlp or compromise. OCR: Tesseract.js.

## Code rules
- No `any`. Unit tests for every module; e2e for main flows.
- Content script stays light; heavy work in Web Workers / background / offscreen.
- Translate merged full sentences; prefer human Vietnamese subtitles when present; show the source (original / machine); users can edit translations.
- Cache translations and IPA by videoId + sentence hash (IndexedDB).
- Minimal permissions; host_permissions: youtube.com only.
- YouTube is an SPA: handle video changes without reload (yt-navigate-finish).

## Legal (must)
- Never download video/audio; never store or send captions to any server; never block or hide YouTube ads or player UI.
- Never use "YouTube", "YT" or the YouTube logo in the product name; "for YouTube" wording is fine.
- Never bundle or scrape Cambridge/Oxford data; only link out to dictionary.cambridge.org.
- Only openly licensed data and libraries, credited in THIRD_PARTY_NOTICES.md; CI blocks incompatible licenses.
- Desktop embedded player follows YouTube Required Minimum Functionality (≥480×270, HTTP Referer, no overlay).

## Security
- No innerHTML, eval or remote code; render captions as text; strict CSP.
- No server; user data stays on device; never log personal content.
- Electron: contextIsolation on, nodeIntegration off, sandbox on.

## Git
- Public repo https://github.com/hoangtularva/shadow-lingo, GPL-3.0. Default branch: `master`. Never commit secrets, .env or keys.
- One branch + PR per task; small commits.
- Commit messages in English, Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`), subject ≤72 chars, body only when needed.
- Merge only when CI is green.

## CI (GitHub Actions)
- Separate parallel jobs: lint, typecheck, unit test, build, e2e. No `needs` between them except e2e on the build artifact.
- Cache the pnpm store; `concurrency` per branch with cancel-in-progress.
- Run only affected packages (`pnpm --filter "...[origin/master]"`).
- Desktop: build Windows, macOS, Linux in parallel with a matrix.

## Session state (must)
- At session start: read docs/PROGRESS.md before doing anything.
- After each finished task: update docs/PROGRESS.md (current phase, done, next, open bugs, decisions with reasons), then commit. Keep it short; newest first.
- Before /compact or when context is long: update docs/PROGRESS.md first.
- Never rely on chat history for state; the repo is the source of truth.

## Commands
pnpm dev | pnpm build | pnpm test | pnpm e2e | pnpm lint | pnpm typecheck
