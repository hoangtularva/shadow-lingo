import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import type { AdsAdapter, PlayerAdapter } from '../adapters';
import { canUse } from '../features';
import {
  AutoRegion,
  BandReader,
  buildOcrTrack,
  findTextRegion,
  OCR_BANDS,
  OCR_READ_WIDTH,
  OCR_SCAN_WIDTH,
  OcrCueBuilder,
  WHOLE_FRAME,
  type OcrAdapter,
  type OcrRegion,
} from '../ocr';
import type { PanelStore } from './store';
import { vi } from './strings';

/** How often the subtitle band is read while the video plays. */
export const OCR_INTERVAL_MS = 500;
/** "Tự tìm" looks over the whole frame every this many reads (and until it finds text). */
export const OCR_SCAN_EVERY = 4;

interface Options {
  store: PanelStore;
  player: PlayerAdapter | null;
  ocr: OcrAdapter | null | undefined;
  ads?: AdsAdapter | null;
}

const regionKey = (r: OcrRegion) => `${r.from.toFixed(3)}-${r.to.toFixed(3)}`;

/**
 * "Đọc chữ trên hình": while it is on and the video plays (never during ads), reads where the
 * subtitles sit twice a second and turns what it reads into the panel's track, sentence by
 * sentence. "Tự tìm" finds that place by looking over the whole frame now and then. Frames
 * are looked at on the device only and never kept.
 */
export function useOcr({ store, player, ocr, ads }: Options): void {
  const active = useStore(store, (s) => s.ocr.active);
  const placement = useStore(store, (s) => s.ocr.placement);
  const region = useStore(store, (s) => s.ocr.region);
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
    let tick = 0;
    const reader = new BandReader(document);
    const auto = new AutoRegion();
    void ocr.prepare?.().catch(() => undefined);
    if (placement === 'auto') store.getState().setOcr({ found: null });
    const publish = () => {
      const s = store.getState();
      s.setTrack(buildOcrTrack(s.videoId ?? '', builder.getCues()));
    };
    const block = () => {
      store.getState().setOcr({ active: false, editing: false });
      store.getState().setNotice(vi.ocrBlocked);
    };

    /** The region to read now, or null while "Tự tìm" has found nothing yet. */
    const target = async (): Promise<OcrRegion | null | 'blocked'> => {
      if (placement === 'custom') return region;
      if (placement !== 'auto') return OCR_BANDS[placement];
      if (!auto.current || tick % OCR_SCAN_EVERY === 0) {
        const frame = await ocr.grab(WHOLE_FRAME, OCR_SCAN_WIDTH);
        if (frame === 'blocked') return 'blocked';
        if (frame && auto.update(findTextRegion(frame))) {
          store.getState().setOcr({ found: auto.current });
        }
      }
      return auto.current;
    };

    const step = async () => {
      const at = player.getCurrentTime();
      const where = await target();
      if (stopped) return;
      if (where === 'blocked') return block();
      if (!where) return;
      const pixels = await ocr.grab(where, OCR_READ_WIDTH);
      if (stopped) return;
      if (pixels === 'blocked') return block();
      if (!pixels) return builder.same(at);
      const band = reader.prepare(pixels, regionKey(where));
      if (band.kind === 'unchanged') return builder.same(at);
      const reading =
        band.kind === 'empty' ? { text: '', confidence: 0 } : await ocr.recognize(band.png);
      if (stopped) return;
      if (!reading) return builder.same(at);
      if (builder.feed(at, reading)) publish();
    };

    const timer = setInterval(() => {
      if (busy || player.isPaused() || ads?.isShowing()) return;
      busy = true;
      step()
        .catch(() => undefined)
        .finally(() => {
          tick++;
          busy = false;
        });
    }, OCR_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
      if (builder.flush()) publish();
    };
  }, [active, placement, region, ocr, player, ads, store, builder]);
}
