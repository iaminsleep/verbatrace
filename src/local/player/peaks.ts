import { db } from "../db";

const BUCKETS = 1400;

export async function getPeaks(fileId: number): Promise<Uint8Array | null> {
  const file = await db.files.get(fileId);
  if (file?.peaks && file.peaks.length === BUCKETS) return file.peaks;

  const peaks = await computePeaks(fileId);
  if (!peaks) return null;
  await db.files.update(fileId, { peaks });
  return peaks;
}

async function computePeaks(fileId: number): Promise<Uint8Array | null> {
  const total = await db.pcm
    .where("file_id")
    .equals(fileId)
    .toArray()
    .then((rows) => rows.reduce((sum, row) => sum + row.samples.length, 0));
  if (total === 0) return null;

  const peaks = new Uint8Array(BUCKETS);
  const perBucket = total / BUCKETS;

  let offset = 0;
  const keys = await db.pcm.where("file_id").equals(fileId).primaryKeys();
  keys.sort((a, b) => (a as [number, number])[1] - (b as [number, number])[1]);

  for (const key of keys) {
    const row = await db.pcm.get(key as [number, number]);
    if (!row) continue;
    const { samples } = row;
    for (let at = 0; at < samples.length; at += 1) {
      const bucket = Math.min(BUCKETS - 1, Math.floor((offset + at) / perBucket));
      const value = Math.abs(samples[at]) >> 7;
      if (value > peaks[bucket]) peaks[bucket] = value;
    }
    offset += samples.length;
  }

  let loudest = 0;
  for (const value of peaks) if (value > loudest) loudest = value;
  if (loudest > 0 && loudest < 255) {
    const scale = 255 / loudest;
    for (let at = 0; at < peaks.length; at += 1) {
      peaks[at] = Math.min(255, Math.round(peaks[at] * scale));
    }
  }

  return peaks;
}
