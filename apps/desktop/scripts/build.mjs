// Builds the desktop app into dist/: main process and preload with esbuild (the preload runs
// sandboxed, so it is a single CommonJS file), the renderer with Vite, then copies the data
// the panel loads at run time (CMU Dict, Wiktionary shards, translation model, fonts).
import { cpSync, mkdirSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { fetchModel, MODEL_NAME } from '../../../packages/shell/scripts/fetch-model.mjs';

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

// Offline English → Vietnamese: the model (fetched once into .cache/, hash-checked) and the
// ONNX runtime's WebAssembly files, served from the app like everything else.
cpSync(await fetchModel(), join(renderer, 'models', MODEL_NAME), { recursive: true });
// The runtime version transformers.js was built against (pnpm keeps it next to it).
const transformers = realpathSync(
  join(root, '../../packages/shell/node_modules/@huggingface/transformers'),
);
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
console.log(`built dist/ (${readdirSync(join(renderer, 'dict')).length} dictionary files)`);
