import {
  AutoModelForSeq2SeqLM,
  AutoTokenizer,
  env,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  type Tensor,
} from '@huggingface/transformers';
import { MAX_CHARS, MODEL_NAME, type WorkerReply, type WorkerRequest } from './protocol';

// Everything comes from the app's own files: no model hub, no CDN, no browser cache.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useBrowserCache = false;
env.useWasmCache = false;

interface Loaded {
  tokenizer: PreTrainedTokenizer;
  model: PreTrainedModel;
}

let model: Promise<Loaded> | null = null;

function load(base: string): Promise<Loaded> {
  if (!model) {
    // A path, not a full URL: transformers.js only looks up full URLs on the model hub.
    env.localModelPath = new URL('models/', base).pathname;
    const onnx = env.backends.onnx;
    if (onnx.wasm) {
      onnx.wasm.wasmPaths = {
        mjs: new URL('ort/ort-wasm-simd-threaded.asyncify.mjs', base).href,
        wasm: new URL('ort/ort-wasm-simd-threaded.asyncify.wasm', base).href,
      };
      onnx.wasm.numThreads = 1;
      onnx.wasm.proxy = false;
    }
    model = Promise.all([
      AutoTokenizer.from_pretrained(MODEL_NAME),
      AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME, { dtype: 'q8', device: 'wasm' }),
    ])
      .then(([tokenizer, seq2seq]) => ({ tokenizer, model: seq2seq }))
      .catch((err: unknown) => {
        model = null;
        throw err;
      });
  }
  return model;
}

async function handle(req: WorkerRequest): Promise<WorkerReply> {
  const { tokenizer, model: seq2seq } = await load(req.base);
  if (req.kind === 'load') return { id: req.id, ok: true };
  const inputs = tokenizer(req.text.slice(0, MAX_CHARS), { truncation: true });
  const out = (await seq2seq.generate({ ...inputs, max_new_tokens: 256 })) as Tensor;
  const [vi = ''] = tokenizer.batch_decode(out, { skip_special_tokens: true });
  return { id: req.id, ok: true, vi };
}

// One request at a time: the model is single-threaded and the panel already queues.
let chain = Promise.resolve();
self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  chain = chain.then(async () => {
    let reply: WorkerReply;
    try {
      reply = await handle(req);
    } catch {
      reply = { id: req.id, ok: false };
    }
    self.postMessage(reply);
  });
};
