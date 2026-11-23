import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import type { AdsAdapter, PlayerAdapter } from '../adapters';
import { canUse } from '../features';
import { buildOcrTrack, OcrCueBuilder, type OcrAdapter } from '../ocr';
import type { PanelStore } from './store';
import { vi } from './strings';

/** How often the subtitle band is read while the video plays. */
export const OCR_INTERVAL_MS = 500;

interface Options {
  store: PanelStore;
  player: PlayerAdapter | null;
  ocr: OcrAdapter | null | undefined;
  ads?: AdsAdapter | null;
}

/**
 * "Đọc chữ trên hình": while it is on and the video plays (never during ads), reads the
 * subtitle band twice a second and turns what it reads into the panel's track, sentence by
 * sentence. Frames are looked at on the device only and never kept.
 */
export function useOcr({ store, player, ocr, ads }: Options): void {
  const active = useStore(store, (s) => s.ocr.active);
  const band = useStore(store, (s) => s.ocr.band);
  const videoId = useStore(store, (s) => s.videoId);
  // One builder per video: stopping and starting again keeps what was read.
  const builder = useMemo(() => {
    void videoId;
    return new OcrCueBuilder();
  }, [videoId]);

  useEffect(() => {
    if (!active || !ocr || !player || !canUse('ocr')) return;
    let stopped = false;
    let busy = false;
    void ocr.prepare?.().catch(() => undefined);
    const publish = () => {
      const s = store.getState();
      s.setTrack(buildOcrTrack(s.videoId ?? '', builder.getCues()));
    };
    const timer = setInterval(() => {
      if (busy || player.isPaused() || ads?.isShowing()) return;
      busy = true;
      const at = player.getCurrentTime();
      ocr
        .read(band)
        .then((reading) => {
          if (stopped) return;
          if (reading === 'blocked') {
            store.getState().setOcr({ active: false });
            store.getState().setNotice(vi.ocrBlocked);
            return;
          }
          if (reading === null) builder.same(at);
          else if (builder.feed(at, reading)) publish();
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    }, OCR_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
      if (builder.flush()) publish();
    };
  }, [active, band, ocr, player, ads, store, builder]);
}
