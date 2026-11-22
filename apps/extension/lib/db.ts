/** Background only (Dexie must never reach the content script). */
export {
  createDexieVocabStore,
  LOG_DAYS,
  MAX_VOCAB,
  openDb,
  ShadowLingoDb,
  type TranslationRow,
} from '@shadow-lingo/core/dexie';
