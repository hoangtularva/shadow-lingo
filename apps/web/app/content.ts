/** Everything the landing page says, in one place (UI spec: LandingDark/Light, LandingMobileDark). */

export const REPO = 'https://github.com/hoangtularva/shadow-lingo';
export const RELEASES = `${REPO}/releases/latest`;

export const NAV = [
  { href: '#tinh-nang', label: 'Tính năng' },
  { href: '#tai-ve', label: 'Tải về' },
  { href: '#rieng-tu', label: 'Quyền riêng tư' },
  { href: '#cau-hoi', label: 'Câu hỏi thường gặp' },
];

export const HERO = {
  tag: 'Miễn phí · Mã nguồn mở',
  title: 'Luyện nói tiếng Anh qua video, thiết kế riêng cho người Việt',
  text: 'ShadowLingo hiển thị phiên âm IPA dưới từng từ, đánh dấu nối âm và những âm người Việt thường phát âm sai, đồng thời cho phép ghi âm để so sánh với bản gốc, ngay bên cạnh video.',
  primary: 'Tải về miễn phí',
  secondary: 'Xem mã nguồn trên GitHub',
  platforms: 'Hỗ trợ Chrome, Edge, Windows, macOS, Linux và Android',
  media: {
    src: 'demo-subtitles.webp',
    alt: 'Video đang phát, khung ShadowLingo bên cạnh: câu đang nói có phiên âm IPA dưới từng từ, nối âm, màu từ loại và lưu ý phát âm',
  },
};

/** Icons are drawn in the page (no emoji: their look depends on the operating system). */
export type ReasonIcon = 'eye' | 'target' | 'mic';

export const REASONS: { icon: ReasonIcon; title: string; text: string }[] = [
  {
    icon: 'eye',
    title: 'Phát âm hiển thị rõ ràng',
    text: 'Phiên âm IPA có trọng âm dưới mỗi từ, kèm đánh dấu nối âm và âm yếu /ə/. Không cần tra từng từ.',
  },
  {
    icon: 'target',
    title: 'Chỉ ra lỗi thường gặp',
    text: 'Cảnh báo các âm người Việt hay phát âm sai, kèm hướng dẫn đặt lưỡi bằng tiếng Việt.',
  },
  {
    icon: 'mic',
    title: 'Luyện tập đến khi thành thạo',
    text: 'Nghe câu mẫu, ghi âm giọng của bạn và nghe xen kẽ để đối chiếu. Lặp lại đoạn khó bao nhiêu lần tùy ý.',
  },
];

export const FEATURES = [
  {
    title: 'Tra từ ngay trong ngữ cảnh',
    text: 'Định nghĩa, ví dụ và phiên âm hiển thị ngay cạnh video. Nhận diện cả cụm động từ bị tách rời như “figure it out”, lưu vào sổ từ vựng chỉ với một lần nhấn.',
    src: 'demo-word.webp',
    alt: 'Nhấn vào từ figure: thẻ chi tiết cụm động từ figure out hiện ra với phiên âm, định nghĩa, ví dụ và nút lưu',
  },
  {
    title: 'Nghe, nhại lại và so sánh',
    text: 'Phát lại từng câu, điều chỉnh tốc độ, lặp đoạn A–B. Ghi âm giọng của bạn và nghe xen kẽ với bản gốc; bản ghi chỉ được lưu trên thiết bị.',
    src: 'demo-shadowing.webp',
    alt: 'Phần luyện nói: nhấn Ghi âm, dạng sóng giọng của bạn hiện dưới bản gốc, sau đó nhấn So sánh',
  },
  {
    title: 'Hỗ trợ cả video không có phụ đề',
    text: 'ShadowLingo nhận dạng chữ in sẵn trên khung hình và chuyển thành từng câu, xử lý hoàn toàn trên thiết bị. Tự động xác định vị trí phụ đề, hoặc để bạn tự chọn vùng.',
    src: 'demo-ocr.webp',
    alt: 'Video có phụ đề in trên hình; khung ShadowLingo nhận dạng từng dòng chữ thành câu kèm phiên âm',
  },
  {
    title: 'Sổ từ vựng với lịch ôn thông minh',
    text: 'Từ đã lưu đi kèm câu gốc và mốc thời gian trong video. Ôn tập bằng câu hỏi trắc nghiệm, lịch ôn tự điều chỉnh theo thuật toán FSRS và xuất được sang Anki.',
    src: 'demo-review.webp',
    alt: 'Mở Sổ từ vựng, bắt đầu ôn tập và chọn đúng nghĩa của figure out',
  },
];

export const DOWNLOAD = {
  title: 'Có mặt trên mọi thiết bị',
  text: 'Cùng một trải nghiệm luyện tập trên trình duyệt, máy tính và điện thoại.',
  note: 'Tất cả bản cài đặt có trên',
  noteLink: 'trang Releases của GitHub',
  noteEnd: ', kèm hướng dẫn chi tiết.',
};

export const PLATFORMS = [
  {
    title: 'Chrome · Edge',
    text: 'Tiện ích mở rộng hiển thị ngay cạnh trình phát video.',
    action: 'Tải tiện ích',
    href: RELEASES,
  },
  {
    title: 'Máy tính',
    text: 'Windows, macOS và Linux. Tích hợp sẵn bộ dịch tiếng Việt, không cần kết nối mạng.',
    action: 'Tải ứng dụng',
    href: RELEASES,
  },
  {
    title: 'Android',
    text: 'Dán đường dẫn video, hoặc chia sẻ trực tiếp từ ứng dụng YouTube.',
    action: 'Tải APK',
    href: RELEASES,
  },
  {
    title: 'iPhone · iPad',
    text: 'Đang trong giai đoạn hoàn thiện.',
    action: 'Sắp ra mắt',
    href: null,
  },
];

export const PRIVACY_TITLE = 'Miễn phí và tôn trọng quyền riêng tư';
export const PRIVACY_TEXT =
  'Không quảng cáo, không yêu cầu tài khoản, không có máy chủ thu thập dữ liệu.';
export const PRIVACY = [
  'Phụ đề, bản ghi âm và sổ từ vựng chỉ được lưu trên thiết bị của bạn.',
  'Bản dịch và nhận dạng chữ được xử lý ngay trên thiết bị, không gửi đi bất kỳ đâu.',
  'Không chặn hay ẩn quảng cáo và các nút điều khiển của trình phát.',
  'Mã nguồn mở theo giấy phép GPL-3.0, minh bạch về mọi hoạt động.',
];

export const FAQ_TITLE = 'Câu hỏi thường gặp';
export const FAQ = [
  {
    q: 'ShadowLingo có thực sự miễn phí?',
    a: 'Có. Không có gói trả phí, không quảng cáo và không cần tài khoản.',
  },
  {
    q: 'Nếu video không có phụ đề thì sao?',
    a: 'Bạn có thể dán bản chép lời, mở tệp .srt hoặc .vtt, hoặc để ShadowLingo nhận dạng chữ in sẵn trên khung hình.',
  },
  {
    q: 'Vì sao Windows hoặc macOS hiển thị cảnh báo khi cài đặt?',
    a: 'Bản cài đặt hiện chưa được ký số. Trang Releases hướng dẫn cách mở an toàn trên từng hệ điều hành.',
  },
];

export const DISCLAIMER = 'ShadowLingo là dự án độc lập, không liên kết với YouTube hoặc Google.';
