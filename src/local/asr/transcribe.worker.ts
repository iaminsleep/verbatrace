import { env as ortEnv } from "onnxruntime-web";
import ortMjs from "onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url";
import ortWasm from "onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url";
import { fromUrls } from "parakeet.js";
import { cachedModel } from "./modelCache";
import type { FromWorker, TimedWord, ToWorker } from "./protocol";

const SAMPLE_RATE = 16_000;

const WINDOW_SECONDS = 90;

ortEnv.wasm.wasmPaths = { mjs: ortMjs, wasm: ortWasm };

type Model = Awaited<ReturnType<typeof fromUrls>>;

let modelReady: Promise<Model> | null = null;

const post = (message: FromWorker) => self.postMessage(message);

function load(
  urls: Parameters<typeof cachedModel>[0],
  threads: number,
): Promise<Model> {
  if (modelReady) return modelReady;
  modelReady = (async () => {
    const started = performance.now();
    const local = await cachedModel(urls, (loaded, total) =>
      post({ type: "download", loaded, total }),
    );
    try {
      const model = await fromUrls({
        encoderUrl: local.urls.encoder,
        decoderUrl: local.urls.decoder,
        tokenizerUrl: local.urls.tokenizer,
        backend: "wasm",
        preprocessorBackend: "js",
        cpuThreads: threads,
      });
      post({
        type: "ready",
        loadMs: Math.round(performance.now() - started),
        threads: ortEnv.wasm.numThreads ?? threads,
        isolated: self.crossOriginIsolated === true,
      });
      return model;
    } finally {
      local.revoke();
    }
  })();

  modelReady.catch(() => {
    modelReady = null;
  });
  return modelReady;
}

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  try {
    if (message.type === "load") {
      await load(message.urls, message.threads);
      return;
    }

    if (!modelReady) throw new Error("модель не загружена: не было команды load");
    const model = await modelReady;

    const at = performance.now();
    const out = await model.transcribeLongAudio(message.pcm, SAMPLE_RATE, {
      returnTimestamps: "word",
      returnConfidences: true,
      chunkLengthS: WINDOW_SECONDS,
    });

    const words: TimedWord[] = (out.words ?? []).map((word) => ({
      text: word.text,
      start: word.start_time + message.offsetSeconds,
      end: word.end_time + message.offsetSeconds,
      confidence: word.confidence ?? 1,
    }));

    post({
      type: "words",
      jobId: message.jobId,
      words,
      ms: Math.round(performance.now() - at),
    });
  } catch (error) {
    console.error("[verbatrace] worker failed", error);
    post({
      type: "error",
      jobId: message.type === "transcribe" ? message.jobId : undefined,
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
};
