

export interface ModelUrls {
  encoder: string;
  decoder: string;
  tokenizer: string;
}

export interface TimedWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export type ToWorker =
  | { type: "load"; urls: ModelUrls; threads: number }
  | {
      type: "transcribe";
      jobId: number;

      pcm: Float32Array;

      offsetSeconds: number;
    };

export type FromWorker =

  | { type: "download"; loaded: number; total: number }
  | { type: "ready"; loadMs: number; threads: number; isolated: boolean }
  | { type: "words"; jobId: number; words: TimedWord[]; ms: number }
  | { type: "error"; jobId?: number; message: string; name?: string; stack?: string };
