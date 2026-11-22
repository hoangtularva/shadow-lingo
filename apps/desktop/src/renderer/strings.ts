/** Desktop shell copy (UI spec: DesktopDark/Light, DesktopEmptyDark/Light). Vietnamese only. */
export const t = {
  home: 'Về màn hình chính',
  pastePlaceholder: 'Dán link video YouTube (youtube.com/watch?v=… hoặc youtu.be/…)',
  pasteLabel: 'Link video YouTube',
  open: 'Mở video',
  invalidLink: 'Link chưa đúng. Dán link một video YouTube, ví dụ youtube.com/watch?v=…',
  homeTitle: 'Dán link video YouTube để bắt đầu',
  homeHint:
    'Video tiếng Anh có phụ đề là tốt nhất. Video không có phụ đề vẫn học được bằng cách dán bản chép lời hoặc mở file .srt / .vtt.',
  recent: 'Video gần đây',
  learned: (n: number) => `đã học ${n} câu`,
  justOpened: 'mới mở',
  localOnly: 'Mọi thứ lưu trên máy này · không cần tài khoản',
  videoLabel: 'Video YouTube',
  openOnYouTube: 'Mở trên YouTube',
  noMachineTranslation:
    'Bản app chưa có dịch máy tiếng Việt. Phụ đề tiếng Việt do người làm (chọn Tiếng Việt ở nút CC) vẫn hiện được.',
} as const;
