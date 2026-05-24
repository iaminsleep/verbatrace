import { useT } from "../../i18n";
import { cn } from "../../lib/cn";
import type { Speaker } from "../../types";
import { speakerVar } from "../transcript/SpeakerChip";

interface Props {
  speakers: Speaker[];
  activeId: number | null;
  onChange: (id: number | null) => void;
}

export function SpeakersBar({ speakers, activeId, onChange }: Props) {
  const t = useT();
  if (speakers.length === 0) return null;

  return (
    <div className="flex min-w-0 max-w-full flex-nowrap items-center overflow-x-auto gap-1.5">
      <span className="mr-1 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
        {t.editor.speakers(speakers.length)}
      </span>
      {speakers.map((speaker, index) => {
        const active = activeId === speaker.id;
        const color = speakerVar(index);
        return (
          <button
            key={speaker.id}
            type="button"
            onClick={() => onChange(active ? null : speaker.id)}
            aria-pressed={active}
            data-control=""
            className={cn(
              "inline-flex min-h-8 max-w-48 shrink-0 items-center gap-1.5 rounded-sm border border-border px-2 py-0.5",
              "text-[11px] font-medium transition-colors",
              active ? "border-accent bg-accent-soft text-foreground" : "hover:bg-elevated",
            )}
          >
            <span aria-hidden style={{ backgroundColor: color }} className="size-2 rounded-full" />
            <span className="truncate">{speaker.display_name || speaker.speaker_code}</span>
          </button>
        );
      })}
    </div>
  );
}
