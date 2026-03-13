

import { db, type PcmRow } from "../db";
import { CHUNK_SAMPLES, SAMPLE_RATE, monoInt16, toFloat32 } from "./decode";

export async function writePcm(fileId: number, audio: AudioBuffer): Promise<number> {
  const rows: PcmRow[] = [];
  for (let at = 0, index = 0; at < audio.length; at += CHUNK_SAMPLES, index += 1) {
    rows.push({ file_id: fileId, index, samples: monoInt16(audio, at, at + CHUNK_SAMPLES) });
  }
  await db.transaction("rw", db.pcm, async () => {
    await db.pcm.where("file_id").equals(fileId).delete();
    await db.pcm.bulkPut(rows);
  });
  return audio.length;
}

export async function pcmSampleCount(fileId: number): Promise<number> {
  const rows = await db.pcm.where("file_id").equals(fileId).toArray();
  return rows.reduce((sum, row) => sum + row.samples.length, 0);
}

export async function readPcmRange(
  fileId: number,
  startSample: number,
  endSample: number,
): Promise<Float32Array> {
  const firstChunk = Math.floor(startSample / CHUNK_SAMPLES);
  const lastChunk = Math.floor((endSample - 1) / CHUNK_SAMPLES);

  const rows = await db.pcm
    .where("[file_id+index]")
    .between([fileId, firstChunk], [fileId, lastChunk], true, true)
    .toArray();
  rows.sort((a, b) => a.index - b.index);

  const out = new Float32Array(Math.max(0, endSample - startSample));
  for (const row of rows) {
    const chunkStart = row.index * CHUNK_SAMPLES;
    const from = Math.max(0, startSample - chunkStart);
    const to = Math.min(row.samples.length, endSample - chunkStart);
    if (to <= from) continue;
    const slice = toFloat32(row.samples.subarray(from, to));
    out.set(slice, chunkStart + from - startSample);
  }
  return out;
}

export const msToSamples = (ms: number): number => Math.round((ms / 1000) * SAMPLE_RATE);
