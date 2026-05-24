import { Ellipsis } from "lucide-react";
import { memo, useEffect } from "react";
import { cn } from "../../lib/cn";
import { useT } from "../../i18n";
import { Button } from "../ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/menu";
import type { Speaker, Word } from "../../types";
import { applyIfInRange } from "./activeWord";
import { speakerVar, SpeakerChip } from "./SpeakerChip";
import type { Turn } from "./model";

interface Props {
  turn: Turn;
  words: Word[];
  speaker: { speaker: import("../../types").Speaker; index: number } | undefined;

  found: Set<number> | null;

  clip: { startMs: number; endMs: number } | null;
  speakers: Speaker[];
  onReassign?: (turnIndex: number, speakerId: number | null) => void;
  onRename?: (speakerId: number, name: string) => void;
}

export const TurnBlock = memo(function TurnBlock({
  turn,
  words,
  speaker,
  found,
  clip,
  speakers,
  onReassign,
  onRename,
}: Props) {
  const t = useT();

  useEffect(() => {
    applyIfInRange(turn.from, turn.to);
  }, [turn.from, turn.to]);

  const color = speaker ? speakerVar(speaker.index) : undefined;
  const nodes: React.ReactNode[] = [];
  for (let at = turn.from; at <= turn.to; at += 1) {
    const word = words[at];
    if (!word) continue;
    nodes.push(
      <span
        key={word.id}
        data-i={at}
        className="word"
        data-found={found?.has(at) ? "true" : undefined}
        data-picked={clip && word.end_ms > clip.startMs && word.start_ms < clip.endMs ? "true" : undefined}
        data-unsure={word.confidence < 0.5 ? "true" : undefined}
      >
        {word.text}
      </span>,
      " ",
    );
  }

  const seconds = Math.floor((words[turn.from]?.start_ms ?? 0) / 1000);
  const timestamp = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div
      data-turn={turn.from}
      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 border-b border-border/55 py-2 sm:gap-x-4 sm:py-3"
      style={color ? ({ "--turn": color } as React.CSSProperties) : undefined}
    >
      <button type="button" data-seek={turn.from} data-control="" aria-label={`${t.workspace.seek} ${timestamp}`}
        className="min-h-8 min-w-11 rounded-sm px-1 text-left font-mono text-xs tabular-nums text-muted-foreground hover:text-accent">
        {timestamp}
      </button>
      <div className="min-w-0">
        {turn.showSpeaker && speaker ? (
          <SpeakerChip speaker={speaker.speaker} index={speaker.index} onRename={onRename} />
        ) : null}
        <p className={cn("break-words text-[15px] leading-[1.8] text-foreground sm:text-base", speaker && "border-l-2 pl-2")}
          style={speaker ? { borderColor: "var(--turn)" } : undefined}>
          {nodes}
        </p>
      </div>
      {speakers.length > 0 && turn.id != null ? (
        <Menu>
          <MenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label={t.editor.reassignSpeaker}><Ellipsis /></Button>
          </MenuTrigger>
          <MenuContent>
            {speakers.map((option, index) => (
              <MenuItem key={option.id} checked={option.id === turn.speakerId} onSelect={() => onReassign?.(turn.from, option.id)}>
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: speakerVar(index) }} />
                <span className="min-w-0 break-words">{option.display_name || option.speaker_code}</span>
              </MenuItem>
            ))}
            <MenuItem disabled={turn.speakerId == null} onSelect={() => onReassign?.(turn.from, null)}>{t.editor.removeSpeaker}</MenuItem>
          </MenuContent>
        </Menu>
      ) : null}
    </div>
  );
});
