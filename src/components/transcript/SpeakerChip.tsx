import { memo, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import type { Speaker } from "../../types";

const SPEAKER_SLOTS = 7;

export function speakerVar(index: number): string {
  return index < SPEAKER_SLOTS
    ? `var(--color-speaker-${index + 1})`
    : "var(--color-speaker-none)";
}

interface Props {
  speaker: Speaker;
  index: number;
  onRename?: (speakerId: number, name: string) => void;
}

export const SpeakerChip = memo(function SpeakerChip({ speaker, index, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const label = speaker.display_name || speaker.speaker_code;
  const color = speakerVar(index);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== speaker.display_name) onRename?.(speaker.id, trimmed);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setEditing(false);
        }}
        aria-label={label}
        style={{ borderColor: color }}
        className={cn(
          "rounded-sm border bg-transparent px-2 py-0.5",
          "text-[11px] font-semibold uppercase tracking-wide outline-none",
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(speaker.display_name ?? "");
        setEditing(true);
      }}
      data-control=""
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-foreground",
        "text-[11px] font-semibold uppercase tracking-wide",
        "transition-opacity hover:opacity-70",
      )}
    >
      <span
        aria-hidden
        style={{ backgroundColor: color }}
        className="size-2 shrink-0 rounded-full"
      />
      <span className="truncate">{label}</span>
    </button>
  );
});
