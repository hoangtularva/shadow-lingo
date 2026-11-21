import { installCaptionHook } from '@/lib/caption-hook';

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  allFrames: false,
  main() {
    installCaptionHook(window);
  },
});
