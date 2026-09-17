// perplexity.js — OPTIONAL second AI-writing signal using a real language model
// (distilgpt2) running in the browser via transformers.js.
//
// Idea: language models find AI-generated text more *predictable* (lower
// perplexity) and more *uniform* (low token-level burstiness) than human text.
// We compute, per paragraph, the model's mean negative log-likelihood over the
// tokens (-> perplexity) and the spread of token NLLs (-> burstiness), then map
// those to a 0-100 signal.
//
// This is heavy and opt-in: the library + model (~tens of MB) are fetched on
// demand the first time and cached by the browser. The core heuristic detector
// stays fully offline; only this module reaches the network (jsDelivr for the
// library, the Hugging Face Hub for the model weights).
//
// EXPERIMENTAL: the perplexity->signal calibration is model-specific and
// approximate. Treat it as corroborating evidence, never as proof.

import { splitParagraphs } from './detection.js';

// Self-hosted: the library and the ONNX runtime WASM are vendored in
// docs/vendor/transformers/ (no CDN). Resolved relative to THIS module so it works
// under the /AITrace/ project-page sub-path. Only the model weights are still
// fetched from the Hugging Face Hub (data, not executed code).
// Browser build (dist/transformers.min.js) — Node builtins (fs/path/onnxruntime-node)
// are stubbed out in this build; the .mjs is the Node build and must NOT be used here.
const TRANSFORMERS_URL = new URL('../vendor/transformers/transformers.min.js', import.meta.url).href;
const WASM_PATH = new URL('../vendor/transformers/', import.meta.url).href;
const MODEL_ID = 'Xenova/distilgpt2';
const MAX_TOKENS = 256; // truncate long paragraphs to keep inference bounded

let _tokenizer = null;
let _model = null;
let _loading = null;

export function isReady() {
  return Boolean(_model && _tokenizer);
}

/**
 * Lazily load transformers.js + the model. `onProgress` receives the library's
 * progress events ({ status, file, progress, loaded, total }).
 */
export async function loadModel(onProgress) {
  if (isReady()) return;
  if (_loading) return _loading;

  _loading = (async () => {
    const tx = await import(/* @vite-ignore */ TRANSFORMERS_URL);
    const { AutoTokenizer, AutoModelForCausalLM, env } = tx;
    if (env) {
      env.allowLocalModels = false; // model weights still come from the HF Hub
      // Load the ONNX runtime WASM from our own origin, not a CDN.
      if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
        env.backends.onnx.wasm.wasmPaths = WASM_PATH;
        env.backends.onnx.wasm.numThreads = 1; // no cross-origin isolation on Pages
      }
    }

    _tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
    try {
      // Quantized weights are far smaller/faster; fall back to default if the
      // build doesn't offer them.
      _model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
        dtype: 'q8',
        progress_callback: onProgress,
      });
    } catch {
      _model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
        progress_callback: onProgress,
      });
    }
  })();

  try {
    await _loading;
  } finally {
    _loading = null;
  }
}

function mean(a) {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
}
function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
}
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// Per-token negative log-likelihoods for one paragraph.
async function tokenNlls(text) {
  const inputs = await _tokenizer(text, { truncation: true, max_length: MAX_TOKENS });
  const output = await _model(inputs);
  const logits = output.logits; // Tensor [1, seq, vocab]
  const [, seq, vocab] = logits.dims;
  const data = logits.data; // Float32Array (seq*vocab)
  const ids = inputs.input_ids.data; // typically BigInt64Array

  const nlls = [];
  // Position t predicts token t+1 (causal LM).
  for (let t = 0; t < seq - 1; t += 1) {
    const off = t * vocab;
    let max = -Infinity;
    for (let v = 0; v < vocab; v += 1) {
      const val = data[off + v];
      if (val > max) max = val;
    }
    let sum = 0;
    for (let v = 0; v < vocab; v += 1) sum += Math.exp(data[off + v] - max);
    const target = Number(ids[t + 1]);
    const logProb = data[off + target] - max - Math.log(sum);
    nlls.push(-logProb);
  }
  return nlls;
}

// Map perplexity + burstiness to a 0-100 AI signal (experimental calibration).
function toSignal(perplexity, burstiness) {
  // Lower perplexity -> more predictable -> higher AI signal.
  // distilgpt2: human prose commonly ~40-100+, generated text often ~10-30.
  const pplSignal = clamp(((70 - perplexity) / 55) * 100, 0, 100);
  // Lower token-NLL spread -> more uniform -> higher AI signal.
  const burstSignal = clamp(((3.2 - burstiness) / 3.2) * 100, 0, 100);
  return Math.round(0.75 * pplSignal + 0.25 * burstSignal);
}

function band(signal) {
  if (signal == null) return 'unknown';
  if (signal >= 65) return 'high';
  if (signal >= 40) return 'moderate';
  return 'low';
}

/**
 * Run the perplexity signal over the paragraphs at the given indices (aligned
 * with the heuristic detector's paragraph indices). `onStep(done, total)` is
 * called after each paragraph so the UI can show progress.
 */
export async function analyzePerplexity(fullText, indices, onStep) {
  if (!isReady()) throw new Error('Model not loaded');
  const paragraphs = splitParagraphs(fullText);
  const byIndex = {};
  let done = 0;

  for (const idx of indices) {
    const text = paragraphs[idx];
    if (!text || text.length < 80) {
      byIndex[idx] = { index: idx, signal: null, band: 'unknown' };
    } else {
      const nlls = await tokenNlls(text);
      if (nlls.length < 8) {
        byIndex[idx] = { index: idx, signal: null, band: 'unknown' };
      } else {
        const meanNll = mean(nlls);
        const perplexity = Math.exp(meanNll);
        const burstiness = stdev(nlls);
        const signal = toSignal(perplexity, burstiness);
        byIndex[idx] = {
          index: idx,
          perplexity: Math.round(perplexity * 10) / 10,
          burstiness: Math.round(burstiness * 100) / 100,
          tokens: nlls.length + 1,
          signal,
          band: band(signal),
        };
      }
    }
    done += 1;
    if (onStep) onStep(done, indices.length);
    // Yield to the event loop so the UI stays responsive.
    await new Promise((r) => setTimeout(r, 0));
  }

  const assessed = Object.values(byIndex).filter((r) => r.signal != null);
  let weight = 0;
  let acc = 0;
  for (const r of assessed) {
    const w = r.tokens || 1;
    acc += r.signal * w;
    weight += w;
  }
  const overall = weight ? Math.round(acc / weight) : null;

  return {
    model: MODEL_ID,
    overallSignal: overall,
    overallBand: band(overall),
    assessed: assessed.length,
    byIndex,
    disclaimer:
      'Perplexity signal from an in-browser language model (distilgpt2). Experimental ' +
      'and model-specific; corroborating evidence only, not proof of AI authorship.',
  };
}
