

import { logError, logEvent } from "../diagnostics";
import { db, type FileRow, type WordRow } from "../db";
import {
  decodeAudio,
  SAMPLE_RATE,
  UndecodableAudioError,
  UnreadableMediaError,
} from "../audio/decode";
import { msToSamples, pcmSampleCount, readPcmRange, writePcm } from "../audio/pcm";
import {
  diarizationIsCached,
  dropNegligibleSpeakers,
  labelWords,
  openTracker,
  renumberSpeakers,
  type SentenceBounds,
  type Tracker,
} from "../diar/speakers";
import type { FromWorker, ModelUrls, TimedWord, ToWorker } from "../asr/protocol";
import { modelIsCached } from "../asr/modelCache";
import { buildTurns, capitaliseFirst, turnText } from "./segments";

const BLOCK_SECONDS = 300;
const OVERLAP_SECONDS = 10;

const THREADS = 4;

const MODEL_BASE =
  import.meta.env.VITE_SPEECH_MODEL_BASE_URL?.replace(/\/$/, "") || "/speech-model";

const MODEL_URLS: ModelUrls = {
  encoder: `${MODEL_BASE}/encoder-model.int8.onnx`,
  decoder: `${MODEL_BASE}/decoder_joint-model.int8.onnx`,
  tokenizer: `${MODEL_BASE}/vocab.txt`,
};

export type Stage =
  | "queued"
  | "decoding"
  | "downloading-model"
  | "transcribing"
  | "identifying-speakers"
  | "segmenting";

export interface PipelineState {
  fileId: number | null;
  stage: Stage;

  percent: number | null;
  queued: number;
}

type Listener = (state: PipelineState) => void;

