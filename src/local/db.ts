

import Dexie, { type Table } from "dexie";

export interface ProjectRow {
  id?: number;
  name: string;
  description: string | null;
  language: string;
  enable_diarization: boolean;
  num_speakers: number | null;
  created_at: string;
  tag_ids: number[];
}

export interface TagRow {
  id?: number;
  name: string;
  color: string;
}

export interface FileRow {
  id?: number;
  project_id: number;
  filename: string;
  size_bytes: number | null;
  duration_ms: number | null;
  status: "pending" | "processing" | "ready" | "error";
  stage: string | null;
  progress_percent: number | null;
  error_message: string | null;
  notes: string;
  created_at: string;

  done_seconds: number;

  peaks?: Uint8Array;
}

export interface MediaRow {
  file_id: number;
  blob: Blob;
  mime: string;
}

export interface PcmRow {
  file_id: number;
  index: number;
  samples: Int16Array;
}

export interface WordRow {
  id?: number;
  file_id: number;
  sequence_index: number;
  text: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
  speaker_id: number | null;
  segment_id: number | null;
}

export interface SegmentRow {
  id?: number;
  file_id: number;
  segment_index: number;
  text: string;
  start_ms: number;
  end_ms: number;
  speaker_id: number | null;
  flagged: boolean;
}

export interface SpeakerRow {
  id?: number;
  file_id: number;
  speaker_code: string;
  display_name: string | null;
  color: string | null;
}

export interface BookmarkRow {
  id?: number;
  file_id: number;
  start_ms: number;
  end_ms: number | null;
  quote: string;
  note: string | null;
  created_at: string;
}

class VerbatraceDb extends Dexie {
  projects!: Table<ProjectRow, number>;
  tags!: Table<TagRow, number>;
  files!: Table<FileRow, number>;
  media!: Table<MediaRow, number>;
  pcm!: Table<PcmRow, [number, number]>;
  words!: Table<WordRow, number>;
  segments!: Table<SegmentRow, number>;
  speakers!: Table<SpeakerRow, number>;
  bookmarks!: Table<BookmarkRow, number>;

  constructor() {
    super("verbatrace");
    const schema = {

      projects: "++id, name, created_at, *tag_ids",
      tags: "++id, name",
      files: "++id, project_id, status, created_at",
      media: "file_id",

      pcm: "[file_id+index], file_id",
      words: "++id, [file_id+sequence_index], file_id, segment_id",
      segments: "++id, [file_id+segment_index], file_id",
      speakers: "++id, file_id",
      bookmarks: "++id, file_id, start_ms",
    };

    this.version(1).stores(schema);

    this.version(2)
      .stores(schema)
      .upgrade(async (transaction) => {
        await transaction
          .table("projects")
          .toCollection()
          .modify((project: ProjectRow) => {
            project.tag_ids ??= [];
          });
        await transaction
          .table("files")
          .toCollection()
          .modify((file: FileRow) => {
            file.notes ??= "";
            file.done_seconds ??= 0;
          });
      });
  }
}

export const db = new VerbatraceDb();

export const nowIso = (): string => new Date().toISOString();

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

export class RecordingBusyError extends Error {
  constructor() {
    super("Cannot delete a recording while it is processing");
    this.name = "RecordingBusyError";
  }
}

export async function deleteFileCascade(fileId: number): Promise<{ projectDeleted: boolean }> {
  return db.transaction(
    "rw",
    [db.projects, db.files, db.media, db.pcm, db.words, db.segments, db.speakers, db.bookmarks],
    async () => {
      const file = await db.files.get(fileId);
      if (!file) return { projectDeleted: false };
      if (file.status === "processing") throw new RecordingBusyError();
      await db.words.where("file_id").equals(fileId).delete();
      await db.segments.where("file_id").equals(fileId).delete();
      await db.speakers.where("file_id").equals(fileId).delete();
      await db.bookmarks.where("file_id").equals(fileId).delete();
      await db.pcm.where("file_id").equals(fileId).delete();
      await db.media.delete(fileId);
      await db.files.delete(fileId);
      const remaining = await db.files.where("project_id").equals(file.project_id).count();
      const projectDeleted = remaining === 0;
      if (projectDeleted) await db.projects.delete(file.project_id);
      return { projectDeleted };
    },
  );
}
