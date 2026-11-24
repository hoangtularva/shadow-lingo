/**
 * Firefox's recording window (UI spec: MicWindowDark/Light). Firefox gives no microphone to an
 * extension's background page, so this small window holds it: the background forwards the
 * panel's recorder actions here. The audio stays in this window's memory only.
 */
import { MIC_WINDOW_READY, micStateAfter, type MicState } from '@/lib/mic-window';
import { failureOf, isRecOffscreenRequest, type RecResponse } from '@/lib/recorder';
import { createHeldMic, handleRecAction, setMicSource } from '@/lib/recorder-engine';

const TEXT: Record<MicState, string> = {
  ready: 'Micro sẵn sàng',
  recording: 'Đang ghi âm…',
  blocked: 'Chưa được dùng micro',
};
const HELP_READY =
  'Cửa sổ này giữ micro để bạn luyện nói trên Firefox. Bạn có thể thu nhỏ, nhưng đừng đóng khi đang luyện. Mọi thao tác vẫn bấm trong khung ShadowLingo cạnh video.';
const HELP_BLOCKED =
  'Hãy cho phép ShadowLingo dùng micro trong hộp thoại của Firefox (hoặc biểu tượng micro trên thanh địa chỉ của cửa sổ này), rồi bấm Ghi âm lại trong khung cạnh video.';

function show(state: MicState): void {
  document.body.dataset.state = state;
  const status = document.getElementById('status-text');
  const help = document.getElementById('text');
  if (status) status.textContent = TEXT[state];
  if (help) help.textContent = state === 'blocked' ? HELP_BLOCKED : HELP_READY;
}

browser.runtime.onMessage.addListener((message: unknown, sender) => {
  // Only the background (no tab) drives the recorder; the panel goes through it.
  if (sender.id !== browser.runtime.id || sender.tab || !isRecOffscreenRequest(message)) {
    return undefined;
  }
  const { action } = message;
  return handleRecAction(action)
    .catch((): RecResponse => ({ ok: false, reason: 'failed' }))
    .then((res) => {
      const next = micStateAfter(action, res);
      if (next) show(next);
      return res;
    });
});

const mic = createHeldMic();
setMicSource(mic);

// Tells the background this window can take recorder actions now (a start waits for the
// microphone opened below).
void browser.runtime.sendMessage({ type: MIC_WINDOW_READY }).catch(() => undefined);

// Opens the microphone now, while this new window has focus (Firefox asks here, once), and
// keeps it switched off until a take starts.
mic.warm().catch((err: unknown) => {
  if (failureOf(err) === 'permission') show('blocked');
});
