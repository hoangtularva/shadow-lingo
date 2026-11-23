# Third-party notices

ShadowLingo bundles the following third-party software and assets. Each keeps its own license.

## Fonts

| Asset          | License                   | Source                                                                        |
| -------------- | ------------------------- | ----------------------------------------------------------------------------- |
| Be Vietnam Pro | SIL Open Font License 1.1 | https://github.com/bevietnam/BeVietnamPro (via @fontsource/be-vietnam-pro)    |
| Noto Sans      | SIL Open Font License 1.1 | https://github.com/notofonts/latin-greek-cyrillic (via @fontsource/noto-sans) |

## Data

| Data                                                        | License                 | Source                                                                 |
| ----------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| CMU Pronouncing Dictionary (IPA)                            | BSD-2-Clause            | https://github.com/cmusphinx/cmudict (commit 74790861f652, re-encoded) |
| Wiktionary (definitions, examples, Vietnamese translations) | CC BY-SA 4.0 (and GFDL) | https://en.wiktionary.org, extracted with Wiktextract by kaikki.org    |
| OPUS-MT en-vi translation model (desktop and Android apps)  | Apache-2.0              | https://huggingface.co/Helsinki-NLP/opus-mt-en-vi (ONNX: Xenova)       |
| Tesseract English data, tessdata_fast (OCR)                 | Apache-2.0              | https://github.com/tesseract-ocr/tessdata_fast (commit 87416418657)    |

`packages/core/data/cmudict.txt` is generated from CMUdict by `packages/core/scripts/build-cmudict.mjs`
(one character per ARPAbet phone). Its license text is in `packages/core/data/CMUDICT-LICENSE` and is
shipped next to the data in the extension (`ipa/CMUDICT-LICENSE`).

`packages/core/data/dict/*.txt` is a shortened excerpt of English Wiktionary (Wiktionary contributors,
https://en.wiktionary.org), taken from the Wiktextract data at https://kaikki.org (Tatu Ylonen,
"Wiktextract: Wiktionary as Machine-Readable Structured Data", LREC 2022) by
`packages/core/scripts/build-wiktionary.mjs`: English entries only, first senses and one short example,
re-formatted. It is licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/);
`packages/core/data/dict/NOTICE.txt` ships next to the data in the extension (`dict/NOTICE.txt`).

The desktop and Android apps ship the OPUS-MT en-vi model (Helsinki-NLP, University of Helsinki), in the int8 ONNX
conversion at https://huggingface.co/Xenova/opus-mt-en-vi. `packages/shell/scripts/fetch-model.mjs`
downloads it at build time at a pinned revision and checks each file's hash; `models/opus-mt-en-vi/NOTICE.txt`
ships next to it. It runs on the device only.

"Đọc chữ trên hình" (reading burned-in subtitles, extension and desktop app) ships Tesseract's English data
(`eng.traineddata` from tessdata_fast). `packages/core/scripts/fetch-ocr-data.mjs` downloads it at build time at a
pinned commit and checks its hash; `ocr/NOTICE.txt` and the Tesseract.js license files ship next to it. Frames are
read on the device only and never kept.

## Runtime libraries

| Package                                                                            | License    |
| ---------------------------------------------------------------------------------- | ---------- |
| React, React DOM                                                                   | MIT        |
| Zustand                                                                            | MIT        |
| ts-fsrs (review scheduling)                                                        | MIT        |
| Electron (desktop app; ships Chromium's own license file `LICENSES.chromium.html`) | MIT        |
| Transformers.js (desktop and Android apps, offline translation)                    | Apache-2.0 |
| ONNX Runtime Web (desktop and Android apps, offline translation)                   | MIT        |
| Capacitor (Android and iOS apps)                                                   | MIT        |
| AndroidX libraries (Android app)                                                   | Apache-2.0 |
| WXT runtime helpers                                                                | MIT        |
| compromise (NLP)                                                                   | MIT        |
| Dexie (IndexedDB)                                                                  | Apache-2.0 |
| Tesseract.js, tesseract.js-core (extension and desktop app OCR)                    | Apache-2.0 |

Development-only tools (TypeScript, Vite, Vitest, Playwright, ESLint, Prettier, Tailwind CSS) are not shipped in the extension bundle.

The full list of dependency licenses is checked in CI with `pnpm licenses:check`.
