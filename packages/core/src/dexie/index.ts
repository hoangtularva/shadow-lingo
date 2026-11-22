/** IndexedDB stores (Dexie). A separate entry so the extension's content script never loads Dexie. */
export { openDb, ShadowLingoDb, type TranslationRow } from './db';
export { createDexieTranslationCache } from './translations';
export { createDexieVocabStore, LOG_DAYS, MAX_VOCAB } from './vocab-store';
