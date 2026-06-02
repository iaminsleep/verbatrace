import { Bookmark as BookmarkIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { useT } from "../../i18n";
import { logEvent } from "../../local/diagnostics";
import { clock } from "../../local/player/clock";
import { player } from "../../local/player/audio";
import type { Bookmark } from "../../types";
import { Button } from "../ui/button";
import { Textarea } from "../ui/input";

function stamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  bookmarks: Bookmark[];
  onCreate: (body: { start_ms: number; note?: string | null }) => void;
  onDelete: (id: number) => void;
}

export function BookmarksPanel({ bookmarks, onCreate, onDelete }: Props) {
  const t = useT();
  const [note, setNote] = useState("");

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex flex-col gap-2">
        <Textarea
          rows={2}
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          aria-label={t.editor.bookmarkNotePlaceholder}
          placeholder={t.editor.bookmarkNotePlaceholder}
        />
        <Button
          size="sm"
          onClick={() => {

            onCreate({ start_ms: Math.round(clock.now), note: note.trim() || null });
            setNote("");
          }}
        >
          <BookmarkIcon />
          {t.editor.bookmarkAdd}
        </Button>
      </div>

      {bookmarks.length === 0 ? (
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          {t.editor.bookmarksEmpty}
        </p>
      ) : (
        <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1">
          {bookmarks.map((mark) => (
            <li key={mark.id} className="group flex items-start gap-2 rounded-md p-2 hover:bg-elevated">
              <button
                type="button"
                onClick={() => {
                  player.seek(mark.start_ms);
                  logEvent("player.seek", { via: "bookmark", timeMs: mark.start_ms, bookmarkId: mark.id });
                }}
                className="min-w-0 flex-1 text-left"
              >
                <span className="font-mono text-[12px] tabular-nums text-accent">
                  {stamp(mark.start_ms)}
                </span>
                {mark.note ? (
                  <span className="mt-0.5 block text-[13px] leading-snug text-foreground">
                    {mark.note}
                  </span>
                ) : null}
                {mark.quote ? (
                  <span className="mt-0.5 block line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                    {mark.quote}
                  </span>
                ) : null}
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t.common.delete}
                className="hover:text-destructive"
                onClick={() => onDelete(mark.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
