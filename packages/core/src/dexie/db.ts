import type { Translation } from '../adapters';
import type { VocabEntry } from '../vocab';
import Dexie, { type Table } from 'dexie';

/**
 * The app's IndexedDB (Dexie). Extension: background only, never the content script.
 * Desktop: the renderer.
 */
export interface TranslationRow extends Translation {
  videoId: string;
  hash: string;
  /** Last change, ms since epoch. */
  at: number;
}

export class ShadowLingoDb extends Dexie {
  translations!: Table<TranslationRow, [string, string]>;
  vocab!: Table<VocabEntry, string>;
  reviewLog!: Table<{ day: string; count: number }, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ translations: '[videoId+hash], videoId, at' });
    this.version(2).stores({ vocab: 'id, addedAt' });
    this.version(3).stores({ reviewLog: 'day' });
  }
}

export function openDb(name = 'shadowlingo'): ShadowLingoDb {
  return new ShadowLingoDb(name);
}
