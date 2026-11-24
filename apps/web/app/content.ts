/** Everything the landing page says, in one place (UI spec: LandingDark/Light, LandingMobileDark). */

export const REPO = 'https://github.com/hoangtularva/shadow-lingo';
export const RELEASES = `${REPO}/releases/latest`;

export const HERO = {
  tag: 'Miễn phí · Mã nguồn mở',
  title: 'Luyện nói tiếng Anh theo video, làm riêng cho người Việt',
  text: 'Thấy cách đọc từng chữ, biết mình sai ở đâu, nhại tới khi giống. IPA, nối âm, lưu ý âm hay sai và ghi âm so sánh, ngay cạnh video.',
  platforms: 'Chrome · Edge · Windows · macOS · Linux · Android',
  media: {
    src: 'demo-subtitles.webp',
    alt: 'Video đang phát, khung ShadowLingo bên cạnh: câu đang nói có IPA dưới từng chữ, nối âm, màu từ loại và lưu ý phát âm',
  },
};

export const REASONS = [
  {
    icon: '👀',
    title: 'Thấy cách đọc',
    text: 'IPA có trọng âm dưới từng chữ, đánh dấu nối âm ‿ và âm yếu /ə/. Không phải tra từng từ.',
  },
  {
    icon: '🎯',
    title: 'Biết mình sai ở đâu',
    text: 'Cảnh báo những âm người Việt hay đọc sai, kèm cách đặt lưỡi bằng tiếng Việt.',
  },
  {
    icon: '🎙️',
    title: 'Nhại tới khi giống',
    text: 'Nghe câu mẫu, ghi âm giọng bạn, nghe xen kẽ để so. Lặp đoạn khó bao nhiêu lần cũng được.',
  },
];

export const FEATURES = [
  {
    title: 'Bấm một từ để tra',
    text: 'Định nghĩa, ví dụ và cách đọc ngay cạnh video. Nhận ra cả cụm động từ bị tách ra như “figure it out”. Lưu vào sổ một chạm.',
    src: 'demo-word.webp',
    alt: 'Bấm chữ figure: thẻ chi tiết cụm động từ figure out hiện ra với IPA, định nghĩa, ví dụ và nút lưu',
  },
  {
    title: 'Nghe, nhại theo, so sánh',
    text: 'Nghe lại đúng một câu, chỉnh tốc độ, lặp đoạn A–B. Ghi âm giọng bạn rồi nghe xen kẽ với bản gốc; bản ghi chỉ nằm trên máy.',
    src: 'demo-shadowing.webp',
    alt: 'Phần luyện nói: bấm Ghi âm, dạng sóng giọng bạn hiện dưới bản gốc, rồi bấm So sánh',
  },
  {
    title: 'Video không có phụ đề?',
    text: 'ShadowLingo đọc chữ in sẵn trên hình thành từng câu, ngay trên máy bạn. Tự tìm chỗ có chữ, hoặc bạn tự chọn vùng.',
    src: 'demo-ocr.webp',
    alt: 'Video có phụ đề in trên hình; khung ShadowLingo đọc từng dòng chữ thành câu có IPA',
  },
  {
    title: 'Sổ từ vựng biết nhắc ôn',
    text: 'Từ đã lưu kèm câu gốc và mốc thời gian. Ôn bằng câu hỏi trắc nghiệm, lịch ôn tự giãn theo FSRS. Xuất sang Anki.',
    src: 'demo-review.webp',
    alt: 'Mở Sổ từ vựng, bắt đầu ôn tập, chọn đúng nghĩa của figure out',
  },
];

export const PLATFORMS = [
  {
    title: 'Chrome · Edge',
    text: 'Extension hiện ngay cạnh video trên trang xem video.',
    action: 'Tải extension',
    href: RELEASES,
  },
  {
    title: 'Máy tính',
    text: 'Windows, macOS, Linux. Gói dịch tiếng Việt có sẵn, không cần mạng để dịch.',
    action: 'Tải app',
    href: RELEASES,
  },
  {
    title: 'Android',
    text: 'Dán link, hoặc trong app YouTube bấm Chia sẻ → ShadowLingo.',
    action: 'Tải APK',
    href: RELEASES,
  },
  { title: 'iPhone · iPad', text: 'Đang hoàn thiện.', action: 'Sắp có', href: null },
];

export const PRIVACY = [
  'Phụ đề, bản ghi âm và sổ từ vựng chỉ nằm trên máy bạn.',
  'Dịch và đọc chữ trên hình chạy ngay trên máy, không gửi đi đâu.',
  'Không chặn, không ẩn quảng cáo hay nút điều khiển của trình phát.',
  'Mã nguồn mở GPL-3.0: ai cũng xem được ShadowLingo làm gì.',
];

export const FAQ = [
  {
    q: 'Có thật miễn phí không?',
    a: 'Có. Không gói trả phí, không quảng cáo, không cần tài khoản.',
  },
  {
    q: 'Video không có phụ đề thì sao?',
    a: 'Dán bản chép lời, mở tệp .srt / .vtt, hoặc để ShadowLingo đọc chữ in sẵn trên hình.',
  },
  {
    q: 'Sao Windows hay macOS cảnh báo khi cài?',
    a: 'Bản cài chưa có chữ ký số. Trang Releases ghi cách mở an toàn cho từng hệ điều hành.',
  },
];

export const DISCLAIMER = 'ShadowLingo là dự án độc lập, không liên kết với YouTube hay Google.';
