

import { db } from "../db";

interface ExportBlock {
  speakerName: string;
  text: string;
  startMs: number;
  endMs: number;
}

const PAUSE_THRESHOLD_MS = 1500;

export interface ExportSource {
  filename: string;
  projectName: string;
  createdAt: string;
  blocks: ExportBlock[];
}

export async function loadExportSource(fileId: number): Promise<ExportSource> {
  const [file, segments, words, speakers] = await Promise.all([
    db.files.get(fileId),
    db.segments
      .where("[file_id+segment_index]")
      .between([fileId, -Infinity], [fileId, Infinity])
      .toArray(),
    db.words
      .where("[file_id+sequence_index]")
      .between([fileId, -Infinity], [fileId, Infinity])
      .toArray(),
    db.speakers.where("file_id").equals(fileId).toArray(),
  ]);

  const project = file ? await db.projects.get(file.project_id) : undefined;
  const nameOf = new Map<number, string>();
  for (const speaker of speakers) {
    nameOf.set(speaker.id!, speaker.display_name || speaker.speaker_code);
  }
  const label = (speakerId: number | null): string =>
    speakerId != null ? nameOf.get(speakerId) ?? "" : "";

  let blocks: ExportBlock[];
  if (segments.length > 0) {
    blocks = segments.map((segment) => ({
      speakerName: label(segment.speaker_id),
      text: segment.text,
      startMs: segment.start_ms,
      endMs: segment.end_ms,
    }));
  } else {
    blocks = [];
    let current: string[] = [];
    let speakerId: number | null = null;
    let startMs = 0;
    let endMs = 0;

    for (const [at, word] of words.entries()) {
      if (at === 0) {
        current = [word.text];
        speakerId = word.speaker_id;
        startMs = word.start_ms;
        endMs = word.end_ms;
        continue;
      }
      const previous = words[at - 1];
      const pause = word.start_ms - previous.end_ms;
      if (word.speaker_id !== previous.speaker_id || pause > PAUSE_THRESHOLD_MS) {
        blocks.push({ speakerName: label(speakerId), text: current.join(" "), startMs, endMs });
        current = [];
        speakerId = word.speaker_id;
        startMs = word.start_ms;
      }
      current.push(word.text);
      endMs = word.end_ms;
    }
    if (current.length > 0) {
      blocks.push({ speakerName: label(speakerId), text: current.join(" "), startMs, endMs });
    }
  }

  return {
    filename: file?.filename ?? "transcript",
    projectName: project?.name ?? file?.filename ?? "Transcript",
    createdAt: file?.created_at ?? new Date().toISOString(),
    blocks,
  };
}

export function formatTimecode(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(totalSec / 3600))}:${pad(Math.floor((totalSec % 3600) / 60))}:${pad(totalSec % 60)}`;
}

export function formatSrtTime(ms: number): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const hours = Math.floor(ms / 3_600_000);
  let rest = ms % 3_600_000;
  const minutes = Math.floor(rest / 60_000);
  rest %= 60_000;
  const seconds = Math.floor(rest / 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(rest % 1000, 3)}`;
}

export function baseName(filename: string): string {
  const at = filename.lastIndexOf(".");
  return at > 0 ? filename.slice(0, at) : filename;
}
