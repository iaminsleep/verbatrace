import { logEvent } from "../local/diagnostics";
import type {
  FileStatus,
  SearchResult,
  Segment,
  Speaker,
  TranscriptResponse,
  Word,
} from "../types";
import { db, NotFoundError, type SpeakerRow, type WordRow } from "../local/db";
import { clipToWav } from "../local/audio/clip";

function toWord(row: WordRow): Word {
  return {
    id: row.id!,
    sequence_index: row.sequence_index,
    text: row.text,
    start_ms: row.start_ms,
    end_ms: row.end_ms,
    speaker_id: row.speaker_id,
    confidence: row.confidence,
  };
}

function toSpeaker(row: SpeakerRow): Speaker {
  return {
    id: row.id!,
    speaker_code: row.speaker_code,
    display_name: row.display_name,
    color: row.color,
  };
}

function wordsOf(fileId: number) {
  return db.words
    .where("[file_id+sequence_index]")
    .between([fileId, -Infinity], [fileId, Infinity])
    .toArray();
}

export async function getFileStatus(fileId: number): Promise<FileStatus> {
  const file = await db.files.get(fileId);
  if (!file) throw new NotFoundError("File");
  const project = await db.projects.get(file.project_id);
  return {
    status: file.status,
    stage: file.stage,
    progress_percent: file.progress_percent,
    filename: file.filename,
    size_bytes: file.size_bytes,
    created_at: file.created_at,
    project_id: file.project_id,
    project_name: project?.name ?? null,
    error_message: file.error_message,
    enable_diarization: project?.enable_diarization ?? null,
  };
}

export async function getTranscript(fileId: number): Promise<TranscriptResponse> {
  const [wordRows, segmentRows, speakerRows] = await Promise.all([
    wordsOf(fileId),
    db.segments
      .where("[file_id+segment_index]")
      .between([fileId, -Infinity], [fileId, Infinity])
      .toArray(),
    db.speakers.where("file_id").equals(fileId).toArray(),
  ]);

  const words = wordRows.map(toWord);

  const bySegment = new Map<number, Word[]>();
  for (const [at, row] of wordRows.entries()) {
    if (row.segment_id == null) continue;
    const list = bySegment.get(row.segment_id);
    if (list) list.push(words[at]);
    else bySegment.set(row.segment_id, [words[at]]);
  }

  const segments: Segment[] = segmentRows.map((row) => ({
    id: row.id!,
    segment_index: row.segment_index,
    text: row.text,
    start_ms: row.start_ms,
    end_ms: row.end_ms,
    speaker_id: row.speaker_id,
    flagged: row.flagged,
    words: bySegment.get(row.id!) ?? [],
  }));

  return {
    words,
    speakers: speakerRows.map(toSpeaker),
    duration_ms: words.length > 0 ? words[words.length - 1].end_ms : 0,
    segments,
  };
}

const audioUrls = new Map<number, string>();

export async function getAudioUrl(
  fileId: number,
): Promise<{ url: string; expires_in_seconds: number }> {
  const held = audioUrls.get(fileId);
  if (held) return { url: held, expires_in_seconds: 0 };

  const media = await db.media.get(fileId);
  if (!media) throw new NotFoundError("File");
  const url = URL.createObjectURL(media.blob);
  audioUrls.set(fileId, url);

  return { url, expires_in_seconds: 0 };
}

export function releaseAudioUrl(fileId: number): void {
  const held = audioUrls.get(fileId);
  if (!held) return;
  URL.revokeObjectURL(held);
  audioUrls.delete(fileId);
}

export async function getNotes(fileId: number): Promise<{ notes: string }> {
  const file = await db.files.get(fileId);
  return { notes: file?.notes ?? "" };
}

export async function saveNotes(fileId: number, notes: string): Promise<void> {
  await db.files.update(fileId, { notes });
  logEvent("notes.save", { fileId });
}

const CONTEXT_WORDS = 5;
const MAX_MATCHES = 50;

function normalizeSearch(value: string): string {
  return value.trim().normalize("NFC").toLowerCase().replace(/\s+/g, " ");
}

export async function searchTranscript(
  fileId: number,
  q: string,
): Promise<SearchResult[]> {
  const needle = normalizeSearch(q);
  if (!needle) return [];

  const words = await wordsOf(fileId);
  const parts: string[] = [];
  const offsets: { start: number; end: number; wordIndex: number }[] = [];
  let end = 0;
  for (const [wordIndex, word] of words.entries()) {
    const normalized = normalizeSearch(word.text);
    if (!normalized) continue;
    const start = end + (parts.length ? 1 : 0);
    end = start + normalized.length;
    offsets.push({ start, end, wordIndex });
    parts.push(normalized);
  }
  const text = parts.join(" ");
  const results: SearchResult[] = [];
  let first = 0;
  let last = 0;
  let from = 0;

  while (results.length < MAX_MATCHES) {
    const match = text.indexOf(needle, from);
    if (match < 0) break;

    while (offsets[first].end <= match) first += 1;
    last = Math.max(first, last);
    while (offsets[last].end < match + needle.length) last += 1;
    from = offsets[first].end;

    const startWord = offsets[first].wordIndex;
    const endWord = offsets[last].wordIndex;
    const anchor = words[startWord];
    const matched = words.slice(startWord, endWord + 1);
    results.push({
      word_id: anchor.id!,
      text: matched.map((word) => word.text.trim()).join(" "),
      start_ms: anchor.start_ms,
      sequence_index: anchor.sequence_index,
      word_indices: matched.map((word) => word.sequence_index),
      context_before: words
        .slice(Math.max(0, startWord - CONTEXT_WORDS), startWord)
        .map((word) => word.text)
        .join(" "),
      context_after: words
        .slice(endWord + 1, endWord + 1 + CONTEXT_WORDS)
        .map((word) => word.text)
        .join(" "),
    });
  }
  return results;
}

export async function updateSpeaker(
  speakerId: number,
  displayName: string,
): Promise<Speaker> {
  await db.speakers.update(speakerId, { display_name: displayName });
  const row = await db.speakers.get(speakerId);
  if (!row) throw new NotFoundError("Speaker");
  logEvent("speaker.rename", { fileId: row.file_id, speakerId });
  return toSpeaker(row);
}

export async function exportClip(
  fileId: number,
  startMs: number,
  endMs: number,
): Promise<Blob> {
  return clipToWav(fileId, startMs, endMs);
}

export async function reassignSegmentSpeaker(
  segmentId: number,
  speakerId: number | null,
): Promise<Segment> {
  const row = await db.segments.get(segmentId);
  if (!row) throw new NotFoundError("Segment");

  await db.transaction("rw", [db.segments, db.words], async () => {
    await db.segments.update(segmentId, { speaker_id: speakerId });
    await db.words.where("segment_id").equals(segmentId).modify({ speaker_id: speakerId });
  });

  logEvent("speaker.assign", { fileId: row.file_id, segmentId, speakerId });
  const words = await db.words.where("segment_id").equals(segmentId).toArray();
  words.sort((a, b) => a.sequence_index - b.sequence_index);

  return {
    id: row.id!,
    segment_index: row.segment_index,
    text: row.text,
    start_ms: row.start_ms,
    end_ms: row.end_ms,
    speaker_id: speakerId,
    flagged: row.flagged,
    words: words.map(toWord),
  };
}
