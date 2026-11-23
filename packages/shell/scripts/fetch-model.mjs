// Downloads the offline English → Vietnamese model (OPUS-MT en-vi, ONNX int8 conversion) at a
// pinned revision into .cache/, checking every file's hash. The build copies it into the app,
// so the installed app translates with no download and no network.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODEL_NAME = 'opus-mt-en-vi';
const REPO = 'Xenova/opus-mt-en-vi';
const REVISION = '30bcd461c0d7338ad106b36314d3eedc2d4e998c';

/** Small files: git blob sha1. ONNX files (LFS): sha256. */
const FILES = [
  { path: 'config.json', size: 1389, gitSha1: '86ba342d2fcd025ca82afec6169c2e96dd1f761c' },
  {
    path: 'generation_config.json',
    size: 293,
    gitSha1: '20b9442c4b19ec2d6b172078b9bf0f23f177fae2',
  },
  { path: 'tokenizer.json', size: 5163544, gitSha1: '8d97f5657db110e6e70fe43a52bbdf119df40671' },
  {
    path: 'tokenizer_config.json',
    size: 282,
    gitSha1: '803e7c431bb207c67da6ca6b70d5eea9a3bb6123',
  },
  {
    path: 'onnx/encoder_model_quantized.onnx',
    size: 47105950,
    sha256: 'dfcd7a32be3fdd21cbcf5d354520d626f1768fd6e205ca62a6a11a4641d31f36',
  },
  {
    path: 'onnx/decoder_model_merged_quantized.onnx',
    size: 54373748,
    sha256: '1cfc6a84f9c189e6928c9710b281fae3f1f42d4ffbba109e7b4ec8e31ceb06dd',
  },
];

const NOTICE = `OPUS-MT en-vi (Helsinki-NLP, University of Helsinki), Apache License 2.0.
https://huggingface.co/Helsinki-NLP/opus-mt-en-vi
ONNX conversion: https://huggingface.co/${REPO} (revision ${REVISION}).
Runs on this device only; nothing is sent anywhere.
`;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const modelDir = join(root, '.cache', MODEL_NAME);

function matches(file, buf) {
  if (buf.length !== file.size) return false;
  if (file.sha256) return createHash('sha256').update(buf).digest('hex') === file.sha256;
  const blob = createHash('sha1');
  blob.update(`blob ${buf.length}\0`);
  blob.update(buf);
  return blob.digest('hex') === file.gitSha1;
}

/** Makes sure every model file is in .cache/ with the right hash; returns the folder. */
export async function fetchModel() {
  for (const file of FILES) {
    const dest = join(modelDir, file.path);
    if (existsSync(dest) && matches(file, readFileSync(dest))) continue;
    const url = `https://huggingface.co/${REPO}/resolve/${REVISION}/${file.path}`;
    console.log(`downloading ${file.path} (${(file.size / 1e6).toFixed(1)} MB)`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!matches(file, buf)) throw new Error(`${file.path}: hash mismatch`);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(`${dest}.part`, buf);
    renameSync(`${dest}.part`, dest);
  }
  writeFileSync(join(modelDir, 'NOTICE.txt'), NOTICE);
  return modelDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await fetchModel();
  console.log(`model ready in ${modelDir}`);
}
