// Builds the Android app's pages into dist/ (Capacitor copies them into the APK): the app
// with Vite, the data it loads at run time, and the script read by the embed frame.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { copyAppData } from '../../../packages/shell/scripts/copy-data.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');

await viteBuild({ configFile: join(root, 'vite.config.mts'), logLevel: 'warn' });
await copyAppData(out);
await build({
  entryPoints: [join(root, 'src/frame-hook.ts')],
  outfile: join(out, 'frame-hook.js'),
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
});
console.log('built dist/');
