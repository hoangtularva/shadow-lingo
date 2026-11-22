// Builds the desktop app into dist/: main process and preload with esbuild (the preload runs
// sandboxed, so it is a single CommonJS file), the renderer with Vite, then copies the data
// the panel loads at run time (CMU Dict, Wiktionary shards, fonts).
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const core = join(root, '../../packages/core');
const out = join(root, 'dist');
rmSync(out, { recursive: true, force: true });

const node = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  logLevel: 'warning',
  legalComments: 'none',
};
await build({
  ...node,
  entryPoints: [join(root, 'src/main/main.ts')],
  outfile: join(out, 'main/main.js'),
});
await build({
  ...node,
  entryPoints: [join(root, 'src/preload/preload.ts')],
  outfile: join(out, 'preload/preload.js'),
});
await viteBuild({ configFile: join(root, 'vite.config.mts'), logLevel: 'warn' });

const renderer = join(out, 'renderer');
mkdirSync(join(renderer, 'ipa'), { recursive: true });
cpSync(join(core, 'data/cmudict.txt'), join(renderer, 'ipa/cmudict.txt'));
cpSync(join(core, 'data/CMUDICT-LICENSE'), join(renderer, 'ipa/CMUDICT-LICENSE'));
cpSync(join(core, 'data/dict'), join(renderer, 'dict'), { recursive: true });

// Fonts from the @fontsource packages core depends on.
const fontsModule = await build({
  entryPoints: [join(core, 'src/fonts.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'warning',
});
const { FONT_FILES } = await import(
  `data:text/javascript;base64,${Buffer.from(fontsModule.outputFiles[0].text).toString('base64')}`
);
const require = createRequire(join(core, 'package.json'));
mkdirSync(join(renderer, 'fonts'), { recursive: true });
for (const f of FONT_FILES) {
  const pkg = dirname(require.resolve(`${f.pkg}/package.json`));
  cpSync(join(pkg, 'files', f.file), join(renderer, 'fonts', f.file));
}
console.log(`built dist/ (${readdirSync(join(renderer, 'dict')).length} dictionary files)`);
