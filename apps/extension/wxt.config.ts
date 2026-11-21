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
      'Luyện nói đuổi (shadowing) tiếng Anh với video: phụ đề theo câu, bấm để tua, dán bản chép lời.',
    permissions: ['storage'],
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
      for (const f of FONT_FILES) {
        files.push({ absoluteSrc: fontPath(f.pkg, f.file), relativeDest: `fonts/${f.file}` });
      }
    },
  },
});
