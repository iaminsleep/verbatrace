

export const SAMPLE_RATE = 16_000;

const CHUNK_SECONDS = 60;
export const CHUNK_SAMPLES = SAMPLE_RATE * CHUNK_SECONDS;

const describe = (cause: unknown): string =>
  cause instanceof Error
    ? `${cause.name}: ${cause.message}`.slice(0, 160)
    : String(cause).slice(0, 160);

export class UndecodableAudioError extends Error {
  readonly reason: string;

  constructor(readonly filename: string, cause: unknown) {
    const reason = describe(cause);
    super(`Браузер не смог декодировать «${filename}» — ${reason}`, { cause });
    this.name = "UndecodableAudioError";
    this.reason = reason;
  }
}

export class UnreadableMediaError extends Error {
  readonly reason: string;

  constructor(readonly filename: string, cause: unknown) {
    const reason = describe(cause);
    super(`Не удалось прочитать байты «${filename}» — ${reason}`, { cause });
    this.name = "UnreadableMediaError";
    this.reason = reason;
  }
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);

  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) mono[i] += data[i];
  }
  const scale = 1 / buffer.numberOfChannels;
  for (let i = 0; i < length; i += 1) mono[i] *= scale;
  return mono;
}

export async function decodeAudio(blob: Blob, filename = "запись"): Promise<AudioBuffer> {

  let bytes: ArrayBuffer;
  try {
    bytes = await blob.arrayBuffer();
  } catch (error) {
    throw new UnreadableMediaError(filename, error);
  }
  if (bytes.byteLength === 0) {
    throw new UnreadableMediaError(filename, new Error("прочиталось ноль байт"));
  }

  const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  try {
    return await ctx.decodeAudioData(bytes);
  } catch (error) {
    throw new UndecodableAudioError(filename, error);
  }
}

export function monoInt16(buffer: AudioBuffer, from: number, to: number): Int16Array {
  const end = Math.min(to, buffer.length);
  const out = new Int16Array(Math.max(0, end - from));
  if (out.length === 0) return out;

  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c += 1) channels.push(buffer.getChannelData(c));
  const scale = 1 / channels.length;

  for (let at = from; at < end; at += 1) {
    let sum = 0;
    for (const channel of channels) sum += channel[at];
    const value = sum * scale;
    const clamped = value < -1 ? -1 : value > 1 ? 1 : value;
    out[at - from] = Math.round(clamped * 32767);
  }
  return out;
}

export async function decodeTo16kMono(
  blob: Blob,
  filename = "запись",
): Promise<Float32Array> {
  return mixToMono(await decodeAudio(blob, filename));
}

export function toInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = samples[i] < -1 ? -1 : samples[i] > 1 ? 1 : samples[i];
    out[i] = Math.round(clamped * 32767);
  }
  return out;
}

export function toFloat32(samples: Int16Array): Float32Array {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) out[i] = samples[i] / 32768;
  return out;
}

export function encodeWav(samples: Int16Array, sampleRate = SAMPLE_RATE): Blob {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const dataBytes = samples.length * 2;
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(at + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);

  return new Blob([header, samples], { type: "audio/wav" });
}
