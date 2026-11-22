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
  manifest: {
    name: 'ShadowLingo',
    description:
      'Luyện Shadowing tiếng Anh với video: phụ đề theo câu, IPA dưới từng chữ, nối âm và lưu ý phát âm cho người Việt.',
    permissions: ['storage', 'offscreen'],
    action: { default_title: 'Bật/tắt ShadowLingo' },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
    web_accessible_resources: [
      {
        resources: ['fonts/*.woff2'],
        matches: ['https://www.youtube.com/*'],
      },
    ],
  },
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
      for (const f of FONT_FILES) {
        files.push({ absoluteSrc: fontPath(f.pkg, f.file), relativeDest: `fonts/${f.file}` });
      }
    },
  },
});
