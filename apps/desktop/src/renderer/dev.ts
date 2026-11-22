import { createEmbedPlayer } from '../shared/embed-player';
import type { DesktopBridge } from '../shared/ipc';
import { embedUrl, startFromInput, videoIdFromInput } from '../shared/youtube';

/** Development page only: opens a video and logs what the app sees. */
const bridge = (window as unknown as { shadowLingo?: DesktopBridge }).shadowLingo;
const log = document.getElementById('log');
const say = (line: string) => {
  if (log) log.textContent = `${line}\n${log.textContent ?? ''}`.slice(0, 4000);
};

bridge?.onCaption((c) => say(`captions ${c.videoId} ${c.lang} ${c.kind} ${c.body.length} chars`));

document.getElementById('open')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = (document.getElementById('url') as HTMLInputElement | null)?.value ?? '';
  const id = videoIdFromInput(input);
  if (!id) {
    say('Link không hợp lệ');
    return;
  }
  const frame = document.createElement('iframe');
  frame.width = '854';
  frame.height = '480';
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.src = embedUrl(id, location.origin, startFromInput(input));
  const holder = document.getElementById('player');
  holder?.replaceChildren(frame);
  frame.addEventListener('load', () => {
    const player = createEmbedPlayer(() => frame.contentWindow, window);
    player.connect();
    player.onTimeUpdate((ms) => {
      if (Math.round(ms) % 5000 < 300)
        say(`time ${Math.round(ms)} ms, paused ${player.isPaused()}`);
    });
  });
});
