

import { cachedFiles, filesAreCached } from "../asr/modelCache";
import { SAMPLE_RATE } from "../audio/decode";

const MODEL_BASE =
  import.meta.env.VITE_SPEECH_MODEL_BASE_URL?.replace(/\/$/, "") || "/speech-model";

const DIARIZATION_URLS = [
  `${MODEL_BASE}/preload.data`,
  `${MODEL_BASE}/preload.js.metadata`,
];

export interface SentenceBounds {
  startMs: number;
  endMs: number;

  from: number;
  to: number;
}

type SpeakerConfidence = "high" | "medium" | "low";

export interface LabelledUnit {

  speaker: number | null;
  confidence: SpeakerConfidence;
}

export interface Tracker {

  label(samples: Float32Array): Promise<void>;

  readonly labels: LabelledUnit[];
  dispose(): void;
}

export const diarizationIsCached = (): Promise<boolean> => filesAreCached(DIARIZATION_URLS);

export async function diarizationIsAvailable(): Promise<boolean> {
  if (await diarizationIsCached()) return true;
  try {
    const response = await fetch(`${MODEL_BASE}/preload.js.metadata`, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function openTracker(
  onProgress: (loaded: number, total: number) => void,
): Promise<Tracker> {
  const [dataBlob, metadataBlob] = await cachedFiles(DIARIZATION_URLS, onProgress);
  const [{ createSpeakerTracker }, data, metadata] = await Promise.all([
    import("@sherpaw/speaker-diarization"),
    dataBlob.arrayBuffer(),
    metadataBlob.text().then((text) => JSON.parse(text)),
  ]);

  const tracker = await createSpeakerTracker({ model: { data, metadata } });
  const labels: LabelledUnit[] = [];

  return {
    labels,
    async label(samples: Float32Array) {
      const turn = await tracker.track(samples, SAMPLE_RATE);
      labels.push({ speaker: turn.speaker, confidence: turn.confidence });

      for (const revision of turn.revisions) {
        if (revision.index < labels.length) {
          labels[revision.index] = {
            speaker: revision.speaker,
            confidence: labels[revision.index]?.confidence ?? "low",
          };
        }
      }
    },
    dispose() {
      tracker.dispose();
    },
  };
}

const speakerCode = (index: number): string =>
  `SPEAKER_${String(index + 1).padStart(2, "0")}`;

const MIN_SPEAKER_SHARE = 0.01;
const MIN_SPEAKER_SECONDS = 4;

export function dropNegligibleSpeakers(
  perWord: (string | null)[],
  words: Array<{ start: number; end: number }>,
): (string | null)[] {
  const seconds = new Map<string, number>();
  let labelled = 0;
  for (const [at, code] of perWord.entries()) {
    const word = words[at];
    if (!code || !word) continue;
    const length = Math.max(0, word.end - word.start);
    seconds.set(code, (seconds.get(code) ?? 0) + length);
    labelled += length;
  }

  const floor = Math.max(MIN_SPEAKER_SECONDS, labelled * MIN_SPEAKER_SHARE);
  const negligible = new Set(
    [...seconds].filter(([, held]) => held < floor).map(([code]) => code),
  );
  if (negligible.size === 0) return perWord;

  return perWord.map((code) => (code && negligible.has(code) ? null : code));
}

export function renumberSpeakers(perWord: (string | null)[]): (string | null)[] {
  const order: string[] = [];
  for (const code of perWord) {
    if (code && !order.includes(code)) order.push(code);
  }
  const renamed = new Map(order.map((code, index) => [code, speakerCode(index)]));
  return perWord.map((code) => (code ? renamed.get(code) ?? null : null));
}

export function labelWords(
  wordCount: number,
  sentences: SentenceBounds[],
  labels: LabelledUnit[],
): (string | null)[] {
  const perWord: (string | null)[] = new Array(wordCount).fill(null);
  for (const [at, sentence] of sentences.entries()) {
    const label = labels[at]?.speaker;
    if (label == null) continue;
    const code = speakerCode(label);
    for (let word = sentence.from; word <= sentence.to && word < wordCount; word += 1) {
      perWord[word] = code;
    }
  }
  return perWord;
}
