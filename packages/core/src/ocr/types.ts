/** Part of the frame's height, from 0 (top edge) to 1 (bottom edge). */
export interface OcrRegion {
  from: number;
  to: number;
}

/**
 * Where subtitles are read: found automatically, a fixed band near the bottom or top, or the
 * region the learner chose.
 */
export type OcrPlacement = 'auto' | 'bottom' | 'top' | 'custom';

/** One frame read by the platform's OCR. */
export interface OcrReading {
  text: string;
  /** 0–100, from the OCR engine. */
  confidence: number;
}

/** RGBA pixels of part of a frame. */
export interface OcrPixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** What the platform provides for "Đọc chữ trên hình". Frames are only looked at in memory. */
export interface OcrAdapter {
  /**
   * The rows `region` of the video frame now showing, scaled to at most `maxWidth` pixels wide.
   * null when there is no frame (yet); 'blocked' when the video's pixels cannot be read.
   */
  grab(region: OcrRegion, maxWidth: number): Promise<OcrPixels | null | 'blocked'>;
  /** Reads the text in a black-on-white PNG (data URL). null when the engine failed. */
  recognize(png: string): Promise<OcrReading | null>;
  /** Loads the OCR engine ahead of the first frame (it takes a few seconds). */
  prepare?(): Promise<void>;
}
