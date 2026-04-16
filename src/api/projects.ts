import type { AudioFile, Project, ProjectDetail, Tag } from "../types";
import { releaseAudioUrl } from "./transcript";
import {
  db,
  deleteFileCascade,
  nowIso,
  type FileRow,
  type ProjectRow,
} from "../local/db";

export class FileGoneError extends Error {
  constructor(readonly filename: string, cause: unknown) {
    super(`Файл «${filename}» не читается`, { cause });
    this.name = "FileGoneError";
  }
}

function toAudioFile(row: FileRow): AudioFile {
  return {
    id: row.id!,
    project_id: row.project_id,
    filename: row.filename,
    status: row.status,
    size_bytes: row.size_bytes,
    duration_ms: row.duration_ms,
    created_at: row.created_at,
  };
}

async function tagsOf(rows: ProjectRow[]): Promise<Map<number, Tag>> {
  const wanted = new Set<number>();
  for (const row of rows) for (const id of row.tag_ids) wanted.add(id);
  if (wanted.size === 0) return new Map();
  const found = await db.tags.bulkGet([...wanted]);
  const byId = new Map<number, Tag>();
  for (const tag of found) {
    if (tag?.id != null) byId.set(tag.id, { id: tag.id, name: tag.name, color: tag.color });
  }
  return byId;
}

function toProject(row: ProjectRow, byId: Map<number, Tag>): Project {
  return {
    id: row.id!,
    name: row.name,
    language: row.language,
    enable_diarization: row.enable_diarization,
    num_speakers: row.num_speakers,
    created_at: row.created_at,
    tags: row.tag_ids.map((id) => byId.get(id)).filter((t): t is Tag => t != null),
  };
}

export async function listLibrary(): Promise<ProjectDetail[]> {
  const [rows, files] = await Promise.all([
    db.projects.orderBy("created_at").reverse().toArray(),
    db.files.toArray(),
  ]);
  const byId = await tagsOf(rows);

  const filesOf = new Map<number, FileRow[]>();
  for (const file of files) {
    const list = filesOf.get(file.project_id);
    if (list) list.push(file);
    else filesOf.set(file.project_id, [file]);
  }

  return rows.filter((row) => filesOf.has(row.id!)).map((row) => {
    const mine = filesOf.get(row.id!)!;
    mine.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return { ...toProject(row, byId), audio_files: mine.map(toAudioFile) };
  });
}

export async function deleteAudioFile(fileId: number): Promise<{ projectDeleted: boolean }> {
  const result = await deleteFileCascade(fileId);
  releaseAudioUrl(fileId);
  return result;
}

export async function readRecording(file: File): Promise<Blob> {
  try {

    return new Blob([await file.arrayBuffer()], { type: file.type });
  } catch (error) {
    throw new FileGoneError(file.name, error);
  }
}

export async function createRecording(
  name: string,
  diarize: boolean,
  file: File,
  bytes: Blob,
): Promise<AudioFile> {
  const createdAt = nowIso();
  const row: Omit<FileRow, "project_id"> = {
    filename: file.name,
    size_bytes: file.size,
    duration_ms: null,
    status: "pending",
    stage: null,
    progress_percent: null,
    error_message: null,
    notes: "",
    created_at: createdAt,
    done_seconds: 0,
  };
  return db.transaction("rw", [db.projects, db.files, db.media], async () => {
    const projectId = await db.projects.add({
      name, language: "auto", enable_diarization: diarize,
      created_at: createdAt, description: null, num_speakers: null, tag_ids: [],
    });
    const recording = { ...row, project_id: projectId };
    const fileId = await db.files.add(recording);
    await db.media.put({ file_id: fileId, blob: bytes, mime: file.type });
    return toAudioFile({ ...recording, id: fileId });
  });
}
