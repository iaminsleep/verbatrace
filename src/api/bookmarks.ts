import type { Bookmark } from "../types";
import { logEvent } from "../local/diagnostics";
import { db, nowIso } from "../local/db";

async function extractQuote(
  fileId: number,
  startMs: number,
  endMs: number | null | undefined,
): Promise<string> {
  const limit = endMs ?? null;
  const words = await db.words
    .where("[file_id+sequence_index]")
    .between([fileId, -Infinity], [fileId, Infinity])
    .filter((w) =>
      limit === null
        ? w.start_ms >= startMs && w.start_ms <= startMs + 10_000
        : w.start_ms >= startMs && w.end_ms <= limit,
    )
    .toArray();
  return words.map((w) => w.text).join(" ");
}

export async function listBookmarks(fileId: number): Promise<Bookmark[]> {
  const rows = await db.bookmarks.where("file_id").equals(fileId).toArray();
  rows.sort((a, b) => a.start_ms - b.start_ms);
  return rows.map((row) => ({
    id: row.id!,
    audio_file_id: row.file_id,
    start_ms: row.start_ms,
    end_ms: row.end_ms,
    quote: row.quote,
    note: row.note,
    created_at: row.created_at,
  }));
}

export async function createBookmark(
  fileId: number,
  body: { start_ms: number; end_ms?: number | null; note?: string | null },
): Promise<Bookmark> {
  const quote = await extractQuote(fileId, body.start_ms, body.end_ms);
  const row = {
    file_id: fileId,
    start_ms: body.start_ms,
    end_ms: body.end_ms ?? null,
    quote,
    note: body.note ?? null,
    created_at: nowIso(),
  };
  const id = await db.bookmarks.add(row);
  logEvent("bookmark.create", { fileId, bookmarkId: id, timeMs: body.start_ms });
  return {
    id,
    audio_file_id: fileId,
    start_ms: row.start_ms,
    end_ms: row.end_ms,
    quote: row.quote,
    note: row.note,
    created_at: row.created_at,
  };
}

export async function deleteBookmark(bookmarkId: number): Promise<void> {
  await db.bookmarks.delete(bookmarkId);
  logEvent("bookmark.delete", { bookmarkId });
}
