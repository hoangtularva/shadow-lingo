# Code signing

Windows builds are signed for free by the [SignPath Foundation](https://signpath.org) open
source programme. macOS and Linux builds stay unsigned (Apple's Developer ID costs $99/year;
Linux needs none). The extension is signed by each store (Chrome Web Store, Edge Add-ons, AMO).

## How the release signs Windows builds

`release.yml` job `desktop-windows`, on a `v*` tag:

1. `electron-builder --win --dir` builds `out/win-unpacked`.
2. `ShadowLingo.exe` alone is uploaded as artifact `unsigned-app` and sent to SignPath
   (artifact configuration `desktop-app`). The signed exe replaces the unsigned one.
3. `electron-builder --win nsis --prepackaged out/win-unpacked` builds the installer from that
   folder without touching the exe again.
4. The installer is uploaded as `unsigned-installer` and signed (configuration
   `desktop-installer`), then attached to the GitHub Release.

Each signing request waits up to 1 hour for a manual approval in SignPath (two per release).
Without the repository variable `SIGNPATH_ORGANIZATION_ID` every signing step is skipped and the
installer ships unsigned, so releases keep working before the account exists.

Not signed: Electron's own DLLs (upstream binaries, allowed unsigned by the SignPath terms) and
the NSIS uninstaller, which makensis creates inside the installer build.

## One-time setup

1. Owner turns on two-factor authentication on GitHub (required by the SignPath terms for
   everyone on the team).
2. Apply at <https://signpath.org/apply> (answers below). The README section "Chính sách ký mã
   (Code signing policy)" is the policy page SignPath checks; the release notes link to it.
3. After approval, in SignPath (turn on MFA there too):
   - Project slug `shadow-lingo`, repository `https://github.com/hoangtularva/shadow-lingo`.
   - Trusted build system: GitHub.com, linked to the project.
   - Artifact configurations: slug `desktop-app` from
     `.signpath/artifact-configurations/desktop-app.xml`, slug `desktop-installer` from
     `desktop-installer.xml`.
   - Signing policy slug `release-signing` with the Foundation certificate, approver: owner.
     Origin verification on: branch/tag rule `refs/tags/v*`.
   - Create a CI user (submitter on `release-signing`) and an API token for it.
4. On GitHub (Settings → Secrets and variables → Actions):
   - Secret `SIGNPATH_API_TOKEN` = that token.
   - Variable `SIGNPATH_ORGANIZATION_ID` = the SignPath organization id.
5. Tag a release; approve the two requests in SignPath when the job waits.
6. When the first signed build is out: change the Windows rows in README.md and
   `.github/release-notes.md` (no more "More info → Run anyway").

## Application answers (draft)

- **Project name:** ShadowLingo
- **Repository:** https://github.com/hoangtularva/shadow-lingo
- **Homepage / download page:** https://hoangtularva.github.io/shadow-lingo/ ·
  https://github.com/hoangtularva/shadow-lingo/releases
- **License:** GPL-3.0-only (OSI approved), no commercial dual licensing, no proprietary parts.
- **Description:** Free, open source tool that helps Vietnamese learners practise English by
  shadowing videos: interactive subtitles with IPA and stress, Vietnamese translation done on
  the device, pronunciation tips, record-and-compare, and a vocabulary notebook. Browser
  extension, desktop app (Electron) and Android app. No ads, no account, no server: user data
  stays on the device.
- **What will be signed:** the Windows desktop app executable `ShadowLingo.exe` and its NSIS
  installer `ShadowLingo-<version>-windows-setup.exe`.
- **Build system:** GitHub Actions on GitHub-hosted runners (`.github/workflows/release.yml`),
  triggered by a version tag; the build only uses the repository and its locked dependencies.
- **Released already:** yes, v0.2.0 (unsigned installers on GitHub Releases).
- **Team:** Hoang Tu (@hoangtularva), author, reviewer and approver.
- **Privacy:** the program does not transfer information to other networked systems unless
  the user asks for it (loading a video they chose); translation and all user data stay on
  the device. Policy in the README section "Chính sách ký mã (Code signing policy)".