class Pipeline {
  private worker: Worker | null = null;
  private loaded: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((error: Error) => void) | null = null;
  private readonly queue: number[] = [];
  private draining = false;
  private nextJobId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (words: TimedWord[]) => void; reject: (error: Error) => void }
  >();
  private readonly listeners = new Set<Listener>();
  private state: PipelineState = { fileId: null, stage: "queued", percent: null, queued: 0 };

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): PipelineState {
    return this.state;
  }

  private emit(patch: Partial<PipelineState>): void {
    if (patch.stage && (patch.stage !== this.state.stage || patch.fileId !== undefined && patch.fileId !== this.state.fileId)) {
      logEvent("processing.stage", { fileId: patch.fileId ?? this.state.fileId, stage: patch.stage });
    }
    this.state = { ...this.state, ...patch, queued: this.queue.length };
    for (const listener of this.listeners) listener(this.state);
  }

  async identifySpeakersOnly(fileId: number): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    this.emit({ fileId, stage: "identifying-speakers", percent: 0 });
    try {
      const claimed = await db.transaction("rw", db.files, async () => {
        const file = await db.files.get(fileId);
        if (file?.status !== "ready") return false;
        await db.files.update(fileId, { status: "processing", error_message: null });
        return true;
      });
      if (!claimed) return;
      const speakers = await this.identifySpeakers(fileId);
      this.emit({ fileId, stage: "segmenting", percent: null });
      await this.writeTurns(fileId, speakers.perWord);
      await db.files.update(fileId, {
        status: "ready",
        stage: null,
        progress_percent: 100,
        error_message: speakers.failure,
      });
    } catch (error) {
      logError("processing.speakers_error", error, { fileId });
      const message = error instanceof Error ? error.message : String(error);
      await db.files.update(fileId, {
        status: "ready",
        stage: null,
        error_message: `speakers-failed: ${message}`,
      });
    } finally {
      this.draining = false;
      this.emit({ fileId: null, stage: "queued", percent: null });
      if (this.queue.length) void this.drain();
    }
  }

  enqueue(fileId: number): void {
    if (this.queue.includes(fileId) || this.state.fileId === fileId) return;
    logEvent("processing.queue", { fileId });
    this.queue.push(fileId);
    this.emit({});
    void this.drain();
  }

  async resumeInterrupted(): Promise<void> {
    const unfinished = await db.files
      .where("status")
      .anyOf("pending", "processing")
      .toArray();
    unfinished.sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const file of unfinished) this.enqueue(file.id!);
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("../asr/transcribe.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<FromWorker>) => this.receive(event.data);
    worker.onerror = (event) => {
      const error = event.error instanceof Error ? event.error : new Error(event.message || "worker failed");
      logError("processing.worker_error", error, { fileId: this.state.fileId, line: event.lineno, column: event.colno });
      this.failAll(error);
    };
    this.worker = worker;
    return worker;
  }

  private receive(message: FromWorker): void {
    if (message.type === "download") {
      this.emit({
        stage: "downloading-model",
        percent: message.total ? Math.floor((message.loaded / message.total) * 100) : null,
      });
      return;
    }
    if (message.type === "ready") {
      this.resolveReady?.();
      this.resolveReady = null;
      this.rejectReady = null;
      if (!message.isolated) {
        console.warn("[verbatrace] Cross-origin isolation disabled. Recognition runs in one thread.");
      }
      return;
    }
    if (message.type === "words") {
      this.pending.get(message.jobId)?.resolve(message.words);
      this.pending.delete(message.jobId);
      return;
    }

    const error = new Error(message.message);
    error.name = message.name ?? "Error";
    error.stack = message.stack;
    if (message.jobId != null) {
      const waiting = this.pending.get(message.jobId);
      this.pending.delete(message.jobId);
      waiting?.reject(error);
      return;
    }
    this.failAll(error);
  }

  private failAll(error: Error): void {
    for (const waiting of this.pending.values()) waiting.reject(error);
    this.pending.clear();
    this.rejectReady?.(error);
    this.resolveReady = null;
    this.rejectReady = null;

    this.worker?.terminate();
    this.worker = null;
    this.loaded = null;
  }

  private send(message: ToWorker, transfer?: Transferable[]): void {
    this.ensureWorker().postMessage(message, transfer ?? []);
  }

  private async load(): Promise<void> {
    if (this.loaded) return this.loaded;
    this.loaded = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    if (!(await modelIsCached(MODEL_URLS))) {
      this.emit({ stage: "downloading-model", percent: 0 });
    }
    this.send({ type: "load", urls: MODEL_URLS, threads: THREADS });
    return this.loaded;
  }

  private transcribeBlock(pcm: Float32Array, offsetSeconds: number): Promise<TimedWord[]> {
    const jobId = this.nextJobId;
    this.nextJobId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(jobId, { resolve, reject });
      this.send({ type: "transcribe", jobId, pcm, offsetSeconds }, [pcm.buffer]);
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      for (;;) {
        const fileId = this.queue.shift();
        if (fileId == null) break;
        this.emit({ fileId, stage: "queued", percent: null });
        try {
          await this.process(fileId);
        } catch (error) {
          logError("processing.error", error, { fileId, stage: this.state.stage });
          const message = error instanceof Error ? error.message : String(error);
          await db.files.update(fileId, {
            status: "error",
            error_message: this.state.stage === "downloading-model" ? "model-failed" : message,
            stage: null,
            progress_percent: null,
          });
          console.error("[verbatrace] Processing failed", message);
        }
      }
      this.emit({ fileId: null, stage: "queued", percent: null });
    } finally {
      this.draining = false;
    }
  }

  private async process(fileId: number): Promise<void> {
    const file = await db.transaction("rw", db.files, async () => {
      const recording = await db.files.get(fileId);
      if (!recording || recording.status !== "pending" && recording.status !== "processing") return null;
      await db.files.update(fileId, { status: "processing" });
      return recording;
    });
    if (!file) return;

    const totalSamples = await this.prepareAudio(file);
    if (totalSamples === 0) throw new Error("no-audio");

    const totalSeconds = totalSamples / SAMPLE_RATE;
    await this.load();

    let doneSeconds = file.done_seconds ?? 0;

    let from = Math.max(0, doneSeconds - (doneSeconds > 0 ? OVERLAP_SECONDS : 0));

    while (from < totalSeconds) {
      const to = Math.min(totalSeconds, from + BLOCK_SECONDS);
      this.emit({
        fileId,
        stage: "transcribing",
        percent: Math.floor((from / totalSeconds) * 100),
      });

      const pcm = await readPcmRange(
        fileId,
        Math.round(from * SAMPLE_RATE),
        Math.round(to * SAMPLE_RATE),
      );
      const words = await this.transcribeBlock(pcm, from);
      await this.appendWords(fileId, words);

      doneSeconds = to;
      await db.files.update(fileId, {
        status: "processing",
        stage: "transcribing",
        done_seconds: doneSeconds,
        progress_percent: Math.floor((doneSeconds / totalSeconds) * 100),
      });

      if (to >= totalSeconds) break;
      from = to - OVERLAP_SECONDS;
    }

    const project = await db.projects.get(file.project_id);
    const speakers = project?.enable_diarization
      ? await this.identifySpeakers(fileId)
      : { perWord: null, failure: null };

    this.emit({ fileId, stage: "segmenting", percent: null });
    await this.writeTurns(fileId, speakers.perWord);
    await db.files.update(fileId, {
      status: "ready",
      stage: null,
      progress_percent: 100,

      error_message: speakers.failure,
    });
    logEvent("processing.complete", { fileId });
  }

  private async identifySpeakers(
    fileId: number,
  ): Promise<{ perWord: (string | null)[] | null; failure: string | null }> {
    const rows = await this.storedWords(fileId);
    if (rows.length === 0) return { perWord: null, failure: null };

    const words = toTimedWords(rows);

    const sentences: SentenceBounds[] = [];
    let at = 0;
    for (const sentence of buildTurns(words)) {
      sentences.push({
        startMs: Math.round(sentence.words[0].start * 1000),
        endMs: Math.round(sentence.words[sentence.words.length - 1].end * 1000),
        from: at,
        to: at + sentence.words.length - 1,
      });
      at += sentence.words.length;
    }

    let tracker: Tracker | null = null;
    try {
      if (!(await diarizationIsCached())) {
        this.emit({ fileId, stage: "downloading-model", percent: 0 });
      }
      tracker = await openTracker((loaded, total) =>
        this.emit({
          fileId,
          stage: "downloading-model",
          percent: total ? Math.floor((loaded / total) * 100) : null,
        }),
      );

      let shown = -1;
      for (const [index, sentence] of sentences.entries()) {
        const percent = Math.floor((index / sentences.length) * 100);
        if (percent !== shown) {
          shown = percent;
          this.emit({ fileId, stage: "identifying-speakers", percent });
          await db.files.update(fileId, {
            stage: "identifying-speakers",
            progress_percent: percent,
          });
        }
        const samples = await readPcmRange(
          fileId,
          msToSamples(sentence.startMs),
          msToSamples(sentence.endMs),
        );
        await tracker.label(samples);
      }

      const perWord = labelWords(words.length, sentences, tracker.labels);
      const labelled = renumberSpeakers(dropNegligibleSpeakers(perWord, words));

      if (labelled.every((code) => code === null)) {
        return { perWord: null, failure: "speakers-failed: no-voices" };
      }
      return { perWord: labelled, failure: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError("processing.speakers_error", error, { fileId });
      console.warn("[verbatrace] Speaker identification failed", message);

      return { perWord: null, failure: `speakers-failed: ${message}` };
    } finally {
      tracker?.dispose();
    }
  }

  private storedWords(fileId: number) {
    return db.words
      .where("[file_id+sequence_index]")
      .between([fileId, -Infinity], [fileId, Infinity])
      .toArray();
  }

  private async prepareAudio(file: FileRow): Promise<number> {
    const fileId = file.id!;
    const already = await pcmSampleCount(fileId);
    if (already > 0) return already;

    this.emit({ fileId, stage: "decoding", percent: null });
    await db.files.update(fileId, {
      status: "processing",
      stage: "decoding",
      progress_percent: null,
      error_message: null,
    });

    const media = await db.media.get(fileId);
    if (!media) throw new Error("media-lost: file not found");

    let audio: AudioBuffer;
    try {
      audio = await decodeAudio(media.blob, file.filename);
    } catch (error) {
      if (error instanceof UnreadableMediaError) {
        throw new Error(`media-lost: ${error.reason}`, { cause: error });
      }
      if (error instanceof UndecodableAudioError) {

        throw new Error(`undecodable: ${error.reason}`, { cause: error });
      }
      throw error;
    }

    const count = await writePcm(fileId, audio);
    await db.files.update(fileId, {
      duration_ms: Math.round((count / SAMPLE_RATE) * 1000),
    });
    return count;
  }

  private async appendWords(fileId: number, words: TimedWord[]): Promise<void> {
    if (words.length === 0) return;

    const lastStored = await db.words
      .where("[file_id+sequence_index]")
      .between([fileId, -Infinity], [fileId, Infinity])
      .last();

    let furthest = lastStored ? lastStored.end_ms / 1000 : 0;
    const fresh: TimedWord[] = [];
    for (const word of words) {
      if (word.start < furthest) continue;
      fresh.push(word);
      if (word.end > furthest) furthest = word.end;
    }
    if (fresh.length === 0) return;

    const nextIndex = (lastStored?.sequence_index ?? -1) + 1;
    await db.words.bulkAdd(
      fresh.map((word, at) => ({
        file_id: fileId,
        sequence_index: nextIndex + at,
        text: word.text,
        start_ms: Math.round(word.start * 1000),
        end_ms: Math.round(word.end * 1000),
        confidence: word.confidence,
        speaker_id: null,
        segment_id: null,
      })),
    );
  }

  private async writeTurns(
    fileId: number,
    speakerOfWord: (string | null)[] | null,
  ): Promise<void> {
    const rows = await this.storedWords(fileId);
    if (rows.length === 0) return;

    const words = toTimedWords(rows);
    const turns = buildTurns(words, speakerOfWord ?? undefined);
    for (const turn of turns) capitaliseFirst(turn.words);

    const codes: string[] = [];
    for (const code of speakerOfWord ?? []) {
      if (code && !codes.includes(code)) codes.push(code);
    }
    codes.sort();

    await db.transaction("rw", [db.segments, db.words, db.speakers], async () => {
      await db.segments.where("file_id").equals(fileId).delete();
      await db.speakers.where("file_id").equals(fileId).delete();

      const speakerIds = (await db.speakers.bulkAdd(

        codes.map((code) => ({
          file_id: fileId,
          speaker_code: code,
          display_name: null,
          color: null,
        })),
        { allKeys: true },
      )) as unknown as number[];
      const idOfCode = new Map(codes.map((code, index) => [code, speakerIds[index]]));

      const segmentIds = (await db.segments.bulkAdd(
        turns.map((turn, index) => ({
          file_id: fileId,
          segment_index: index,
          text: turnText(turn.words),
          start_ms: Math.round(turn.words[0].start * 1000),
          end_ms: Math.round(turn.words[turn.words.length - 1].end * 1000),
          speaker_id: turn.speaker != null ? idOfCode.get(turn.speaker) ?? null : null,
          flagged: false,
        })),
        { allKeys: true },
      )) as unknown as number[];

      let at = 0;
      const updated: WordRow[] = [];
      for (const [index, turn] of turns.entries()) {
        const speakerId = turn.speaker != null ? idOfCode.get(turn.speaker) ?? null : null;
        for (const word of turn.words) {
          updated.push({
            ...rows[at],
            segment_id: segmentIds[index],

            text: word.text,

            speaker_id: speakerId,
          });
          at += 1;
        }
      }
      await db.words.bulkPut(updated);
    });
  }
}

function toTimedWords(rows: WordRow[]): TimedWord[] {
  return rows.map((row) => ({
    text: row.text,
    start: row.start_ms / 1000,
    end: row.end_ms / 1000,
    confidence: row.confidence,
  }));
}

export const pipeline = new Pipeline();
