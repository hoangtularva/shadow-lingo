# Chrome Web Store / Edge Add-ons listing

Everything needed to submit the extension, ready to paste. Store text is in Vietnamese (the
product's language); notes around it are in English.

## Assets (this folder)

| File                                           | Use                                  |
| ---------------------------------------------- | ------------------------------------ |
| `screenshot-1-subtitles.png` … `-5-review.png` | Screenshots, 1280×800, in this order |
| `promo-small-440x280.png`                      | Small promo tile (required)          |
| `promo-marquee-1400x560.png`                   | Marquee promo tile (optional)        |
| `../../apps/extension/public/icon/128.png`     | Store icon, 128×128                  |

The video in the screenshots is a drawn scene and the sentences are written for the demo; no
video or caption from any real channel is shown.

## Basics

- **Name:** ShadowLingo
- **Category:** Education (Giáo dục)
- **Language:** Tiếng Việt
- **Short description** (the manifest's, ≤132 characters):

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
  - Host `https://www.youtube.com/*`: hiện khung luyện tập cạnh trình phát và đọc phụ đề mà trình phát đã tải.
- **Remote code:** No. Every script, the WebAssembly OCR engine and its English data ship inside the package.
- **Data usage:** collects nothing. Tick none of the data types, and certify: not sold, not used
  for unrelated purposes, not used for credit. Nothing is sent to any server.
- **Privacy policy URL:** https://github.com/hoangtularva/shadow-lingo#-miễn-phí-và-riêng-tư

## Before submitting

- Build the zip with `pnpm --filter @shadow-lingo/extension zip` (or take it from the release).
- Store rules to keep in mind: the name and icon must not use "YouTube" or its logo
  ("for YouTube" wording in the description is fine), and the listing must not claim an
  affiliation (the last line of the description says it is independent).

## Firefox (addons.mozilla.org)

The same code builds for Firefox: `pnpm --filter @shadow-lingo/extension zip` writes
`apps/extension/.output/shadowlingo-<version>-firefox.zip` and `shadowlingo-<version>-sources.zip`.
Firefox only installs add-ons signed by Mozilla, so users get it from addons.mozilla.org (free).

- Upload the Firefox zip; when asked for source code, upload the sources zip. Build steps for
  the reviewer: `pnpm install`, then `pnpm --filter @shadow-lingo/extension zip` (Node 22, pnpm 10).
- Add-on ID `shadowlingo@hoangtularva.github.io`, Firefox 142 or later; data collection: none.
- Notes for the reviewer: the "Function constructor" warnings are inside Tesseract.js (bundled
  OCR engine) and the `innerHTML` ones inside React DOM; the extension's CSP forbids eval, and
  its own code never uses either.
- Differences from Chrome: no recording yet (Firefox gives no microphone to an extension's
  background page), and no machine translation (Firefox has no built-in translator for
  extensions); human Vietnamese captions, IPA, dictionary, notebook and OCR all work.
- Use the same description and screenshots as above.
