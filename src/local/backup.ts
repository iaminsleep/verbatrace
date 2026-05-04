import { unzipSync, zipSync } from "fflate";
import {
  db,
  type BookmarkRow,
  type FileRow,
  type MediaRow,
  type PcmRow,
  type ProjectRow,
  type SegmentRow,
  type SpeakerRow,
  type TagRow,
  type WordRow,
} from "./db";

const FORMAT = "verbatrace-backup";
const VERSION = 1;
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;

type BackupFile = Omit<FileRow, "peaks"> & { peaks?: number[] };

interface BackupManifest {
  format: typeof FORMAT;
  version: typeof VERSION;
  created_at: string;
  projects: ProjectRow[];
  tags: TagRow[];
  files: BackupFile[];
  words: WordRow[];
  segments: SegmentRow[];
  speakers: SpeakerRow[];
  bookmarks: BookmarkRow[];
  media: Array<{ file_id: number; mime: string }>;
  pcm: Array<{ file_id: number; index: number }>;
}

function json(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function fromJson<T>(bytes: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function bytesOf(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
}

function entry(entries: Record<string, Uint8Array>, path: string): Uint8Array {
  const value = entries[path];
  if (!value) throw new Error(`Backup is missing ${path}`);
  return value;
}

function requireArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Backup field ${name} is invalid`);
  return value;
}

function validateManifest(value: unknown): asserts value is BackupManifest {
  if (!value || typeof value !== "object") throw new Error("Backup manifest is invalid");
  const manifest = value as Partial<BackupManifest>;
  if (manifest.format !== FORMAT || manifest.version !== VERSION) {
    throw new Error("This backup was made by an incompatible Verbatrace version");
  }
  for (const name of [
    "projects",
    "tags",
    "files",
    "words",
    "segments",
    "speakers",
    "bookmarks",
    "media",
    "pcm",
  ] as const) {
    requireArray(manifest[name], name);
  }
}

function fileWithSerializablePeaks(file: FileRow): BackupFile {
  const { peaks, ...rest } = file;
  return { ...rest, ...(peaks ? { peaks: Array.from(peaks) } : {}) };
}

export async function exportBackup(): Promise<Blob> {
  const [projects, tags, files, words, segments, speakers, bookmarks, media, pcm] =
    await Promise.all([
      db.projects.toArray(),
      db.tags.toArray(),
      db.files.toArray(),
      db.words.toArray(),
      db.segments.toArray(),
      db.speakers.toArray(),
      db.bookmarks.toArray(),
      db.media.toArray(),
      db.pcm.toArray(),
    ]);

  const entries: Record<string, Uint8Array> = {};
  entries["manifest.json"] = json({
    format: FORMAT,
    version: VERSION,
    created_at: new Date().toISOString(),
    projects,
    tags,
    files: files.map(fileWithSerializablePeaks),
    words,
    segments,
    speakers,
    bookmarks,
    media: media.map(({ file_id, mime }) => ({ file_id, mime })),
    pcm: pcm.map(({ file_id, index }) => ({ file_id, index })),
  } satisfies BackupManifest);

  for (const row of media) {
    entries[`media/${row.file_id}.bin`] = new Uint8Array(await row.blob.arrayBuffer());
  }
  for (const row of pcm) {
    entries[`pcm/${row.file_id}/${row.index}.bin`] = bytesOf(row.samples);
  }

  return new Blob([zipSync(entries, { level: 0 })], { type: "application/zip" });
}

export async function importBackup(blob: Blob): Promise<void> {
  if (blob.size > MAX_ARCHIVE_BYTES) throw new Error("Backup is too large");
  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const manifest = fromJson<unknown>(entry(entries, "manifest.json"));
  validateManifest(manifest);

  const mediaRows: MediaRow[] = manifest.media.map((row) => ({
    file_id: row.file_id,
    mime: row.mime,
    blob: new Blob([entry(entries, `media/${row.file_id}.bin`)], { type: row.mime }),
  }));
  const pcmRows: PcmRow[] = manifest.pcm.map((row) => {
    const bytes = entry(entries, `pcm/${row.file_id}/${row.index}.bin`);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return { file_id: row.file_id, index: row.index, samples: new Int16Array(buffer) };
  });
  const fileRows: FileRow[] = manifest.files.map(({ peaks, ...file }) => ({
    ...file,
    ...(peaks ? { peaks: new Uint8Array(peaks) } : {}),
  }));

  await db.transaction(
    "rw",
    [db.projects, db.tags, db.files, db.media, db.pcm, db.words, db.segments, db.speakers, db.bookmarks],
    async () => {
      await Promise.all([
        db.projects.clear(),
        db.tags.clear(),
        db.files.clear(),
        db.media.clear(),
        db.pcm.clear(),
        db.words.clear(),
        db.segments.clear(),
        db.speakers.clear(),
        db.bookmarks.clear(),
      ]);
      await db.projects.bulkAdd(manifest.projects);
      await db.tags.bulkAdd(manifest.tags);
      await db.files.bulkAdd(fileRows);
      await db.media.bulkAdd(mediaRows);
      await db.pcm.bulkAdd(pcmRows);
      await db.words.bulkAdd(manifest.words);
      await db.segments.bulkAdd(manifest.segments);
      await db.speakers.bulkAdd(manifest.speakers);
      await db.bookmarks.bulkAdd(manifest.bookmarks);
    },
  );
}

export function downloadBackup(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `verbatrace-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
