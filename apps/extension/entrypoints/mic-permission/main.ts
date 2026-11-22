/**
 * Asks for the microphone once, on the extension's own origin, so the offscreen
 * recorder (which cannot show a prompt) may use it afterwards.
 */
const OK_TEXT = 'Đã cho phép. Hãy đóng thẻ này, quay lại video và bấm Ghi âm.';
const DENIED_TEXT =
  'Micro đang bị chặn. Bấm biểu tượng micro hoặc ổ khóa trên thanh địa chỉ, chọn Cho phép, rồi thử lại.';
const MISSING_TEXT = 'Không tìm thấy micro. Hãy cắm micro rồi thử lại.';

const button = document.getElementById('allow');
const status = document.getElementById('status');

function show(text: string, state: 'ok' | 'denied'): void {
  if (!status) return;
  status.textContent = text;
  status.dataset.state = state;
}

button?.addEventListener('click', () => {
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      for (const t of stream.getTracks()) t.stop();
      show(OK_TEXT, 'ok');
    })
    .catch((err: unknown) => {
      const name = err instanceof Error || err instanceof DOMException ? err.name : '';
      show(name === 'NotFoundError' ? MISSING_TEXT : DENIED_TEXT, 'denied');
    });
});
