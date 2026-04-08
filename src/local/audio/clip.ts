

import { db, NotFoundError } from "../db";
import { decodeTo16kMono, encodeWav, toInt16 } from "./decode";
import { msToSamples, pcmSampleCount, readPcmRange } from "./pcm";

export async function clipToWav(
  fileId: number,
  startMs: number,
  endMs: number,
): Promise<Blob> {
  const from = Math.max(0, msToSamples(startMs));
  const to = Math.max(from, msToSamples(endMs));

  if ((await pcmSampleCount(fileId)) > 0) {
    const samples = await readPcmRange(fileId, from, to);
    return encodeWav(toInt16(samples));
  }

  const media = await db.media.get(fileId);
  if (!media) throw new NotFoundError("File");
  const file = await db.files.get(fileId);
  const whole = await decodeTo16kMono(media.blob, file?.filename);
  return encodeWav(toInt16(whole.subarray(from, Math.min(whole.length, to))));
}
