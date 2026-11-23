import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import type { AdsAdapter, PlayerAdapter, StorageAdapter } from '../adapters';
import { canUse } from '../features';
import {
  AutoRegion,
  BandReader,
  buildOcrTrack,
  loadOcrCues,
  saveOcrCues,
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
/** "Tự tìm" looks over the whole frame this often (twice as often until it has settled). */
export const OCR_SCAN_MS = 2000;

interface Options {
  store: PanelStore;
  player: PlayerAdapter | null;
  ocr: OcrAdapter | null | undefined;
  ads?: AdsAdapter | null;
  /** Keeps what was read per video on the device, so reopening it shows the lines again. */
  cache?: StorageAdapter | null;
}

/** The player's title and controls hide this long after playback starts. */
export const PLAYER_UI_MS = 3500;

/** Lines are saved this long after the last change. */
const SAVE_DELAY_MS = 1500;

const regionKey = (r: OcrRegion) => `${r.from.toFixed(3)}-${r.to.toFixed(3)}`;

/**
 * "Đọc chữ trên hình": while it is on and the video plays (never during ads), reads where the
 * subtitles sit twice a second and turns what it reads into the panel's track, sentence by
 * sentence. "Tự tìm" finds that place by looking over the whole frame now and then. Frames
 * are looked at on the device only and never kept.
 */
export function useOcr({ store, player, ocr, ads, cache }: Options): void {
  const active = useStore(store, (s) => s.ocr.active);
  const placement = useStore(store, (s) => s.ocr.placement);
  const region = useStore(store, (s) => s.ocr.region);
  const videoId = useStore(store, (s) => s.videoId);
  // One builder per video: stopping and starting again keeps what was read.
  const builder = useMemo(() => {
    void videoId;
    return new OcrCueBuilder();
  }, [videoId]);

  // Lines read on an earlier visit: shown at once when the video has no other subtitles.
  useEffect(() => {
    if (!cache || !ocr || !videoId || !canUse('ocr')) return;
    let cancelled = false;
    loadOcrCues(cache, videoId)
      .then((cues) => {
        if (cancelled || !cues) return;
        builder.seed(cues);
        const s = store.getState();
        if (s.videoId === videoId && !s.track)
          s.setTrack(buildOcrTrack(videoId, builder.getCues()));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [cache, ocr, videoId, builder, store]);

  useEffect(() => {
    if (!active || !ocr || !player || !canUse('ocr')) return;
    let stopped = false;
    let busy = false;
    const reader = new BandReader(document);
    const auto = new AutoRegion();
    void ocr.prepare?.().catch(() => undefined);
    if (placement === 'auto') store.getState().setOcr({ found: null });
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const save = () => {
      saveTimer = null;
      const id = store.getState().videoId;
      if (cache && id) void saveOcrCues(cache, id, builder.getCues()).catch(() => undefined);
    };
    const publish = () => {
      const s = store.getState();
      s.setTrack(buildOcrTrack(s.videoId ?? '', builder.getCues()));
      if (cache && !saveTimer) saveTimer = setTimeout(save, SAVE_DELAY_MS);
    };
    // Reading again on a video read before: its lines show at once.
    if (builder.getCues().length > 0) publish();
    const block = () => {
      store.getState().setOcr({ active: false, editing: false });
      store.getState().setNotice(vi.ocrBlocked);
    };

    /**
     * The region to read now, or null while "Tự tìm" has found nothing yet. While a place is
     * only a candidate, what is read there is provisional: taken back if it is dropped.
     */
    let lastScan = -Infinity;
    const target = async (): Promise<OcrRegion | null | 'blocked'> => {
      if (placement === 'custom') return region;
      if (placement !== 'auto') return OCR_BANDS[placement];
      const now = Date.now();
      if (now - lastScan >= (auto.current ? OCR_SCAN_MS : OCR_SCAN_MS / 2)) {
        lastScan = now;
        const frame = await ocr.grab(WHOLE_FRAME, OCR_SCAN_WIDTH);
        if (frame === 'blocked') return 'blocked';
        if (frame) {
          const change = auto.update(findTextRegion(frame), now);
          if (!auto.current) {
            if (change.dropped && builder.rollback()) publish();
            if (change.started) builder.checkpoint();
          }
          if (change.confirmed) {
            builder.commit();
            store.getState().setOcr({ found: auto.current });
          }
        }
      }
      return auto.current ?? auto.candidate;
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
      if (!pixels) return void (builder.same(at) && publish());
      const band = reader.prepare(pixels, regionKey(where));
      if (band.kind === 'unchanged') return void (builder.same(at) && publish());
      const reading =
        band.kind === 'empty' ? { text: '', confidence: 0 } : await ocr.recognize(band.png);
      if (stopped) return;
      if (!reading) return void (builder.same(at) && publish());
      if (builder.feed(at, reading)) publish();
    };

    // When the picture includes the player's title and controls, wait until they hide.
    let playingSince = Date.now();
    const timer = setInterval(() => {
      if (player.isPaused() || ads?.isShowing()) {
        playingSince = Date.now();
        return;
      }
      if (busy || (ocr.showsPlayerUi && Date.now() - playingSince < PLAYER_UI_MS)) return;
      busy = true;
      step()
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    }, OCR_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
      // Stopping or choosing another place keeps what was read, even from a candidate.
      builder.commit();
      if (builder.flush()) publish();
      if (saveTimer) {
        clearTimeout(saveTimer);
        save();
      }
    };
  }, [active, placement, region, ocr, player, ads, store, builder, cache]);
}
