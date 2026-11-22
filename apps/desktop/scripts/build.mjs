// Bundles the main process, the preload and the dev page into dist/ with esbuild.
// The preload runs sandboxed, so it must be a single CommonJS file.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
rmSync(out, { recursive: true, force: true });

const common = { bundle: true, sourcemap: false, logLevel: 'warning', legalComments: 'none' };
await build({
  ...common,
  entryPoints: [join(root, 'src/main/main.ts')],
  outfile: join(out, 'main/main.js'),
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
});
await build({
  ...common,
  entryPoints: [join(root, 'src/preload/preload.ts')],
  outfile: join(out, 'preload/preload.js'),
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
});
await build({
  ...common,
  entryPoints: [join(root, 'src/renderer/dev.ts')],
  outfile: join(out, 'renderer/dev.js'),
  platform: 'browser',
  format: 'esm',
  target: 'chrome140',
});
mkdirSync(join(out, 'renderer'), { recursive: true });
cpSync(join(root, 'src/renderer/index.html'), join(out, 'renderer/index.html'));
console.log('built dist/');
