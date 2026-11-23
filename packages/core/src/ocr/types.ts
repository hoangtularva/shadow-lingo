/** Where burned-in subtitles sit in the frame. */
export type OcrBand = 'bottom' | 'top';

/** One frame read by the platform's OCR. */
export interface OcrReading {
  text: string;
  /** 0–100, from the OCR engine. */
  confidence: number;
}

/**
 * Reads the subtitle band of the video frame now showing. Resolves null when the band did not
 * change since the last call (nothing to read again), and 'blocked' when the video's pixels
 * cannot be read (protected video).
 */
export interface OcrAdapter {
  read(band: OcrBand): Promise<OcrReading | null | 'blocked'>;
  /** Loads the OCR engine ahead of the first frame (it takes a few seconds). */
  prepare?(): Promise<void>;
}
