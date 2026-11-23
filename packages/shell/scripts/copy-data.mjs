// Data the app pages load at run time, copied next to them: CMU Dict (IPA), Wiktionary shards,
// the offline translation model with its ONNX runtime, and the fonts. Used by the desktop and
// mobile builds.
import { cpSync, mkdirSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { fetchOcrData, ocrFiles } from '../../core/scripts/fetch-ocr-data.mjs';
import { fetchModel, MODEL_NAME } from './fetch-model.mjs';

const shell = join(dirname(fileURLToPath(import.meta.url)), '..');
const core = join(shell, '../core');

/**
 * Copies everything into `renderer` (the built pages' folder, with Vite's assets/ in it).
 * `ocr`: also ship Tesseract for "Đọc chữ trên hình" (apps that can capture the player).
 */
export async function copyAppData(renderer, { ocr = false } = {}) {
  if (ocr) {
    await fetchOcrData();
    mkdirSync(join(renderer, 'ocr'), { recursive: true });
    for (const f of ocrFiles(shell)) cpSync(f.src, join(renderer, 'ocr', f.dest));
  }
  mkdirSync(join(renderer, 'ipa'), { recursive: true });
  cpSync(join(core, 'data/cmudict.txt'), join(renderer, 'ipa/cmudict.txt'));
  cpSync(join(core, 'data/CMUDICT-LICENSE'), join(renderer, 'ipa/CMUDICT-LICENSE'));
  cpSync(join(core, 'data/dict'), join(renderer, 'dict'), { recursive: true });

  // Offline English → Vietnamese: the model (fetched once into .cache/, hash-checked) and the
  // ONNX runtime's WebAssembly files, served from the app like everything else.
  cpSync(await fetchModel(), join(renderer, 'models', MODEL_NAME), { recursive: true });
  // The runtime version transformers.js was built against (pnpm keeps it next to it).
  const transformers = realpathSync(join(shell, 'node_modules/@huggingface/transformers'));
  const ortDist = join(transformers, '../../onnxruntime-web/dist');
  mkdirSync(join(renderer, 'ort'), { recursive: true });
  for (const f of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) {
    cpSync(join(ortDist, f), join(renderer, 'ort', f));
  }
  // Vite also emits a hashed copy of the .wasm that the worker never loads (paths are set).
  for (const f of readdirSync(join(renderer, 'assets'))) {
    if (f.endsWith('.wasm')) rmSync(join(renderer, 'assets', f));
  }

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
}
