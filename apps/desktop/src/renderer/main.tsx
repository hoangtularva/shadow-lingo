import { buildFontFaceCss, createLocalPos, type PosAdapter } from '@shadow-lingo/core';
import {
  createDexieTranslationCache,
  createDexieVocabStore,
  openDb,
} from '@shadow-lingo/core/dexie';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createLocalStorageAdapter } from './adapters';
import './styles.css';

// Bundled fonts, served next to the page.
const fonts = document.createElement('style');
fonts.textContent = buildFontFaceCss((file) => `fonts/${file}`);
document.head.append(fonts);

/** The part-of-speech tagger (compromise) loads on first use. */
function lazyPos(): PosAdapter {
  let inner: Promise<PosAdapter> | null = null;
  return {
    async tag(sentences) {
      inner ??= import('@shadow-lingo/core/pos-tagger').then((m) => createLocalPos(m.tagSentence));
      return (await inner).tag(sentences);
    },
  };
}

const db = openDb();
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <App
      services={{
        storage: createLocalStorageAdapter(),
        vocab: createDexieVocabStore(db),
        translationCache: createDexieTranslationCache(db),
        pos: lazyPos(),
      }}
    />,
  );
}
