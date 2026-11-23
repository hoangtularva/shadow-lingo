// Builds the Android app's pages into dist/ (Capacitor copies them into the APK): the app
// with Vite, the data it loads at run time, the script read by the embed frame, and the iOS
// player page.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { copyAppData } from '../../../packages/shell/scripts/copy-data.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');

await viteBuild({ configFile: join(root, 'vite.config.mts'), logLevel: 'warn' });
// Tesseract ships too: the Android app reads burned-in subtitles (iOS does not yet).
await copyAppData(out, { ocr: true });
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
// iOS: the page that hosts the YouTube embed in its own WebView (see ShadowLingoPlugin.swift).
// Its one inline script is allowed by hash only.
const player = readFileSync(join(root, 'native/player.html'), 'utf8');
const script = player.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
const hash = createHash('sha256').update(script).digest('base64');
writeFileSync(join(out, 'player.html'), player.replace('__SCRIPT_HASH__', `sha256-${hash}`));
console.log('built dist/');
