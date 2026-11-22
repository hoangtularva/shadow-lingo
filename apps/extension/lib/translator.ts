import type { TranslationAdapter, TranslatorState } from '@shadow-lingo/core';

/** The parts of Chrome's built-in Translator API (Chrome 138+, desktop) that we use. */
type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LanguagePair {
  sourceLanguage: string;
  targetLanguage: string;
}

interface ChromeTranslator {
  translate(text: string): Promise<string>;
}

export interface TranslatorFactory {
  availability(pair: LanguagePair): Promise<Availability>;
  create(options: LanguagePair & { monitor?: (m: EventTarget) => void }): Promise<ChromeTranslator>;
}

const PAIR: LanguagePair = { sourceLanguage: 'en', targetLanguage: 'vi' };
/** Longest sentence sent to the translator (merged sentences are far shorter). */
export const MAX_TRANSLATE_CHARS = 1000;

function isFactory(v: unknown): v is TranslatorFactory {
  return (
    typeof v === 'function' &&
    typeof (v as { availability?: unknown }).availability === 'function' &&
    typeof (v as { create?: unknown }).create === 'function'
  );
}

/** The global `Translator`, when this browser has it. */
export function findTranslatorFactory(scope: object = globalThis): TranslatorFactory | null {
  const t = (scope as { Translator?: unknown }).Translator;
  return isFactory(t) ? t : null;
}

function stateOf(a: Availability): TranslatorState {
  if (a === 'available') return 'ready';
  if (a === 'downloadable') return 'needs-download';
  if (a === 'downloading') return 'downloading';
  return 'unsupported';
}

function loadedOf(e: Event): number | null {
  const loaded = (e as Event & { loaded?: unknown }).loaded;
  return typeof loaded === 'number' && Number.isFinite(loaded)
    ? Math.min(1, Math.max(0, loaded))
    : null;
}

/**
 * EN→VI translation with Chrome's on-device model. Text never leaves the device; the
 * network is only used once by Chrome to download the language pack.
 */
export function createChromeTranslation(
  factory: TranslatorFactory | null = findTranslatorFactory(),
): TranslationAdapter {
  let instance: Promise<ChromeTranslator> | null = null;

  const create = (onProgress?: (fraction: number) => void) => {
    if (!factory) return Promise.reject(new Error('Translator API not available'));
    instance ??= factory
      .create({
        ...PAIR,
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            const p = loadedOf(e);
            if (p !== null) onProgress?.(p);
          });
        },
      })
      .catch((err: unknown) => {
        instance = null;
        throw err;
      });
    return instance;
  };

  return {
    async state() {
      if (!factory) return 'unsupported';
      try {
        return stateOf(await factory.availability(PAIR));
      } catch {
        return 'unsupported';
      }
    },
    async prepare(onProgress) {
      try {
        await create(onProgress);
        return true;
      } catch {
        return false;
      }
    },
    async translate(text) {
      const t = await create();
      return t.translate(text.slice(0, MAX_TRANSLATE_CHARS));
    },
  };
}
