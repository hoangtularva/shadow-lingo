# Chrome Web Store / Edge Add-ons listing

Everything needed to submit the extension, ready to paste. Store text is in Vietnamese (the
product's language); notes around it are in English.

## Assets (this folder)

| File                                           | Use                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `screenshot-1-subtitles.png` … `-5-review.png` | Screenshots, 1280×800, 24-bit PNG, in this order (Chrome max 5, Edge max 6) |
| `store-icon-128.png`                           | Chrome store icon: 96×96 artwork + 16 px transparent padding                |
| `edge-logo-300.png`                            | Edge extension logo (300×300 recommended, 128 minimum)                      |
| `promo-small-440x280.png`                      | Small promo tile (optional, but items without one are listed after)         |
| `promo-marquee-1400x560.png`                   | Marquee promo tile (optional)                                               |

Both store icons come from `apps/extension/scripts/build-icons.mjs` (`pnpm icons`). The video in
the screenshots is a drawn scene and the sentences are written for the demo; no video or caption
from any real channel is shown.

Checked against the official pages on 2026-11-27 (developer.chrome.com/docs/webstore:
cws-dashboard-listing, images, cws-dashboard-privacy, cws-dashboard-test-instructions;
learn.microsoft.com Edge "publish-extension"). Google's guidance that these files do not meet
exactly: screenshots should be full bleed (ours sit on a plain background around the browser
shot) and promo tiles should avoid text (ours carry the name and a tagline). Neither is a hard
rule; redo them if a review asks.

## Basics

- **Name:** ShadowLingo
- **Category:** Education (Giáo dục)
- **Language:** Tiếng Việt. The package has no `_locales`, so pick the language in the dashboard
  if it asks; Chrome would otherwise take it from `_locales`.
- **Short description** (the manifest's `description`, 112 of 132 characters; Edge shows it too,
  it is not edited in Partner Center):

  > Luyện Shadowing tiếng Anh với video: phụ đề theo câu, IPA dưới từng chữ, nối âm và lưu ý phát âm cho người Việt.

## Detailed description

```text
ShadowLingo giúp người Việt luyện nói tiếng Anh theo video: mở một video tiếng Anh, khung ShadowLingo hiện ngay bên cạnh trình phát (không che video).

PHỤ ĐỀ SONG NGỮ THEO CÂU
• Phụ đề tiếng Anh được ghép thành câu hoàn chỉnh, kể cả phụ đề tự động.
• Dòng tiếng Việt dưới từng câu: ưu tiên phụ đề Việt do người làm; nếu không có, dịch ngay trên máy bằng trình dịch có sẵn của Chrome. Bạn sửa được bản dịch.
• Video không có phụ đề? Dán bản chép lời, mở tệp .srt / .vtt, hoặc đọc chữ in sẵn trên hình (thử nghiệm).

PHÁT ÂM CHO NGƯỜI VIỆT
• IPA dưới từng chữ, có trọng âm; đánh dấu nối âm ‿, âm bị nuốt và âm yếu /ə/.
• Cảnh báo những âm người Việt hay đọc sai (/θ ð/, âm cuối, /æ/, /iː/–/ɪ/, /ʃ ʒ tʃ dʒ/) kèm cách đặt lưỡi bằng tiếng Việt.
• Tô màu từ loại; bấm một từ để xem nghĩa, định nghĩa, ví dụ (Wiktionary), nhận ra cả cụm động từ và thành ngữ.

LUYỆN SHADOWING
• Nghe câu mẫu → Nhại theo → So sánh. Nghe lại đúng một câu, tự dừng sau câu, tốc độ 0.5×–1.25×, lặp đoạn A–B.
• Ghi âm giọng bạn và nghe xen kẽ với bản gốc. Bản ghi chỉ nằm trong bộ nhớ, không lưu, không gửi đi đâu.

SỔ TỪ VỰNG
• Lưu từ kèm câu gốc và mốc thời gian, bấm là mở lại đúng đoạn video.
• Ôn tập trắc nghiệm, lịch ôn tự giãn theo FSRS. Xuất sang Anki hoặc CSV, sao lưu bằng một tệp.

MIỄN PHÍ VÀ RIÊNG TƯ
• Miễn phí 100%, không quảng cáo, không cần tài khoản, mã nguồn mở (GPL-3.0).
• Không có máy chủ: phụ đề, bản ghi âm và sổ từ vựng chỉ nằm trên máy bạn.
• Không chặn, không ẩn quảng cáo hay nút điều khiển của trình phát.

ShadowLingo là dự án độc lập, không liên kết với YouTube hay Google.
Mã nguồn: https://github.com/hoangtularva/shadow-lingo
```

## Privacy tab

- **Single purpose:**

  > Hiện phụ đề tiếng Anh theo câu kèm IPA, bản dịch tiếng Việt và công cụ ghi âm cạnh video đang xem, để người Việt luyện nói (shadowing).

- **Permission justification:**
  - `storage`: lưu cài đặt, bản dịch đã sửa và sổ từ vựng ngay trên máy.
  - `offscreen`: trang ẩn của tiện ích để ghi âm giọng người học (micro chỉ bật khi bấm Ghi âm) và chạy bộ đọc chữ Tesseract cho tính năng "Đọc chữ trên hình"; không có dữ liệu nào rời máy.
  - `scripting`: khi vừa cài hoặc cập nhật, thêm khung luyện tập (chính các script đóng gói sẵn của tiện ích) vào những tab YouTube đang mở, để người dùng không phải tải lại trang; chỉ trên www.youtube.com.
  - Host `https://www.youtube.com/*`: hiện khung luyện tập cạnh trình phát và đọc phụ đề mà trình phát đã tải.
- **Remote code:** No. Every script, the WebAssembly OCR engine and its English data ship inside the package.
  The Tesseract.js bundle still contains its default CDN address (`cdn.jsdelivr.net/npm/tesseract.js`)
  as a string; it is never used: the engine is given the packaged `ocr/` worker, core and language
  data, and the extension CSP (`script-src 'self'`) would block any remote script anyway.
- **Data usage:** collects nothing. Tick none of the data types, and certify: not sold, not used
  for unrelated purposes, not used for credit. Nothing is sent to any server.
- **Privacy policy URL:** https://github.com/hoangtularva/shadow-lingo/blob/master/PRIVACY.md
  (Vietnamese with an English summary for reviewers; it also covers the microphone, which the
  User Data policy requires to be disclosed).

## Test instructions (Chrome "Test instructions" tab, Edge "Notes for certification")

Optional in both stores (Chrome's tab is meant for logins, and no account is needed here), but it
saves the reviewer a guess. Paste as is:

```text
0. Right after install a "how to start" tab opens (welcome.html, shown once, never on updates).
1. Open any www.youtube.com video that has English captions (for example a TED talk) and turn on CC once.
2. The ShadowLingo panel appears to the right of the player (the toolbar button shows or hides it). The current sentence is highlighted with IPA under each word, linking marks and pronunciation tips.
3. Click a word to open its dictionary card; "Lưu vào sổ" saves it to the notebook tab "Sổ từ vựng".
4. At the bottom, "1. Nghe câu mẫu" replays the sentence, "2. Nhại theo" records the microphone (permission asked on first use, audio stays in memory), "3. So sánh" plays both.
5. Vietnamese line: needs Chrome 138+ built-in Translator; the first time, click "Tải gói dịch tiếng Việt (một lần)".
The UI is in Vietnamese only (target users are Vietnamese learners of English). Everything runs on the device; there is no server.
```

## Edge Add-ons (Partner Center)

- Same zip as Chrome (`shadowlingo-<version>-chrome.zip`), same description, screenshots and
  promo tiles; both promo tiles are optional (440×280 small, 1400×560 large PNG). Edge takes
  screenshots of 640×480 or 1280×800, up to 6.
- **Description:** the same text (1,633 characters; Edge needs 250–10,000).
- **Logo:** `edge-logo-300.png`.
- **Search terms** (max 7, ≤30 characters each, 21 words total; these are 7 terms, 17 words): `shadowing`, `luyện nói tiếng Anh`,
  `IPA`, `phụ đề song ngữ`, `phát âm`, `học tiếng Anh`, `từ vựng`.
- **Privacy policy URL** and **Notes for certification**: as above.
- Not verified: whether stable Edge exposes the built-in Translator API to extensions. Where it
  does not, the panel shows English with IPA and human Vietnamese captions only; test this in
  Edge before submitting and adjust test instruction 5 if needed.

## Featured badge self-nomination (after release)

Chrome Web Store One Stop Support → "Featured badge nomination". Submit once the listing is live
with real users and ratings; English pitch:

```text
ShadowLingo helps Vietnamese learners practise English speaking (shadowing) next to the videos they already watch. It shows sentence-merged captions with IPA and stress under every word, linking/weak-form marks, Vietnamese-specific pronunciation warnings with tongue-placement tips, record-and-compare inside the panel, and a spaced-repetition vocabulary notebook.
Best practices: Manifest V3; minimal permissions (storage, offscreen, scripting, host www.youtube.com only); no remote code (strict CSP, all scripts and the WebAssembly OCR bundled); no server, no analytics, no data collected; the panel sits beside the player and never covers the video, ads or player controls; keyboard shortcuts and accessibility checks (axe) in CI; open source (GPL-3.0) with unit and end-to-end tests on every commit.
```

## Before submitting

- Chrome Web Store developer account: one-time $5 registration fee (owner's decision; Edge and
  Firefox are free). Turn on 2-Step Verification and verify the publisher identity to get the
  "Established publisher" badge later.
- Build the zip with `pnpm --filter @shadow-lingo/extension zip` (or take it from the release).
- Screenshots must be 24-bit PNG or JPEG without alpha; `pnpm demos` writes them that way.
- Store rules to keep in mind: the name and icon must not use "YouTube" or its logo
  ("for YouTube" wording in the description is fine), and the listing must not claim an
  affiliation (the last line of the description says it is independent).

## Firefox (addons.mozilla.org)

The same code builds for Firefox: `pnpm --filter @shadow-lingo/extension zip` writes
`apps/extension/.output/shadowlingo-<version>-firefox.zip` and `shadowlingo-<version>-sources.zip`.
Firefox only installs add-ons signed by Mozilla, so users get it from addons.mozilla.org (free).

- Upload the Firefox zip; when asked for source code, upload the sources zip. It is the whole
  repository as committed (`git archive` of HEAD, made by `apps/extension/scripts/zip-sources.mjs`),
  so commit before zipping. Build steps for the reviewer, from the unzipped `shadow-lingo/`
  folder (Node 22, pnpm 10): `pnpm install --frozen-lockfile`, then
  `pnpm --filter @shadow-lingo/extension build:firefox`; the add-on is in
  `apps/extension/.output/firefox-mv3`. The build downloads Tesseract's English data
  (tessdata_fast, pinned commit, SHA-256 checked) from github.com once.
- Add-on ID `shadowlingo@hoangtularva.github.io`, Firefox 142 or later; data collection: none.
- Notes for the reviewer: the "Function constructor" warnings are inside Tesseract.js (bundled
  OCR engine) and the `innerHTML` ones inside React DOM; the extension's CSP forbids eval, and
  its own code never uses either.
- Differences from Chrome: no machine translation (Firefox has no built-in translator for
  extensions); human Vietnamese captions, IPA, dictionary, notebook and OCR all work.
  Recording opens a small ShadowLingo window (`mic-window.html`) that holds the microphone,
  since Firefox gives none to an extension's background page; audio stays in that window's
  memory and is never stored or sent.
- Use the same description and screenshots as above.
