import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { FONT_FILES } from '@shadow-lingo/core';
import { defineConfig } from 'wxt';

const require = createRequire(import.meta.url);

/** Resolves a bundled font file inside its @fontsource package. */
function fontPath(pkg: string, file: string): string {
  const pkgJson = require.resolve(`${pkg}/package.json`, {
    paths: [join(import.meta.dirname, '../../packages/core')],
  });
  return join(dirname(pkgJson), 'files', file);
}

export default defineConfig({
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  zip: {
    artifactTemplate: 'shadowlingo-{{version}}-{{browser}}.zip',
    sourcesTemplate: 'shadowlingo-{{version}}-sources.zip',
  },
  // Manifest V3 for Firefox too: the caption hook runs in the page (world: MAIN), MV3 only.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'ShadowLingo',
    description:
      'Luyện Shadowing tiếng Anh với video: phụ đề theo câu, IPA dưới từng chữ, nối âm và lưu ý phát âm cho người Việt.',
    // Firefox has no offscreen documents: its background page records and reads text itself.
    permissions: browser === 'firefox' ? ['storage'] : ['storage', 'offscreen'],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'shadowlingo@hoangtularva.github.io',
              // world: MAIN content scripts (128+) and data_collection_permissions (142+).
              strict_min_version: '142.0',
              // Nothing is collected: no server, everything stays on the device.
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
    action: { default_title: 'Bật/tắt ShadowLingo' },
    content_security_policy: {
      // 'wasm-unsafe-eval': Tesseract's WebAssembly (bundled) in the offscreen document.
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    web_accessible_resources: [
      {
        resources: ['fonts/*.woff2'],
        matches: ['https://www.youtube.com/*'],
      },
    ],
  }),
  hooks: {
    'build:publicAssets': (_wxt, files) => {
      files.push({
        absoluteSrc: join(import.meta.dirname, '../../packages/core/data/cmudict.txt'),
        relativeDest: 'ipa/cmudict.txt',
      });
      files.push({
        absoluteSrc: join(import.meta.dirname, '../../packages/core/data/CMUDICT-LICENSE'),
        relativeDest: 'ipa/CMUDICT-LICENSE',
      });
      // Wiktionary definitions (CC BY-SA 4.0), one file per first letter.
      const dictDir = join(import.meta.dirname, '../../packages/core/data/dict');
      if (existsSync(dictDir)) {
        for (const f of readdirSync(dictDir)) {
          files.push({ absoluteSrc: join(dictDir, f), relativeDest: `dict/${f}` });
        }
      }
      // "Đọc chữ trên hình": Tesseract's worker, its WebAssembly core and the English data
      // (Apache-2.0), all inside the package. The data is fetched once by
      // packages/core/scripts/fetch-ocr-data.mjs (pinned, hash-checked) before the build.
      const tesseract = dirname(require.resolve('tesseract.js/package.json'));
      const core = dirname(
        createRequire(join(tesseract, 'package.json')).resolve('tesseract.js-core/package.json'),
      );
      files.push({
        absoluteSrc: join(tesseract, 'dist/worker.min.js'),
        relativeDest: 'ocr/worker.min.js',
      });
      files.push({
        absoluteSrc: join(core, 'tesseract-core-simd-lstm.wasm.js'),
        relativeDest: 'ocr/tesseract-core-simd-lstm.wasm.js',
      });
      files.push({
        absoluteSrc: join(tesseract, 'LICENSE.md'),
        relativeDest: 'ocr/LICENSE-tesseract.js.md',
      });
      files.push({
        absoluteSrc: join(core, 'LICENSE'),
        relativeDest: 'ocr/LICENSE-tesseract.js-core.txt',
      });
      for (const name of ['eng.traineddata', 'NOTICE.txt']) {
        const src = join(import.meta.dirname, '../../packages/core/.cache/ocr', name);
        if (existsSync(src)) files.push({ absoluteSrc: src, relativeDest: `ocr/${name}` });
      }
      for (const f of FONT_FILES) {
        files.push({ absoluteSrc: fontPath(f.pkg, f.file), relativeDest: `fonts/${f.file}` });
      }
    },
  },
});
